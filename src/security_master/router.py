import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from ib_insync import IB
from sqlalchemy.orm import Session

from src.db.postgres import get_db
from src.security_master.schemas import (
    InstrumentCreate,
    InstrumentListResponse,
    InstrumentResponse,
    InstrumentSearchResponse,
    InstrumentUpdate,
)
from src.security_master.repository import InstrumentRepository
from src.security_master.service import InstrumentService

router = APIRouter(prefix="/api/instruments", tags=["instruments"])

_ib_instance: IB | None = None
_resolve_task: asyncio.Task | None = None


def set_ib_instance(ib: IB | None) -> None:
    global _ib_instance
    _ib_instance = ib


def get_ib() -> IB | None:
    return _ib_instance


def get_service(
    db: Annotated[Session, Depends(get_db)],
    ib: Annotated[IB | None, Depends(get_ib)],
) -> InstrumentService:
    return InstrumentService(db, ib)


@router.get("/streaming")
def list_streaming_instruments(
    db: Annotated[Session, Depends(get_db)],
):
    """Active instruments in the ClickHouse streaming catalog (is_active = 1)."""
    from src.db.clickhouse_client import SEC_TYPE_TO_ASSET_TYPE, ch_manager

    repo = InstrumentRepository(db)
    items = []
    for row in ch_manager.list_active_instruments():
        inst = repo.get_by_ibkr_conid(row["con_id"]) or repo.get_by_symbol(row["symbol"])
        asset_type = (
            inst.asset_type
            if inst
            else SEC_TYPE_TO_ASSET_TYPE.get(row["sec_type"], "STOCK")
        )
        items.append(
            {
                "instrument_id": inst.id if inst else 0,
                "con_id": row["con_id"],
                "symbol": row["symbol"],
                "name": inst.name if inst else row["name"],
                "exchange": row["exchange"],
                "sec_type": row["sec_type"],
                "asset_type": asset_type,
                "currency": row.get("currency", "USD"),
                "added_at": row.get("added_at"),
            }
        )
    return {"items": items, "total": len(items)}


@router.get("", response_model=InstrumentListResponse)
def list_instruments(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str = Query("symbol"),
    sort_order: str = Query("asc"),
    symbol: str | None = None,
    name: str | None = None,
    asset_type: str | None = None,
    exchange: str | None = None,
    q: str | None = None,
    is_active: bool | None = True,
    service: InstrumentService = Depends(get_service),
):
    return service.list_instruments(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        symbol=symbol,
        name=name,
        asset_type=asset_type,
        exchange=exchange,
        q=q,
        is_active=is_active,
    )


async def _run_resolve_pending(service: InstrumentService) -> None:
    global _resolve_task
    try:
        await service.resolve_pending()
    finally:
        _resolve_task = None


@router.post("/resolve-pending")
async def resolve_pending_instruments(
    service: InstrumentService = Depends(get_service),
):
    """Resolve IBKR conIds in the background (does not block the API)."""
    global _resolve_task
    if _resolve_task and not _resolve_task.done():
        return {"status": "running", "message": "Resolution already in progress"}
    if not _ib_instance or not _ib_instance.isConnected():
        raise HTTPException(status_code=503, detail="Not connected to IB Gateway")
    _resolve_task = asyncio.create_task(_run_resolve_pending(service))
    return {"status": "started", "message": "Resolution running in background"}


@router.get("/search", response_model=InstrumentSearchResponse)
async def search_instrument(
    symbol: str = Query(...),
    sec_type: str = Query("STK"),
    asset_type: str | None = None,
    service: InstrumentService = Depends(get_service),
):
    return await service.search_and_resolve(symbol, asset_type=asset_type, sec_type=sec_type)


@router.get("/{instrument_id}", response_model=InstrumentResponse)
def get_instrument(
    instrument_id: int,
    service: InstrumentService = Depends(get_service),
):
    return service.get(instrument_id)


@router.post("", response_model=InstrumentResponse, status_code=201)
def create_instrument(
    payload: InstrumentCreate,
    service: InstrumentService = Depends(get_service),
):
    return service.create(payload)


@router.put("/{instrument_id}", response_model=InstrumentResponse)
def update_instrument(
    instrument_id: int,
    payload: InstrumentUpdate,
    service: InstrumentService = Depends(get_service),
):
    return service.update(instrument_id, payload)


@router.delete("/{instrument_id}", response_model=InstrumentResponse)
def delete_instrument(
    instrument_id: int,
    service: InstrumentService = Depends(get_service),
):
    return service.delete(instrument_id)
