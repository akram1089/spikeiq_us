import json
import threading

from confluent_kafka import Consumer, KafkaError
from loguru import logger

from config import settings
from src.db.clickhouse_client import ch_manager

from src.db.clickhouse_client import ASSET_TYPE_TO_SEC_TYPE


class SecurityMasterSyncWorker(threading.Thread):
    """Syncs security_master_updates Kafka events into ClickHouse instruments replica."""

    def __init__(self, market_data_service=None):
        super().__init__(daemon=True, name="SecurityMasterSyncWorker")
        self.market_data_service = market_data_service
        self.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS
        self.group_id = "security-master-sync-group"
        self.running = False
        self.consumer = None

    def run(self):
        logger.info("Starting Security Master sync worker...")
        self.running = True
        conf = {
            "bootstrap.servers": self.bootstrap_servers,
            "group.id": self.group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": True,
        }
        try:
            self.consumer = Consumer(conf)
            self.consumer.subscribe(["security_master_updates"])
            logger.success("Subscribed to security_master_updates topic.")
        except Exception as e:
            logger.critical(f"Failed to start Security Master sync worker: {e}")
            self.running = False
            return

        self._db_client = ch_manager.create_worker_client()

        while self.running:
            try:
                msg = self.consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() != KafkaError._PARTITION_EOF:
                        logger.error(f"Kafka SM sync error: {msg.error()}")
                    continue
                payload = json.loads(msg.value().decode("utf-8"))
                self._upsert_clickhouse(payload)
            except Exception as e:
                logger.error(f"Error processing security_master_updates: {e}")

        try:
            self.consumer.close()
        except Exception:
            pass

    def _upsert_clickhouse(self, payload: dict) -> None:
        ibkr_conid = payload.get("ibkr_conid")
        if not ibkr_conid:
            logger.debug(
                f"Skipping ClickHouse sync for {payload.get('symbol')} — no ibkr_conid yet"
            )
            return

        asset_type = payload.get("asset_type", "STOCK").upper()
        sec_type = ASSET_TYPE_TO_SEC_TYPE.get(asset_type, "STK")
        is_active = 1 if payload.get("is_active", True) else 0

        client = self._db_client
        client.insert(
            "instruments",
            [[
                int(ibkr_conid),
                payload.get("symbol", ""),
                payload.get("exchange") or "SMART",
                sec_type,
                payload.get("currency") or "USD",
                payload.get("symbol", ""),
                is_active,
            ]],
            column_names=["con_id", "symbol", "exchange", "sec_type", "currency", "name", "is_active"],
        )
        logger.debug(
            f"Synced instrument {payload.get('instrument_id')} ({payload.get('symbol')}) to ClickHouse"
        )

        instrument_id = payload.get("instrument_id")
        if is_active and instrument_id and self.market_data_service:
            self.market_data_service.request_streaming(int(instrument_id))

    def stop(self):
        self.running = False
