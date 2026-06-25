"""Async alert stream: runs only while alert WebSocket clients are connected."""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from loguru import logger

from config import settings
from src.workers.pre_spike_alert_monitor import PreSpikeAlertMonitor
from src.workers.price_spike_alert_monitor import PriceSpikeAlertMonitor
from src.workers.pre_spike_alert_service import alert_websocket_count

_pre_monitor = PreSpikeAlertMonitor()
_price_monitor = PriceSpikeAlertMonitor()
_stream_task: Optional[asyncio.Task] = None


def _watch_interval() -> float:
    return max(0.25, float(settings.PRE_SPIKE_ALERT_POLL_SECONDS))


async def send_alert_bootstrap(websocket: Any, *, limit: int = 100) -> None:
    """Push recent DB rows for both dashboard tables on WebSocket connect."""
    try:
        pre_rows = await asyncio.to_thread(_pre_monitor.fetch_bootstrap_snapshot, limit)
        await websocket.send_json({"type": "pre_spike_alert_snapshot", "data": pre_rows})
        logger.info(f"Sent pre-spike bootstrap snapshot with {len(pre_rows)} row(s)")
    except Exception as e:
        logger.warning(f"Failed to send pre-spike bootstrap snapshot: {e}")

    try:
        spike_rows = await asyncio.to_thread(_price_monitor.fetch_bootstrap_snapshot, limit)
        await websocket.send_json({"type": "price_spike_snapshot", "data": spike_rows})
        logger.info(f"Sent price-spike bootstrap snapshot with {len(spike_rows)} row(s)")
    except Exception as e:
        logger.warning(f"Failed to send price-spike bootstrap snapshot: {e}")


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
    logger.info("Alert DB stream started (pre-spike + price-spike views)")
    try:
        while alert_websocket_count() > 0:
            try:
                pre_count = await asyncio.to_thread(_pre_monitor.poll_new_alerts)
                spike_count = await asyncio.to_thread(_price_monitor.poll_new_records)
                if pre_count or spike_count:
                    logger.debug(
                        f"Alert DB stream dispatched pre_spike={pre_count} price_spike={spike_count}"
                    )
            except Exception as e:
                logger.error(f"Alert DB stream error: {e}")
            await asyncio.sleep(_watch_interval())
    except asyncio.CancelledError:
        raise
    finally:
        logger.info("Alert DB stream loop exited")
