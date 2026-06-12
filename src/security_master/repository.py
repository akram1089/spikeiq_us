from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.security_master.models import Instrument


@dataclass
class InstrumentFilters:
    symbol: str | None = None
    name: str | None = None
    asset_type: str | None = None
    exchange: str | None = None
    q: str | None = None
    is_active: bool | None = True


class InstrumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, instrument_id: int) -> Instrument | None:
        return self.db.get(Instrument, instrument_id)

    def get_by_symbol(self, symbol: str) -> Instrument | None:
        stmt = select(Instrument).where(Instrument.symbol == symbol.upper())
        return self.db.execute(stmt).scalar_one_or_none()

    def _apply_filters(self, stmt, filters: InstrumentFilters):
        if filters.is_active is not None:
            stmt = stmt.where(Instrument.is_active == filters.is_active)
        if filters.symbol:
            stmt = stmt.where(Instrument.symbol.ilike(f"%{filters.symbol.upper()}%"))
        if filters.name:
            stmt = stmt.where(Instrument.name.ilike(f"%{filters.name}%"))
        if filters.asset_type:
            stmt = stmt.where(Instrument.asset_type == filters.asset_type.upper())
        if filters.exchange:
            stmt = stmt.where(Instrument.exchange.ilike(f"%{filters.exchange.upper()}%"))
        if filters.q:
            q = f"%{filters.q}%"
            stmt = stmt.where(
                or_(
                    Instrument.symbol.ilike(q),
                    Instrument.name.ilike(q),
                )
            )
        return stmt

    def list_paginated(
        self,
        page: int = 1,
        page_size: int = 50,
        sort_by: str = "symbol",
        sort_order: str = "asc",
        filters: InstrumentFilters | None = None,
    ) -> tuple[list[Instrument], int]:
        filters = filters or InstrumentFilters()
        base = self._apply_filters(select(Instrument), filters)

        count_stmt = select(func.count()).select_from(base.subquery())
        total = self.db.execute(count_stmt).scalar_one()

        sort_col = getattr(Instrument, sort_by, Instrument.symbol)
        order = sort_col.asc() if sort_order.lower() == "asc" else sort_col.desc()

        stmt = base.order_by(order).offset((page - 1) * page_size).limit(page_size)
        items = list(self.db.execute(stmt).scalars().all())
        return items, total

    def create(self, data: dict) -> Instrument:
        data = {**data, "symbol": data["symbol"].upper()}
        inst = Instrument(**data)
        self.db.add(inst)
        self.db.commit()
        self.db.refresh(inst)
        return inst

    def update(self, instrument: Instrument, data: dict) -> Instrument:
        for key, value in data.items():
            if value is not None:
                if key == "symbol":
                    value = value.upper()
                setattr(instrument, key, value)
        instrument.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(instrument)
        return instrument

    def soft_delete(self, instrument: Instrument) -> Instrument:
        instrument.is_active = False
        instrument.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(instrument)
        return instrument

    def upsert_by_symbol(self, data: dict) -> tuple[Instrument, bool]:
        """Returns (instrument, created) where created=True if inserted."""
        symbol = data["symbol"].upper()
        existing = self.get_by_symbol(symbol)
        if existing:
            changed = False
            for key in ("name", "asset_type", "exchange", "currency", "local_symbol", "is_active"):
                if key in data and data[key] is not None and getattr(existing, key) != data[key]:
                    setattr(existing, key, data[key])
                    changed = True
            if changed:
                existing.updated_at = datetime.utcnow()
                self.db.commit()
                self.db.refresh(existing)
            return existing, False

        inst = Instrument(
            symbol=symbol,
            name=data["name"],
            asset_type=data["asset_type"],
            exchange=data.get("exchange"),
            currency=data.get("currency", "USD"),
            ibkr_conid=data.get("ibkr_conid"),
            local_symbol=data.get("local_symbol"),
            is_active=data.get("is_active", True),
        )
        self.db.add(inst)
        self.db.commit()
        self.db.refresh(inst)
        return inst, True

    def bulk_upsert(self, rows: list[dict]) -> tuple[int, int]:
        """Bulk upsert by symbol. Returns (inserted_count, updated_count)."""
        if not rows:
            return 0, 0
        inserted = 0
        updated = 0
        for data in rows:
            _, created = self.upsert_by_symbol(data)
            if created:
                inserted += 1
            else:
                updated += 1
        return inserted, updated

    def list_unresolved(
        self, limit: int = 50, asset_types: list[str] | None = None
    ) -> list[Instrument]:
        stmt = (
            select(Instrument)
            .where(Instrument.ibkr_conid.is_(None))
            .where(Instrument.is_active.is_(True))
        )
        if asset_types:
            stmt = stmt.where(Instrument.asset_type.in_([a.upper() for a in asset_types]))
        stmt = stmt.order_by(Instrument.id).limit(limit)
        return list(self.db.execute(stmt).scalars().all())

    def update_conid(
        self,
        instrument: Instrument,
        ibkr_conid: int,
        local_symbol: str | None = None,
        exchange: str | None = None,
        currency: str | None = None,
    ) -> Instrument:
        if instrument.ibkr_conid is not None:
            return instrument
        instrument.ibkr_conid = ibkr_conid
        if local_symbol:
            instrument.local_symbol = local_symbol
        if exchange:
            instrument.exchange = exchange
        if currency:
            instrument.currency = currency
        instrument.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(instrument)
        return instrument

    def list_active_resolved(self) -> list[Instrument]:
        stmt = (
            select(Instrument)
            .where(Instrument.is_active.is_(True))
            .where(Instrument.ibkr_conid.isnot(None))
        )
        return list(self.db.execute(stmt).scalars().all())

    def deactivate_symbols_not_in(self, symbols: set[str], asset_type: str) -> int:
        stmt = select(Instrument).where(
            Instrument.asset_type == asset_type.upper(),
            Instrument.is_active.is_(True),
            Instrument.symbol.notin_(symbols) if symbols else True,
        )
        count = 0
        for inst in self.db.execute(stmt).scalars().all():
            if symbols and inst.symbol not in symbols:
                inst.is_active = False
                inst.updated_at = datetime.utcnow()
                count += 1
        if count:
            self.db.commit()
        return count
