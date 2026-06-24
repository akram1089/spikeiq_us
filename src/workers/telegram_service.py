"""Telegram notification service.

Sends alerts via the Telegram Bot API.
"""

import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org/bot{token}"


def _is_configured(bot_token: str, chat_id: str) -> bool:
    return bool(bot_token and chat_id)


def normalize_telegram_chat_id(chat_id: str) -> str:
    """Normalize chat_id / @channel username for Telegram API."""
    raw = (chat_id or "").strip()
    if not raw:
        return ""
    if raw.startswith("@"):
        return raw
    if raw.lstrip("-").isdigit():
        return raw
    return f"@{raw.lstrip('@')}"


def send_telegram_message(bot_token: str, chat_id: str, message: str) -> bool:
    """Send a plain text or Markdown message via Telegram Bot API."""
    chat_id = normalize_telegram_chat_id(chat_id)
    if not _is_configured(bot_token, chat_id):
        logger.warning("Telegram not configured (missing bot_token or chat_id)")
        return False
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        resp = httpx.post(
            url,
            json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("ok"):
            logger.info(f"✅ Telegram message sent to {chat_id}")
            return True
        logger.error(f"Telegram API error for chat_id={chat_id}: {data}")
        return False
    except httpx.HTTPStatusError as e:
        detail = e.response.text if e.response is not None else str(e)
        logger.error(f"Telegram HTTP error for chat_id={chat_id}: {detail}")
        return False
    except Exception as e:
        logger.error(f"Telegram send failed for chat_id={chat_id}: {e}")
        return False


def send_alert_telegram(bot_token: str, chat_id: str, trigger_data: dict) -> bool:
    """Format and send an alert notification via Telegram."""
    symbol = trigger_data.get("symbol", "Unknown")
    condition = trigger_data.get("condition_type", "")
    threshold = trigger_data.get("threshold", 0)
    actual = trigger_data.get("actual_value", 0)
    name = trigger_data.get("name", "Alert")
    alert_type = trigger_data.get("alert_type", condition)

    # Emoji based on alert type
    emoji = "🔔"
    if "crash" in alert_type.lower() or "down" in alert_type.lower() or "below" in alert_type.lower():
        emoji = "🔴"
    elif "rally" in alert_type.lower() or "up" in alert_type.lower() or "above" in alert_type.lower():
        emoji = "🟢"
    elif "volume" in alert_type.lower():
        emoji = "📊"
    elif "hf" in alert_type.lower() or "flash" in alert_type.lower():
        emoji = "⚡"

    message = (
        f"{emoji} <b>Trade Alert: {symbol}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📌 <b>{name}</b>\n"
        f"📋 Condition: <code>{condition}</code>\n"
        f"🎯 Threshold: <b>{threshold:,.2f}</b>\n"
        f"📈 Actual: <b>{actual:,.2f}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"<i>SpikeIQ Alerts</i>"
    )

    return send_telegram_message(bot_token, chat_id, message)


def send_test_telegram(bot_token: str, chat_id: str) -> bool:
    """Send a test message to verify Telegram configuration."""
    message = (
        "✅ <b>SpikeIQ — Test Message</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "🎉 Your Telegram notifications are working correctly!\n"
        "<i>You will receive trade alerts here.</i>"
    )
    return send_telegram_message(bot_token, chat_id, message)


def send_price_spike_telegram(bot_token: str, chat_id: str, alert: dict) -> bool:
    """Format and send a price spike alert via Telegram Bot API."""
    symbol = alert.get("symbol", "Unknown")
    pct_change = float(alert.get("pct_change", 0))
    close = float(alert.get("close", 0))
    rsi = float(alert.get("rsi", 0))
    signal = alert.get("final_signal", "HOLD")
    confidence = int(alert.get("confidence_score", 0))

    emoji = "🔔"
    if "buy" in signal.lower():
        emoji = "🟢"
    elif "sell" in signal.lower():
        emoji = "🔴"

    sign = "+" if pct_change > 0 else ""
    message = (
        f"{emoji} <b>Price Spike Alert: {symbol}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📈 <b>Signal: {signal}</b> (Confidence: {confidence}/10)\n"
        f"📊 Pct Change: <b>{sign}{pct_change:,.2f}%</b>\n"
        f"💰 Close Price: <b>₹{close:,.2f}</b>\n"
        f"📉 RSI (14): <b>{rsi:.2f}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"<i>SpikeIQ Real-time Signals</i>"
    )
    return send_telegram_message(bot_token, chat_id, message)


def send_pre_spike_telegram(bot_token: str, chat_id: str, alert: dict) -> bool:
    """Format and send a pre-spike alert from v_pre_spike_alerts_ui via Telegram."""
    symbol = alert.get("symbol", "Unknown")
    price = float(alert.get("price", 0))
    signal_type = alert.get("signal_type", "WATCH")
    setup = alert.get("setup", "")
    alert_status = str(alert.get("alert_status", "")).upper()

    # Emoji by signal_type
    if "FUTURES" in signal_type.upper():
        type_emoji = "🚀"
    elif "INDEX" in signal_type.upper():
        type_emoji = "📊"
    else:
        type_emoji = "📈"

    # Emoji by status
    status_emoji = {"HOT": "🔥", "WATCH": "👀", "EARLY": "⏰", "ACTIVE": "⚡"}.get(alert_status, "🔔")

    message = (
        f"{type_emoji} <b>Pre-Spike Alert: {symbol}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📌 <b>Signal: {signal_type}</b>\n"
        f"⚙️ Setup: <b>{setup}</b>\n"
        f"{status_emoji} Status: <b>{alert_status}</b>\n"
        f"💰 Price: <b>${price:,.2f}</b>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"<i>SpikeIQ Pre-Spike Signals</i>"
    )
    return send_telegram_message(bot_token, chat_id, message)


def get_bot_info(bot_token: str) -> Optional[dict]:
    """Verify bot token by calling getMe endpoint."""
    try:
        url = f"https://api.telegram.org/bot{bot_token}/getMe"
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("ok"):
            return data.get("result")
        return None
    except Exception as e:
        logger.error(f"Failed to get bot info: {e}")
        return None
