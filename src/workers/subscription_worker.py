import json
import threading
from confluent_kafka import Consumer, KafkaError
from loguru import logger
from config import settings
from src.db.clickhouse_client import ch_manager

class SubscriptionWorker(threading.Thread):
    """Background consumer worker for user-subscription events."""

    def __init__(self, market_data_service):
        super().__init__(daemon=True, name="SubscriptionWorker")
        self.market_data_service = market_data_service
        self.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS
        self.group_id = "subscription-ingest-group"
        self.running = False
        self.consumer = None

    def run(self):
        logger.info("Starting Subscription Consumer worker thread...")
        self.running = True

        conf = {
            'bootstrap.servers': self.bootstrap_servers,
            'group.id': self.group_id,
            'auto.offset.reset': 'earliest',
            'enable.auto.commit': True
        }

        try:
            self.consumer = Consumer(conf)
            self.consumer.subscribe(['user-subscriptions'])
            logger.success("Subscription Consumer worker connected and subscribed to 'user-subscriptions'.")
        except Exception as e:
            logger.critical(f"Failed to start Subscription Consumer: {e}")
            self.running = False
            return

        db_client = ch_manager.create_worker_client()

        while self.running:
            try:
                msg = self.consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() != KafkaError._PARTITION_EOF:
                        logger.error(f"Kafka consumer error: {msg.error()}")
                    continue

                payload = json.loads(msg.value().decode('utf-8'))
                user_id = payload.get("user_id")
                con_id = int(payload.get("con_id", 0))
                instrument_id = int(payload.get("instrument_id", 0))
                symbol = payload.get("symbol", "").upper()
                action = payload.get("action")
                is_subscribe = action == "SUBSCRIBE"

                logger.info(
                    f"Processing subscription: user={user_id}, instrument_id={instrument_id}, action={action}"
                )

                ch_manager.upsert_user_subscription(
                    user_id=user_id,
                    instrument_id=instrument_id,
                    con_id=con_id,
                    symbol=symbol,
                    is_active=is_subscribe,
                    client=db_client,
                )
                logger.success(f"ClickHouse subscription updated for {user_id} -> {symbol} ({action})")

                if is_subscribe and con_id:
                    from src.db.postgres import SessionLocal
                    from src.security_master.repository import InstrumentRepository

                    if instrument_id:
                        db = SessionLocal()
                        try:
                            inst = InstrumentRepository(db).get_by_id(instrument_id)
                            if inst:
                                ch_manager.upsert_catalog_from_instrument(inst, client=db_client)
                        finally:
                            db.close()
                    if instrument_id:
                        self.market_data_service.request_streaming(instrument_id)
                    elif symbol:
                        self.market_data_service.request_streaming_by_symbol(symbol)
                elif action == "UNSUBSCRIBE" and con_id:
                    ch_manager.deactivate_catalog_instrument(con_id, client=db_client)

            except Exception as e:
                logger.error(f"Error processing subscription message: {e}")

        try:
            self.consumer.close()
        except Exception:
            pass
        logger.info("Subscription worker thread stopped.")

    def stop(self):
        logger.info("Stopping Subscription worker thread...")
        self.running = False
