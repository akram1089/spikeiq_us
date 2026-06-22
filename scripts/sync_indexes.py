import scripts._bootstrap  # noqa: F401

from loguru import logger

from src.db.postgres import SessionLocal
from src.security_master.mappers import publish_instrument_event
from src.security_master.repository import InstrumentRepository

INDEXES = [
    ("SPX", "S&P 500 Index", "CBOE"),
    ("NDX", "NASDAQ 100 Index", "NASDAQ"),
    ("COMP", "NASDAQ Composite Index", "NASDAQ"),
    ("INDU", "Dow Jones Industrial Average", "CME"),
    ("RUT", "Russell 2000 Index", "CBOE"),
    ("VIX", "CBOE Volatility Index", "CBOE"),
    ("OEX", "S&P 100", "CBOE"),
    ("SOX", "PHLX Semiconductor Index", "PHLX"),
]


def main() -> None:
    logger.info("Starting index master sync...")
    db = SessionLocal()
    try:
        repo = InstrumentRepository(db)
        inserted = 0
        updated = 0
        for symbol, name, exchange in INDEXES:
            inst, created = repo.upsert_by_symbol(
                {
                    "symbol": symbol,
                    "name": name,
                    "asset_type": "INDEX",
                    "exchange": exchange,
                    "currency": "USD",
                    "is_active": True,
                }
            )
            if created:
                inserted += 1
                publish_instrument_event(inst, "CREATE")
            else:
                updated += 1
                publish_instrument_event(inst, "UPDATE")
        logger.success(f"Index sync complete: inserted={inserted}, updated={updated}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
