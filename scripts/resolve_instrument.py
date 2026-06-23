"""Resolve a single instrument's IBKR conId by database id.

Usage:
  python -m scripts.resolve_instrument 12813
  docker exec quant_backend python -m scripts.resolve_instrument 12813
"""

import scripts._bootstrap  # noqa: F401

import asyncio
import sys

from ib_insync import util
from loguru import logger

from config import settings
from src.connection_manager import ConnectionManager
from src.db.postgres import SessionLocal
from src.security_master.ibkr_resolver import resolve_instrument
from src.security_master.mappers import publish_instrument_event
from src.security_master.repository import InstrumentRepository

util.patchAsyncio()


async def main_async(instrument_id: int) -> int:
    db = SessionLocal()
    try:
        repo = InstrumentRepository(db)
        inst = repo.get_by_id(instrument_id)
        if not inst:
            logger.error(f"Instrument {instrument_id} not found")
            return 1
        if inst.ibkr_conid is not None:
            logger.info(
                f"{inst.symbol} (id={instrument_id}) already resolved -> conId {inst.ibkr_conid}"
            )
            return 0

        conn = ConnectionManager(client_id=settings.IB_RESOLVE_CLIENT_ID)
        if not await conn.connect():
            logger.error("Could not connect to IB Gateway")
            return 1

        try:
            result = await resolve_instrument(conn.ib, inst)
        finally:
            conn.disconnect()

        if not result:
            logger.error(f"Failed to resolve {inst.symbol} (id={instrument_id})")
            return 1

        repo.update_conid(
            inst,
            result.ibkr_conid,
            result.local_symbol,
            result.exchange,
            result.currency,
        )
        publish_instrument_event(inst, "UPDATE")
        logger.success(
            f"Resolved {inst.symbol} (id={instrument_id}) -> conId {result.ibkr_conid}"
        )
        return 0
    finally:
        db.close()


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python -m scripts.resolve_instrument <instrument_id>")
        raise SystemExit(2)
    raise SystemExit(asyncio.run(main_async(int(sys.argv[1]))))


if __name__ == "__main__":
    main()
