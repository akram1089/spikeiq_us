import time
import clickhouse_connect
from loguru import logger
from config import settings

class ClickHouseManager:
    """Manages ClickHouse connections, database creation, and schema migration/initialization."""
    
    def __init__(self):
        self.host = settings.CLICKHOUSE_HOST
        self.port = settings.CLICKHOUSE_PORT
        self.user = settings.CLICKHOUSE_USER
        self.password = settings.CLICKHOUSE_PASSWORD
        self.database = settings.CLICKHOUSE_DB
        self.client = None

    def get_client(self, select_db=True, force_reconnect=False):
        """Returns a connected clickhouse_connect client, retrying if necessary."""
        if force_reconnect:
            self.client = None

        if self.client is not None:
            try:
                self.client.command("SELECT 1")
                return self.client
            except Exception:
                logger.warning("Existing ClickHouse client connection lost, reconnecting...")
                self.client = None

        db = self.database if select_db else None
        retries = 10
        for i in range(retries):
            try:
                client = clickhouse_connect.get_client(
                    host=self.host,
                    port=self.port,
                    username=self.user,
                    password=self.password,
                    database=db
                )
                self.client = client
                logger.success(f"Connected to ClickHouse at {self.host}:{self.port} (database: {db})")
                return client
            except Exception as e:
                logger.warning(f"Failed to connect to ClickHouse (attempt {i+1}/{retries}): {e}")
                time.sleep(2)
        
        raise ConnectionError(f"Could not connect to ClickHouse at {self.host}:{self.port}")

    def initialize_schema(self):
        """Creates the database and necessary ReplacingMergeTree and MergeTree tables."""
        logger.info("Initializing ClickHouse database schema...")
        
        # 1. Connect without selecting target db to ensure database itself exists
        temp_client = self.get_client(select_db=False, force_reconnect=True)
        temp_client.command(f"CREATE DATABASE IF NOT EXISTS {self.database}")
        
        # 2. Reconnect with target db selected
        client = self.get_client(select_db=True, force_reconnect=True)
        
        # Users table
        client.command("""
        CREATE TABLE IF NOT EXISTS users (
            id String DEFAULT toString(generateUUIDv4()),
            username String,
            password_hash String,
            is_active UInt8 DEFAULT 1,
            created_at DateTime64(3) DEFAULT now64(3)
        ) ENGINE = ReplacingMergeTree(created_at)
        ORDER BY (username);
        """)
        logger.info("Users table verified.")

        # Instruments table
        client.command("""
        CREATE TABLE IF NOT EXISTS instruments (
            con_id UInt32,
            symbol LowCardinality(String),
            exchange LowCardinality(String) DEFAULT 'SMART',
            sec_type LowCardinality(String) DEFAULT 'STK',
            currency LowCardinality(String) DEFAULT 'USD',
            name String,
            is_active UInt8 DEFAULT 1,
            added_at DateTime64(3) DEFAULT now64(3)
        ) ENGINE = ReplacingMergeTree(added_at)
        ORDER BY (con_id);
        """)
        logger.info("Instruments table verified.")

        # Seed default production instruments on first deploy (drives autonomous streaming)
        instrument_count = client.query(
            f"SELECT count() FROM {self.database}.instruments"
        ).result_rows[0][0]
        if instrument_count == 0:
            default_instruments = [
                (3182352, "SPX", "CBOE", "IND", "USD", "S&P 500 Index"),
                (416843, "NDX", "NASDAQ", "IND", "USD", "NASDAQ 100 Index"),
                (18053702, "DJI", "CBOE", "IND", "USD", "Dow Jones Industrial Average"),
                (265598, "AAPL", "SMART", "STK", "USD", "Apple Inc."),
                (4815758, "NVDA", "SMART", "STK", "USD", "NVIDIA Corporation"),
                (272093, "MSFT", "SMART", "STK", "USD", "Microsoft Corporation"),
                (107113386, "META", "SMART", "STK", "USD", "Meta Platforms, Inc."),
                (208781907, "GOOGL", "SMART", "STK", "USD", "Alphabet Inc."),
                (76792991, "TSLA", "SMART", "STK", "USD", "Tesla, Inc."),
                (3691937, "AMZN", "SMART", "STK", "USD", "Amazon.com, Inc."),
                (8272386, "NFLX", "SMART", "STK", "USD", "Netflix, Inc."),
                (479361661, "COIN", "SMART", "STK", "USD", "Coinbase Global, Inc."),
                (651636257, "AVGO", "SMART", "STK", "USD", "Broadcom Inc."),
                (443831637, "PLTR", "SMART", "STK", "USD", "Palantir Technologies Inc."),
                (423610, "MSTR", "SMART", "STK", "USD", "MicroStrategy Incorporated"),
                (442526569, "SNOW", "SMART", "STK", "USD", "Snowflake Inc."),
                (369234857, "CRWD", "SMART", "STK", "USD", "CrowdStrike Holdings, Inc."),
                (273036, "ORCL", "SMART", "STK", "USD", "Oracle Corporation"),
                (166090175, "BABA", "SMART", "STK", "USD", "Alibaba Group Holding Limited"),
            ]
            client.insert(
                "instruments",
                default_instruments,
                column_names=["con_id", "symbol", "exchange", "sec_type", "currency", "name"],
            )
            logger.success(f"Seeded {len(default_instruments)} default streaming instruments")

        # User Subscriptions table
        client.command("""
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            subscription_id String DEFAULT toString(generateUUIDv4()),
            user_id String,
            instrument_id UInt64 DEFAULT 0,
            con_id UInt32,
            symbol LowCardinality(String),
            is_active UInt8 DEFAULT 1,
            updated_at DateTime64(3) DEFAULT now64(3)
        ) ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (user_id, con_id);
        """)
        logger.info("User Subscriptions table verified.")

        # Add instrument_id column if upgrading from older schema
        try:
            client.command(
                f"ALTER TABLE {self.database}.user_subscriptions "
                "ADD COLUMN IF NOT EXISTS instrument_id UInt64 DEFAULT 0"
            )
        except Exception:
            pass

        # Raw Ticks table — full depth-of-book schema
        # ts stores wall-clock Eastern Time (America/New_York = EST/EDT)
        # Partitioned by date, ordered by (instrument_token, ts) for fast range scans
        client.command("""
        CREATE TABLE IF NOT EXISTS raw_ticks (
            instrument_token  UInt32,
            symbol            LowCardinality(String),
            exchange          LowCardinality(String),
            ltp               Decimal64(4),
            volume            UInt64,
            buy_quantity      UInt64,
            sell_quantity     UInt64,
            open              Decimal64(4),
            high              Decimal64(4),
            low               Decimal64(4),
            close             Decimal64(4),
            change            Decimal64(4),
            oi                UInt64        DEFAULT 0,
            bid_price_1       Decimal64(4)  DEFAULT 0,
            bid_qty_1         UInt64        DEFAULT 0,
            bid_price_2       Decimal64(4)  DEFAULT 0,
            bid_qty_2         UInt64        DEFAULT 0,
            bid_price_3       Decimal64(4)  DEFAULT 0,
            bid_qty_3         UInt64        DEFAULT 0,
            bid_price_4       Decimal64(4)  DEFAULT 0,
            bid_qty_4         UInt64        DEFAULT 0,
            bid_price_5       Decimal64(4)  DEFAULT 0,
            bid_qty_5         UInt64        DEFAULT 0,
            ask_price_1       Decimal64(4)  DEFAULT 0,
            ask_qty_1         UInt64        DEFAULT 0,
            ask_price_2       Decimal64(4)  DEFAULT 0,
            ask_qty_2         UInt64        DEFAULT 0,
            ask_price_3       Decimal64(4)  DEFAULT 0,
            ask_qty_3         UInt64        DEFAULT 0,
            ask_price_4       Decimal64(4)  DEFAULT 0,
            ask_qty_4         UInt64        DEFAULT 0,
            ask_price_5       Decimal64(4)  DEFAULT 0,
            ask_qty_5         UInt64        DEFAULT 0,
            ts                DateTime64(3, 'America/New_York') CODEC(DoubleDelta, LZ4)
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMMDD(ts)
        ORDER BY (instrument_token, ts)
        SETTINGS index_granularity = 8192;
        """)
        logger.info("Raw Ticks table verified (schema: full depth-of-book, timezone: America/New_York / EST).")
        logger.success("ClickHouse schema initialization complete!")

    def list_active_instruments(self) -> list[dict]:
        """Active instruments in the catalog replica (autonomous streaming source)."""
        client = self.get_client()
        rows = client.query(
            f"""
            SELECT con_id, symbol, exchange, sec_type
            FROM {self.database}.instruments FINAL
            WHERE is_active = 1 AND con_id > 0
            ORDER BY symbol
            """
        ).result_rows
        return [
            {
                "con_id": int(row[0]),
                "symbol": str(row[1]).upper(),
                "exchange": str(row[2] or "SMART"),
                "sec_type": str(row[3] or "STK"),
            }
            for row in rows
        ]

# Global instance
ch_manager = ClickHouseManager()
