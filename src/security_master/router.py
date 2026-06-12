from typing import Annotated

from fastapi import APIRouter, Depends, Query
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
from src.security_master.service import InstrumentService

router = APIRouter(prefix="/api/instruments", tags=["instruments"])

_ib_instance: IB | None = None


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


@router.post("/resolve-pending")
async def resolve_pending_instruments(
    service: InstrumentService = Depends(get_service),
):
    """Resolve IBKR conIds for catalog rows missing ibkr_conid (uses backend IB session)."""
    return await service.resolve_pending()


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
