from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ib_insync import IB
from loguru import logger
from sqlalchemy.orm import Session

from config import settings
from src.auth.router import get_current_user
from src.db.postgres import get_db
from src.queue.kafka_producer import kafka_producer
from src.security_master.repository import InstrumentRepository
from src.security_master.service import InstrumentService

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])

_ib_instance: IB | None = None


def set_ib_instance(ib: IB | None) -> None:
    global _ib_instance
    _ib_instance = ib


class SubscriptionRequest(BaseModel):
    instrument_id: int


@router.post("")
async def subscribe(
    payload: SubscriptionRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    username = user["sub"]
    repo = InstrumentRepository(db)
    inst = repo.get_by_id(payload.instrument_id)
    if not inst or not inst.is_active:
        raise HTTPException(status_code=404, detail="Instrument not found")

    if inst.ibkr_conid is None:
        service = InstrumentService(db, _ib_instance)
        try:
            resolved = await service.resolve_conid_if_missing(payload.instrument_id)
            inst = repo.get_by_id(payload.instrument_id)
        except HTTPException as e:
            raise e

    if inst.ibkr_conid is None:
        raise HTTPException(status_code=422, detail="Instrument has no IBKR contract ID")

    event = {
        "user_id": username,
        "instrument_id": inst.id,
        "con_id": int(inst.ibkr_conid),
        "symbol": inst.symbol,
        "action": "SUBSCRIBE",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        kafka_producer.publish("user-subscriptions", username, event)
        logger.info(f"Subscription queued: user={username} instrument_id={inst.id}")
        return {
            "status": "accepted",
            "instrument_id": inst.id,
            "ibkr_conid": inst.ibkr_conid,
            "symbol": inst.symbol,
        }
    except Exception as e:
        logger.error(f"Failed to queue subscription: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue subscription")


@router.delete("/{instrument_id}")
async def unsubscribe(
    instrument_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    username = user["sub"]
    repo = InstrumentRepository(db)
    inst = repo.get_by_id(instrument_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")

    event = {
        "user_id": username,
        "instrument_id": instrument_id,
        "con_id": int(inst.ibkr_conid or 0),
        "symbol": inst.symbol,
        "action": "UNSUBSCRIBE",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        kafka_producer.publish("user-subscriptions", username, event)
        return {"status": "accepted", "instrument_id": instrument_id}
    except Exception as e:
        logger.error(f"Failed to queue unsubscribe: {e}")
        raise HTTPException(status_code=500, detail="Failed to queue unsubscribe")


@router.get("")
async def list_subscriptions(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return active subscriptions for the current user from ClickHouse."""
    from src.db.clickhouse_client import ch_manager

    username = user["sub"]
    try:
        client = ch_manager.get_client()
        rows = client.query(
            f"""
            SELECT instrument_id, con_id, symbol
            FROM {settings.CLICKHOUSE_DB}.user_subscriptions FINAL
            WHERE user_id = {{uid:String}} AND is_active = 1
            """,
            parameters={"uid": username},
        ).result_rows
        return {
            "items": [
                {"instrument_id": r[0], "con_id": r[1], "symbol": r[2]}
                for r in rows
            ]
        }
    except Exception as e:
        logger.error(f"Failed to list subscriptions: {e}")
        return {"items": []}
