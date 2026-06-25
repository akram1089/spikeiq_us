"""Keep IB market-data streaming healthy across US session open and reconnects."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Optional

from loguru import logger

from config import settings
from src.utils.market_hours import (
    REGULAR_OPEN_MINUTES,
    is_us_regular_session_open,
    is_us_weekday,
    us_market_et_now,
)

if TYPE_CHECKING:
    from src.connection_manager import ConnectionManager
    from src.market_data_service import MarketDataService


class MarketSessionCoordinator:
    """Auto-connect IB, subscribe at 9:30 ET, and heal broken streams during session."""

    def __init__(self, conn: "ConnectionManager", market_data_service: "MarketDataService"):
        self.conn = conn
        self.mds = market_data_service
        self._task: Optional[asyncio.Task] = None
        self._regular_was_open = False
        self._prep_done_date = None

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run(), name="MarketSessionCoordinator")
        logger.info("MarketSessionCoordinator started (US/Eastern auto-stream)")

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def _run(self) -> None:
        await asyncio.gather(
            self._ib_connection_watchdog(),
            self._session_scheduler(),
            self._streaming_health_watchdog(),
        )

    async def _ensure_streaming(self, *, force: bool = False, reason: str = "") -> bool:
        if not self.mds:
            return False
        if not self.conn.ib.isConnected():
            logger.info(f"Streaming skipped ({reason}): IB not connected")
            return False
        try:
            await self.mds.ensure_autonomous_streaming(force_resubscribe=force)
            stats = self.mds.subscription_stats()
            logger.info(
                f"Streaming ensure ({reason}): "
                f"{stats['active']}/{stats['queued']} IB subscription(s)"
            )
            return stats["active"] > 0
        except Exception as e:
            logger.error(f"Streaming ensure failed ({reason}): {e}")
            return False

    async def _ib_connection_watchdog(self) -> None:
        was_connected = False
        while True:
            try:
                await self.conn.connected_event.wait()
                if self.mds and self.conn.ib.isConnected():
                    await self._ensure_streaming(
                        force=was_connected,
                        reason="ib_reconnect" if was_connected else "ib_connect",
                    )
                was_connected = True
                while self.conn.ib.isConnected():
                    await asyncio.sleep(2)
                was_connected = False
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"IB connection watchdog error: {e}")
                await asyncio.sleep(5)

    async def _startup_bootstrap(self) -> None:
        max_attempts = int(settings.MARKET_STARTUP_RETRY_ATTEMPTS)
        delay = float(settings.MARKET_STARTUP_RETRY_SECONDS)
        for attempt in range(1, max_attempts + 1):
            if not self.conn.ib.isConnected():
                await self.conn.connect()
            if self.conn.ib.isConnected():
                ok = await self._ensure_streaming(
                    force=attempt > 1,
                    reason=f"startup_attempt_{attempt}",
                )
                if ok:
                    return
            if attempt < max_attempts:
                await asyncio.sleep(delay)
        logger.warning(
            f"Startup streaming bootstrap finished without active subscriptions "
            f"after {max_attempts} attempt(s)"
        )

    async def _session_scheduler(self) -> None:
        await self._startup_bootstrap()

        prep_minutes = int(settings.MARKET_OPEN_PREP_MINUTES)
        prep_start = REGULAR_OPEN_MINUTES - prep_minutes

        while True:
            try:
                await asyncio.sleep(15)
                now_et = us_market_et_now()
                today = now_et.date()
                total_min = now_et.hour * 60 + now_et.minute
                regular_open = is_us_regular_session_open(now_et)

                if (
                    is_us_weekday(now_et)
                    and prep_start <= total_min < REGULAR_OPEN_MINUTES
                    and self._prep_done_date != today
                ):
                    self._prep_done_date = today
                    logger.info(
                        f"US pre-open prep ({prep_minutes}m before 9:30 ET) — warming IB subscriptions"
                    )
                    if not self.conn.ib.isConnected():
                        await self.conn.connect()
                    await self._ensure_streaming(force=True, reason="pre_market_prep")

                if regular_open and not self._regular_was_open:
                    logger.success(
                        "US regular session open (9:30 ET) — force-starting market data stream"
                    )
                    if not self.conn.ib.isConnected():
                        await self.conn.connect()
                    await self._ensure_streaming(force=True, reason="market_open")

                self._regular_was_open = regular_open
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Session scheduler error: {e}")
                await asyncio.sleep(15)

    async def _streaming_health_watchdog(self) -> None:
        interval = float(settings.MARKET_STREAM_HEALTH_SECONDS)
        while True:
            try:
                await asyncio.sleep(interval)
                if not is_us_regular_session_open():
                    continue
                if not self.conn.ib.isConnected():
                    logger.warning("Regular session: IB disconnected — reconnecting")
                    await self.conn.connect()
                    continue
                stats = self.mds.subscription_stats()
                if stats["queued"] > 0 and stats["active"] < stats["queued"]:
                    logger.warning(
                        f"Regular session: streaming unhealthy "
                        f"({stats['active']}/{stats['queued']}) — resubscribing"
                    )
                    await self._ensure_streaming(force=True, reason="health_check")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Streaming health watchdog error: {e}")
