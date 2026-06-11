import json
import threading
from confluent_kafka import Consumer, KafkaError
from loguru import logger
from config import settings
from src.db.clickhouse_client import ch_manager

class SubscriptionWorker(threading.Thread):
    """Background consumer worker running on a separate thread to handle user-subscriptions events."""
    
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

        db_client = ch_manager.get_client()

        while self.running:
            try:
                msg = self.consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() != KafkaError._PARTITION_EOF:
                        logger.error(f"Kafka consumer error: {msg.error()}")
                    continue

                # Process message
                payload = json.loads(msg.value().decode('utf-8'))
                user_id = payload.get("user_id")
                con_id = int(payload.get("con_id"))
                symbol = payload.get("symbol").upper()
                action = payload.get("action")
                is_active = 1 if action == "SUBSCRIBE" else 0

                logger.info(f"Processing subscription event: user={user_id}, symbol={symbol}, action={action}")

                # 1. Update ClickHouse User Subscriptions (ReplacingMergeTree handles upsert on merge)
                db_client.insert(
                    "user_subscriptions",
                    [[user_id, con_id, symbol, is_active]],
                    column_names=["user_id", "con_id", "symbol", "is_active"]
                )
                logger.success(f"ClickHouse subscription updated for {user_id} -> {symbol} ({action})")

                # 2. Ensure IB streaming for new symbols (unsubscribe is UI-only; pipeline keeps running)
                if action == "SUBSCRIBE":
                    self.market_data_service.request_streaming(symbol)

            except Exception as e:
                logger.error(f"Error processing subscription message: {e}")

        # Cleanup
        try:
            self.consumer.close()
        except Exception:
            pass
        logger.info("Subscription worker thread stopped.")

    def stop(self):
        logger.info("Stopping Subscription worker thread...")
        self.running = False
