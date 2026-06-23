"""Resolve IBKR conIds for all unresolved FUTURE instruments.

Usage:
  python -m scripts.resolve_futures
  docker exec quant_backend python -m scripts.resolve_futures
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


async def main_async() -> None:
    conn = ConnectionManager(client_id=settings.IB_RESOLVE_CLIENT_ID)
    if not await conn.connect():
        logger.error("Could not connect to IB Gateway")
        return

    db = SessionLocal()
    resolved = 0
    failed = 0
    try:
        repo = InstrumentRepository(db)
        pending = repo.list_unresolved(limit=500, asset_types=["FUTURE"])
        logger.info(f"Resolving {len(pending)} unresolved futures...")
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
                resolved += 1
                logger.success(f"Resolved {inst.symbol} -> conId {result.ibkr_conid}")
            else:
                failed += 1
                logger.warning(f"Failed {inst.symbol} (id={inst.id})")
            await asyncio.sleep(settings.IB_RESOLVE_RETRY_DELAY)
    finally:
        db.close()
        conn.disconnect()

    logger.success(f"Futures resolution complete: resolved={resolved}, failed={failed}")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
