from loguru import logger

from src.queue.kafka_producer import kafka_producer

TOPIC = "security_master_updates"


def publish_security_master_update(
    *,
    instrument_id: int,
    symbol: str,
    asset_type: str,
    ibkr_conid: int | None,
    exchange: str | None,
    currency: str | None,
    is_active: bool,
    action: str,
) -> None:
    payload = {
        "instrument_id": instrument_id,
        "symbol": symbol,
        "asset_type": asset_type,
        "ibkr_conid": ibkr_conid,
        "exchange": exchange,
        "currency": currency,
        "is_active": is_active,
        "action": action,
    }
    try:
        kafka_producer.publish(TOPIC, str(instrument_id), payload)
        logger.debug(f"Published {action} for instrument {instrument_id} ({symbol})")
    except Exception as e:
        logger.error(f"Failed to publish security_master_updates for {instrument_id}: {e}")
