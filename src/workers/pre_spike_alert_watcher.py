"""Async alert stream: runs only while alert WebSocket clients are connected."""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from loguru import logger

from config import settings
from src.workers.pre_spike_alert_monitor import PreSpikeAlertMonitor
from src.workers.pre_spike_alert_service import alert_websocket_count

_monitor = PreSpikeAlertMonitor()
_stream_task: Optional[asyncio.Task] = None


def _watch_interval() -> float:
    return max(0.25, float(settings.PRE_SPIKE_ALERT_POLL_SECONDS))


async def send_alert_bootstrap(websocket: Any, *, limit: int = 50) -> None:
    """Push recent watchlist rows to a single client on connect (no Telegram/toast)."""
    try:
        rows = await asyncio.to_thread(_monitor.fetch_bootstrap_snapshot, limit)
        await websocket.send_json({"type": "pre_spike_alert_snapshot", "data": rows})
        logger.info(f"Sent pre-spike bootstrap snapshot with {len(rows)} row(s)")
    except Exception as e:
        logger.warning(f"Failed to send pre-spike bootstrap snapshot: {e}")


async def ensure_alert_stream_running() -> None:
    """Start the ClickHouse watch loop when the first alert WebSocket client connects."""
    global _stream_task
    if _stream_task and not _stream_task.done():
        return
    _stream_task = asyncio.create_task(_alert_stream_loop(), name="PreSpikeAlertStream")


async def maybe_stop_alert_stream() -> None:
    """Stop the watch loop when no alert WebSocket clients remain."""
    global _stream_task
    if alert_websocket_count() > 0:
        return
    if _stream_task and not _stream_task.done():
        _stream_task.cancel()
        try:
            await _stream_task
        except asyncio.CancelledError:
            pass
        logger.info("PreSpikeAlertStream stopped (no alert WebSocket clients)")
    _stream_task = None


async def _alert_stream_loop() -> None:
    logger.info("PreSpikeAlertStream started (WebSocket-driven, no background poll thread)")
    try:
        while alert_websocket_count() > 0:
            try:
                dispatched = await asyncio.to_thread(_monitor.poll_new_alerts)
                if dispatched:
                    logger.debug(f"PreSpikeAlertStream dispatched {dispatched} alert(s)")
            except Exception as e:
                logger.error(f"PreSpikeAlertStream error: {e}")
            await asyncio.sleep(_watch_interval())
    except asyncio.CancelledError:
        raise
    finally:
        logger.info("PreSpikeAlertStream loop exited")
