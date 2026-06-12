from datetime import date

from fastapi import HTTPException
from ib_insync import IB
from loguru import logger
from sqlalchemy.orm import Session

from src.security_master.ibkr_resolver import resolve_instrument
from src.security_master.mappers import publish_instrument_event, to_response
from src.security_master.repository import InstrumentFilters, InstrumentRepository
from src.security_master.schemas import (
    InstrumentCreate,
    InstrumentResponse,
    InstrumentSearchResponse,
    InstrumentUpdate,
)


class InstrumentService:
    def __init__(self, db: Session, ib: IB | None = None):
        self.repo = InstrumentRepository(db)
        self.db = db
        self.ib = ib

    def get(self, instrument_id: int) -> InstrumentResponse:
        inst = self.repo.get_by_id(instrument_id)
        if not inst:
            raise HTTPException(status_code=404, detail="Instrument not found")
        return to_response(inst)

    def list_instruments(
        self,
        page: int,
        page_size: int,
        sort_by: str,
        sort_order: str,
        symbol: str | None,
        name: str | None,
        asset_type: str | None,
        exchange: str | None,
        q: str | None,
        is_active: bool | None,
    ) -> dict:
        filters = InstrumentFilters(
            symbol=symbol,
            name=name,
            asset_type=asset_type,
            exchange=exchange,
            q=q,
            is_active=is_active,
        )
        items, total = self.repo.list_paginated(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )
        return {
            "items": [to_response(i) for i in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def create(self, payload: InstrumentCreate) -> InstrumentResponse:
        inst = self.repo.create(payload.model_dump())
        publish_instrument_event(inst, "CREATE")
        return to_response(inst)

    def update(self, instrument_id: int, payload: InstrumentUpdate) -> InstrumentResponse:
        inst = self.repo.get_by_id(instrument_id)
        if not inst:
            raise HTTPException(status_code=404, detail="Instrument not found")
        data = payload.model_dump(exclude_unset=True)
        inst = self.repo.update(inst, data)
        publish_instrument_event(inst, "UPDATE")
        return to_response(inst)

    def delete(self, instrument_id: int) -> InstrumentResponse:
        inst = self.repo.get_by_id(instrument_id)
        if not inst:
            raise HTTPException(status_code=404, detail="Instrument not found")
        inst = self.repo.soft_delete(inst)
        publish_instrument_event(inst, "DELETE")
        return to_response(inst)

    async def search_and_resolve(
        self,
        query: str,
        asset_type: str | None = None,
        sec_type: str | None = None,
    ) -> InstrumentSearchResponse:
        """Query catalog first; on miss resolve via IBKR and insert."""
        query_upper = query.strip().upper()
        inst = self.repo.get_by_symbol(query_upper)
        if inst:
            resp = to_response(inst)
            return InstrumentSearchResponse(**resp.model_dump(), source="catalog")

        if not self.ib or not self.ib.isConnected():
            raise HTTPException(status_code=503, detail="Not connected to IB Gateway")

        from ib_insync import Forex, Future, Index, Stock

        sec = (asset_type or sec_type or "STK").upper()
        clean = query_upper.lstrip("/")

        if sec in ("STOCK", "STK"):
            contract = Stock(clean, "SMART", "USD")
            resolved_type = "STOCK"
        elif sec in ("ETF",):
            contract = Stock(clean, "SMART", "USD")
            resolved_type = "ETF"
        elif sec in ("INDEX", "IND"):
            contract = Index(clean, "CBOE", "USD")
            resolved_type = "INDEX"
        elif sec in ("FUTURE", "FUT"):
            contract = Future(clean, exchange="CME", currency="USD")
            resolved_type = "FUTURE"
        elif sec in ("CASH",):
            contract = Forex(clean)
            resolved_type = "STOCK"
        else:
            contract = Stock(clean, "SMART", "USD")
            resolved_type = "STOCK"

        qualified = await self.ib.qualifyContractsAsync(contract)
        if not qualified:
            raise HTTPException(status_code=404, detail=f"Symbol qualification failed: {query}")

        contract = qualified[0]
        details = await self.ib.reqContractDetailsAsync(contract)
        long_name = details[0].longName if details else clean

        inst, created = self.repo.upsert_by_symbol(
            {
                "symbol": query_upper,
                "name": long_name,
                "asset_type": resolved_type,
                "exchange": contract.exchange,
                "currency": contract.currency,
                "ibkr_conid": contract.conId,
                "local_symbol": getattr(contract, "localSymbol", None),
                "is_active": True,
            }
        )
        if created or inst.ibkr_conid != contract.conId:
            inst = self.repo.update_conid(
                inst,
                contract.conId,
                getattr(contract, "localSymbol", None),
                contract.exchange,
                contract.currency,
            )
        publish_instrument_event(inst, "CREATE" if created else "UPDATE")
        resp = to_response(inst)
        return InstrumentSearchResponse(**resp.model_dump(), source="ibkr")

    async def resolve_conid_if_missing(self, instrument_id: int) -> InstrumentResponse:
        inst = self.repo.get_by_id(instrument_id)
        if not inst:
            raise HTTPException(status_code=404, detail="Instrument not found")
        if inst.ibkr_conid is not None:
            return to_response(inst)
        if not self.ib or not self.ib.isConnected():
            raise HTTPException(status_code=503, detail="Not connected to IB Gateway")
        resolved = await resolve_instrument(self.ib, inst)
        if not resolved:
            raise HTTPException(
                status_code=422,
                detail=f"Unable to resolve IBKR contract for instrument {instrument_id}",
            )
        inst = self.repo.update_conid(
            inst,
            resolved.ibkr_conid,
            resolved.local_symbol,
            resolved.exchange,
            resolved.currency,
        )
        publish_instrument_event(inst, "UPDATE")
        return to_response(inst)
