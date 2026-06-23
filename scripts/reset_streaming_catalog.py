"""Reset IB streaming catalog: deactivate all, then seed DEFAULT_STREAM_SYMBOLS only.

Usage:
  python -m scripts.reset_streaming_catalog
  docker exec quant_backend python -m scripts.reset_streaming_catalog

After running, restart the backend so IB unsubscribes and reconnects cleanly:
  docker restart quant_backend
"""

import scripts._bootstrap  # noqa: F401

from loguru import logger

from config import settings
from src.db.clickhouse_client import ch_manager


def main() -> None:
    logger.info("Deactivating all instruments in ClickHouse streaming catalog...")
    deactivated = ch_manager.deactivate_all_catalog_instruments()
    logger.info(f"Deactivated {deactivated} streaming catalog row(s)")

    symbols = settings.DEFAULT_STREAM_SYMBOLS
    logger.info(f"Seeding streaming catalog with {len(symbols)} default symbol(s): {symbols}")
    seeded = ch_manager.seed_streaming_catalog(symbols)
    logger.success(
        f"Streaming catalog reset complete: deactivated={deactivated}, seeded={seeded}. "
        "Restart quant_backend to clear IB market data subscriptions."
    )


if __name__ == "__main__":
    main()
