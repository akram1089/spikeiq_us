import scripts._bootstrap  # noqa: F401

import csv
from pathlib import Path

from loguru import logger

from src.db.postgres import SessionLocal
from src.security_master.mappers import publish_instrument_event
from src.security_master.repository import InstrumentRepository

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "priority_streaming.csv"


def main() -> None:
    logger.info("Starting priority streaming instruments sync...")
    if not CSV_PATH.exists():
        logger.warning(f"No priority streaming file at {CSV_PATH}")
        return

    db = SessionLocal()
    try:
        repo = InstrumentRepository(db)
        inserted = 0
        updated = 0
        with CSV_PATH.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                inst, created = repo.upsert_by_symbol(
                    {
                        "symbol": row["symbol"].strip().upper(),
                        "name": row["name"].strip(),
                        "asset_type": row["asset_type"].strip().upper(),
                        "exchange": row["exchange"].strip().upper(),
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
        logger.success(
            f"Priority streaming sync complete: inserted={inserted}, updated={updated}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
