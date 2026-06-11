import os
from pathlib import Path
from dotenv import load_dotenv

# Find project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load environment variables from .env file at project root or docker folder
dotenv_paths = [
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / "docker" / ".env",
]

for path in dotenv_paths:
    if path.exists():
        load_dotenv(dotenv_path=path)
        break

# Interactive Brokers Connection Settings
IB_HOST = os.getenv("IB_HOST", "127.0.0.1")

# Default API ports: 4001 for live (container 4003), 4002 for paper (container 4004)
# Since trading mode is paper by default, default to port 4002.
TRADING_MODE = os.getenv("TRADING_MODE", "paper").lower()
DEFAULT_PORT = 4002 if TRADING_MODE == "paper" else 4001
IB_PORT = int(os.getenv("IB_PORT", DEFAULT_PORT))

# Client ID for connection (default to 1)
IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", 1))

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_DIR = PROJECT_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "ib_gateway.log"

# Read-Only API Setting
READ_ONLY_API = os.getenv("READ_ONLY_API", "yes").lower() in ("yes", "true", "1")

# ClickHouse Database Connection Settings
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "127.0.0.1")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", 8123))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "clickhouse_user")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "clickhouse_pass")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "trade_analytics_us")

# Kafka Settings
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

# Symbols streamed to Kafka/ClickHouse automatically — no UI or user action required
DEFAULT_STREAM_SYMBOLS = [
    s.strip().upper()
    for s in os.getenv(
        "DEFAULT_STREAM_SYMBOLS",
        "AAPL,MSFT,NVDA,TSLA,SPX,META,GOOGL,AMZN",
    ).split(",")
    if s.strip()
]

# JWT Security Settings
JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_spikeiq_token_key_123456")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", 24))

