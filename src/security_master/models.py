from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    asset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    exchange: Mapped[str | None] = mapped_column(String(20), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ibkr_conid: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    local_symbol: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_instruments_symbol", "symbol"),
        Index("ix_instruments_asset_type", "asset_type"),
        Index("ix_instruments_exchange", "exchange"),
        Index("ix_instruments_ibkr_conid", "ibkr_conid"),
        Index(
            "ix_instruments_unresolved",
            "id",
            postgresql_where=(ibkr_conid.is_(None)),
        ),
    )
