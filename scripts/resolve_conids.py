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


async def resolve_batch(ib, repo: InstrumentRepository) -> tuple[int, int]:
    instruments = repo.list_unresolved(limit=settings.IB_RESOLVE_BATCH_SIZE)
    if not instruments:
        return 0, 0

    resolved = 0
    failed = 0
    for inst in instruments:
        if inst.ibkr_conid is not None:
            continue
        result = await resolve_instrument(ib, inst)
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
            logger.warning(f"Failed to resolve {inst.symbol} (id={inst.id})")
        await asyncio.sleep(settings.IB_RESOLVE_RETRY_DELAY)
    return resolved, failed


async def main_async() -> None:
    logger.info("Starting IBKR conId resolution for unresolved instruments...")
    conn = ConnectionManager(client_id=settings.IB_RESOLVE_CLIENT_ID)
    connected = await conn.connect()
    if not connected:
        logger.error("Could not connect to IB Gateway")
        return

    db = SessionLocal()
    total_resolved = 0
    total_failed = 0
    try:
        repo = InstrumentRepository(db)
        while True:
            batch = repo.list_unresolved(limit=1)
            if not batch:
                break
            resolved, failed = await resolve_batch(conn.ib, repo)
            total_resolved += resolved
            total_failed += failed
            if resolved == 0 and failed == 0:
                break
    finally:
        db.close()
        conn.disconnect()

    logger.success(f"Resolution complete: resolved={total_resolved}, failed={total_failed}")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
