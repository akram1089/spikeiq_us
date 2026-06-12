from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AssetType = Literal["STOCK", "ETF", "INDEX", "FUTURE"]


class InstrumentBase(BaseModel):
    symbol: str = Field(..., max_length=50)
    name: str
    asset_type: AssetType
    exchange: str | None = None
    currency: str | None = "USD"
    ibkr_conid: int | None = None
    local_symbol: str | None = None
    is_active: bool = True


class InstrumentCreate(InstrumentBase):
    pass


class InstrumentUpdate(BaseModel):
    symbol: str | None = Field(None, max_length=50)
    name: str | None = None
    asset_type: AssetType | None = None
    exchange: str | None = None
    currency: str | None = None
    ibkr_conid: int | None = None
    local_symbol: str | None = None
    is_active: bool | None = None


class InstrumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    instrument_id: int
    symbol: str
    name: str
    asset_type: str
    exchange: str | None
    currency: str | None
    ibkr_conid: int | None
    local_symbol: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class InstrumentListResponse(BaseModel):
    items: list[InstrumentResponse]
    total: int
    page: int
    page_size: int


class InstrumentSearchResponse(InstrumentResponse):
    source: Literal["catalog", "ibkr"] = "catalog"
