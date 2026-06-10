import json
import threading
from datetime import datetime, timezone
from confluent_kafka import Consumer, KafkaError
from loguru import logger
from config import settings
from src.db.clickhouse_client import ch_manager

class TickIngestionWorker(threading.Thread):
    """Background consumer worker running on a separate thread to handle market-ticks ingestion into ClickHouse."""
    
    def __init__(self):
        super().__init__(daemon=True, name="TickIngestionWorker")
        self.bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS
        self.group_id = "tick-ingest-group"
        self.running = False
        self.consumer = None
        self.paused = False

    def run(self):
        logger.info("Starting Tick Ingestion Consumer worker thread...")
        self.running = True
        
        conf = {
            'bootstrap.servers': self.bootstrap_servers,
            'group.id': self.group_id,
            'auto.offset.reset': 'latest',
            'enable.auto.commit': True
        }
        
        try:
            self.consumer = Consumer(conf)
            self.consumer.subscribe(['market-ticks'])
            logger.success("Tick Ingestion Consumer worker connected and subscribed to 'market-ticks'.")
        except Exception as e:
            logger.critical(f"Failed to start Tick Ingestion Consumer: {e}")
            self.running = False
            return

        db_client = ch_manager.get_client()

        while self.running:
            if self.paused:
                import time
                time.sleep(1)
                continue
            try:
                msg = self.consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() != KafkaError._PARTITION_EOF:
                        logger.error(f"Kafka tick consumer error: {msg.error()}")
                    continue

                # Process tick message — full depth-of-book schema
                payload = json.loads(msg.value().decode('utf-8'))

                def _f(key, default=0.0):
                    """Safe float extraction from payload."""
                    v = payload.get(key)
                    return float(v) if v is not None else default

                def _i(key, default=0):
                    """Safe int extraction from payload."""
                    v = payload.get(key)
                    try:
                        return int(v) if v is not None else default
                    except (TypeError, ValueError):
                        return default

                instrument_token = _i("instrument_token")
                symbol           = payload.get("symbol", "")
                exchange         = payload.get("exchange", "SMART")
                ltp              = _f("ltp")
                volume           = _i("volume")
                buy_quantity     = _i("buy_quantity")
                sell_quantity    = _i("sell_quantity")
                open_price       = _f("open")
                high_price       = _f("high")
                low_price        = _f("low")
                close_price      = _f("close")
                change           = _f("change")
                oi               = _i("oi")
                # Depth level 1 (real IB data)
                bid_price_1      = _f("bid_price_1")
                bid_qty_1        = _i("bid_qty_1")
                bid_price_2      = _f("bid_price_2")
                bid_qty_2        = _i("bid_qty_2")
                bid_price_3      = _f("bid_price_3")
                bid_qty_3        = _i("bid_qty_3")
                bid_price_4      = _f("bid_price_4")
                bid_qty_4        = _i("bid_qty_4")
                bid_price_5      = _f("bid_price_5")
                bid_qty_5        = _i("bid_qty_5")
                ask_price_1      = _f("ask_price_1")
                ask_qty_1        = _i("ask_qty_1")
                ask_price_2      = _f("ask_price_2")
                ask_qty_2        = _i("ask_qty_2")
                ask_price_3      = _f("ask_price_3")
                ask_qty_3        = _i("ask_qty_3")
                ask_price_4      = _f("ask_price_4")
                ask_qty_4        = _i("ask_qty_4")
                ask_price_5      = _f("ask_price_5")
                ask_qty_5        = _i("ask_qty_5")

                # Parse timestamp — pass UTC datetime; ClickHouse column timezone
                # (America/New_York) handles EST/EDT display automatically
                ts_str = payload.get("ts")
                if ts_str:
                    try:
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    except Exception:
                        ts = datetime.now(timezone.utc)
                else:
                    ts = datetime.now(timezone.utc)

                # Insert full row into raw_ticks
                db_client.insert(
                    f"{settings.CLICKHOUSE_DB}.raw_ticks",
                    [[
                        instrument_token, symbol, exchange,
                        ltp, volume, buy_quantity, sell_quantity,
                        open_price, high_price, low_price, close_price, change,
                        oi,
                        bid_price_1, bid_qty_1,
                        bid_price_2, bid_qty_2,
                        bid_price_3, bid_qty_3,
                        bid_price_4, bid_qty_4,
                        bid_price_5, bid_qty_5,
                        ask_price_1, ask_qty_1,
                        ask_price_2, ask_qty_2,
                        ask_price_3, ask_qty_3,
                        ask_price_4, ask_qty_4,
                        ask_price_5, ask_qty_5,
                        ts
                    ]],
                    column_names=[
                        "instrument_token", "symbol", "exchange",
                        "ltp", "volume", "buy_quantity", "sell_quantity",
                        "open", "high", "low", "close", "change",
                        "oi",
                        "bid_price_1", "bid_qty_1",
                        "bid_price_2", "bid_qty_2",
                        "bid_price_3", "bid_qty_3",
                        "bid_price_4", "bid_qty_4",
                        "bid_price_5", "bid_qty_5",
                        "ask_price_1", "ask_qty_1",
                        "ask_price_2", "ask_qty_2",
                        "ask_price_3", "ask_qty_3",
                        "ask_price_4", "ask_qty_4",
                        "ask_price_5", "ask_qty_5",
                        "ts"
                    ],
                    settings={"async_insert": 1, "wait_for_async_insert": 0}
                )
                logger.debug(f"Ingested full tick for {symbol} ({instrument_token}) → raw_ticks")

            except Exception as e:
                logger.error(f"Error ingesting tick message: {e}")

        # Cleanup
        try:
            self.consumer.close()
        except Exception:
            pass
        logger.info("Tick Ingestion worker thread stopped.")

    def stop(self):
        logger.info("Stopping Tick Ingestion worker thread...")
        self.running = False

    def pause_ingestion(self):
        logger.info("Tick Ingestion Worker paused.")
        self.paused = True

    def resume_ingestion(self):
        logger.info("Tick Ingestion Worker resumed.")
        self.paused = False
