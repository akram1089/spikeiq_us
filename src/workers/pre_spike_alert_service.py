"""Dispatch pre-spike watchlist alerts to WebSocket clients and Telegram."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import threading
from typing import Any, Dict, Optional

from loguru import logger

from config import settings
from src.workers.telegram_service import send_pre_spike_telegram, send_test_telegram

_market_data_service = None
_telegram_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pre-spike-telegram")
_alert_loop: asyncio.AbstractEventLoop | None = None
_alert_websockets: set[Any] = set()
_alert_lock = threading.Lock()


def set_market_data_service(service) -> None:
    global _market_data_service
    _market_data_service = service


def get_market_data_service():
    return _market_data_service


def _capture_alert_loop() -> None:
    global _alert_loop
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    if _alert_loop is None or _alert_loop.is_closed():
        _alert_loop = loop


def set_alert_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Bind the FastAPI/Uvicorn loop so background workers can push alert WebSockets."""
    global _alert_loop
    _alert_loop = loop


def register_alert_websocket(websocket: Any) -> int:
    """Register a browser connection for alert-only WebSocket pushes."""
    _capture_alert_loop()
    with _alert_lock:
        _alert_websockets.add(websocket)
        return len(_alert_websockets)


def unregister_alert_websocket(websocket: Any) -> int:
    with _alert_lock:
        _alert_websockets.discard(websocket)
        return len(_alert_websockets)


def alert_websocket_count() -> int:
    with _alert_lock:
        return len(_alert_websockets)


def _is_connected_websocket(websocket: Any) -> bool:
    try:
        from starlette.websockets import WebSocketState
    except Exception:
        return True

    state = getattr(websocket, "client_state", None)
    return state is None or state == WebSocketState.CONNECTED


def broadcast_alert_websockets(msg: Dict[str, Any]) -> int:
    """Send a JSON message to every dedicated alert WebSocket client."""
    loop = _alert_loop
    if not loop or loop.is_closed():
        return 0

    with _alert_lock:
        sockets = list(_alert_websockets)

    sent = 0
    stale: list[Any] = []
    for websocket in sockets:
        if not _is_connected_websocket(websocket):
            stale.append(websocket)
            continue
        try:
            asyncio.run_coroutine_threadsafe(websocket.send_json(msg), loop)
            sent += 1
        except Exception as e:
            stale.append(websocket)
            logger.warning(f"Failed to broadcast alert WebSocket message: {e}")

    if stale:
        with _alert_lock:
            for websocket in stale:
                _alert_websockets.discard(websocket)

    return sent


def serialize_pre_spike_alert(row: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, value in row.items():
        if hasattr(value, "isoformat"):
            out[key] = value.isoformat()
        elif hasattr(value, "as_tuple"):
            out[key] = float(value)
        else:
            out[key] = value
    return out


def build_test_pre_spike_alert() -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "alert_time": now.isoformat(),
        "symbol": "AAPL",
        "price": 198.50,
        "signal_type": "STOCK WATCH",
        "setup": "Volume Surge",
        "alert_status": "HOT",
        "version": int(now.timestamp() * 1000),
        "test": True,
    }


def _send_pre_spike_telegram_task(token: str, chat_id: str, payload: Dict[str, Any]) -> bool:
    try:
        sent = send_pre_spike_telegram(token, chat_id, payload)
        logger.info(
            f"Pre-spike Telegram completed symbol={payload.get('symbol')} sent={sent}"
        )
        return sent
    except Exception as e:
        logger.error(f"Pre-spike Telegram dispatch failed: {e}")
        return False


def dispatch_pre_spike_alert(
    alert: Dict[str, Any],
    *,
    wait_for_telegram: bool = False,
) -> Dict[str, Any]:
    """Broadcast a pre-spike alert immediately, then queue Telegram delivery."""
    payload = serialize_pre_spike_alert(alert)
    msg = {"type": "pre_spike_alert", "data": payload}

    alert_ws_clients = broadcast_alert_websockets(msg)
    ws_clients = alert_ws_clients

    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    telegram_configured = bool(token and chat_id)
    telegram_sent: Optional[bool] = False if not telegram_configured else None
    telegram_queued = False

    if telegram_configured:
        if wait_for_telegram:
            telegram_sent = _send_pre_spike_telegram_task(token, chat_id, payload)
        else:
            telegram_queued = True
            _telegram_executor.submit(_send_pre_spike_telegram_task, token, chat_id, payload)

    logger.info(
        f"Pre-spike alert dispatched symbol={payload.get('symbol')} "
        f"alert_ws_clients={alert_ws_clients} "
        f"telegram_queued={telegram_queued} telegram_sent={telegram_sent}"
    )
    return {
        "telegram_sent": telegram_sent,
        "telegram_configured": telegram_configured,
        "telegram_queued": telegram_queued,
        "ws_clients": ws_clients,
        "alert_ws_clients": alert_ws_clients,
        "legacy_ws_clients": 0,
        "alert": payload,
    }


def dispatch_test_telegram_only() -> Dict[str, Any]:
    """Send a plain Telegram connectivity test (no pre-spike formatting)."""
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return {"telegram_sent": False, "telegram_configured": False}
    sent = send_test_telegram(token, chat_id)
    return {"telegram_sent": sent, "telegram_configured": True}
