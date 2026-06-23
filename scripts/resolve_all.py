"""Resolve IBKR conIds for all unresolved instruments (indexes, futures, stocks).

Usage:
  python -m scripts.resolve_all
  docker exec quant_backend python -m scripts.resolve_all
"""

import scripts._bootstrap  # noqa: F401

import asyncio

from ib_insync import util
from loguru import logger

from config import settings
from src.connection_manager import ConnectionManager
from src.db.postgres import SessionLocal
from src.security_master.ibkr_resolver import resolve_instrument
from src.security_master.mappers import publish_instrument_event
from src.security_master.repository import InstrumentRepository

util.patchAsyncio()

PRIORITY_ORDER = ["INDEX", "FUTURE", "STOCK", "ETF"]


async def main_async() -> None:
    conn = ConnectionManager(client_id=settings.IB_RESOLVE_CLIENT_ID)
    if not await conn.connect():
        logger.error("Could not connect to IB Gateway")
        return

    db = SessionLocal()
    total_resolved = 0
    total_failed = 0
    try:
        repo = InstrumentRepository(db)
        for asset_type in PRIORITY_ORDER:
            pending = repo.list_unresolved(limit=500, asset_types=[asset_type])
            if not pending:
                continue
            logger.info(f"Resolving {len(pending)} unresolved {asset_type} instrument(s)...")
            for inst in pending:
                result = await resolve_instrument(conn.ib, inst)
                if result:
                    repo.update_conid(
                        inst,
                        result.ibkr_conid,
                        result.local_symbol,
                        result.exchange,
                        result.currency,
                    )
                    publish_instrument_event(inst, "UPDATE")
                    total_resolved += 1
                    logger.success(
                        f"Resolved {inst.symbol} ({asset_type}) -> conId {result.ibkr_conid}"
                    )
                else:
                    total_failed += 1
                    logger.warning(f"Failed {inst.symbol} (id={inst.id}, {asset_type})")
                await asyncio.sleep(settings.IB_RESOLVE_RETRY_DELAY)
    finally:
        db.close()
        conn.disconnect()

    logger.success(
        f"Full resolution complete: resolved={total_resolved}, failed={total_failed}"
    )


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
