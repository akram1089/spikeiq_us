import scripts._bootstrap  # noqa: F401

import csv
from pathlib import Path

from loguru import logger

from src.db.postgres import SessionLocal
from src.security_master.ibkr_resolver import generate_futures_contracts
from src.security_master.mappers import publish_instrument_event
from src.security_master.repository import InstrumentRepository

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "futures_products.csv"


def main() -> None:
    logger.info("Starting futures master sync...")
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Missing futures products file: {CSV_PATH}")

    active_symbols: set[str] = set()
    all_rows: list[dict] = []

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            root = row["product_root"].strip().upper()
            exchange = row["exchange"].strip().upper()
            name = row["name"].strip()
            contracts = generate_futures_contracts(root, exchange, name, months_ahead=12)
            for c in contracts:
                active_symbols.add(c["symbol"])
                all_rows.append(c)

    logger.info(f"Generated {len(all_rows)} futures contract rows")

    db = SessionLocal()
    try:
        repo = InstrumentRepository(db)
        inserted = 0
        updated = 0
        for row in all_rows:
            inst, created = repo.upsert_by_symbol(row)
            if created:
                inserted += 1
                publish_instrument_event(inst, "CREATE")
            else:
                updated += 1
                publish_instrument_event(inst, "UPDATE")

        deactivated = repo.deactivate_symbols_not_in(active_symbols, "FUTURE")
        logger.success(
            f"Futures sync complete: inserted={inserted}, updated={updated}, deactivated={deactivated}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
