"""Dispatch pre-spike watchlist alerts to WebSocket clients and Telegram."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from loguru import logger

from config import settings
from src.workers.telegram_service import send_pre_spike_telegram, send_test_telegram

_market_data_service = None


def set_market_data_service(service) -> None:
    global _market_data_service
    _market_data_service = service


def get_market_data_service():
    return _market_data_service


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


def dispatch_pre_spike_alert(alert: Dict[str, Any]) -> Dict[str, Any]:
    """Broadcast a pre-spike alert to connected browsers and Telegram."""
    payload = serialize_pre_spike_alert(alert)
    msg = {"type": "pre_spike_alert", "data": payload}

    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    telegram_sent = False
    telegram_configured = bool(token and chat_id)

    if telegram_configured:
        try:
            telegram_sent = send_pre_spike_telegram(token, chat_id, payload)
        except Exception as e:
            logger.error(f"Pre-spike Telegram dispatch failed: {e}")

    ws_clients = 0
    mds = get_market_data_service()
    if mds:
        ws_clients = mds.broadcast_json(msg)

    logger.info(
        f"Pre-spike alert dispatched symbol={payload.get('symbol')} "
        f"telegram={telegram_sent} ws_clients={ws_clients}"
    )
    return {
        "telegram_sent": telegram_sent,
        "telegram_configured": telegram_configured,
        "ws_clients": ws_clients,
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
