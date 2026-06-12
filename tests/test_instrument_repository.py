import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.db.base import Base
from src.security_master.models import Instrument
from src.security_master.repository import InstrumentFilters, InstrumentRepository


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_create_and_get(db_session):
    repo = InstrumentRepository(db_session)
    inst = repo.create(
        {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "asset_type": "STOCK",
            "exchange": "NASDAQ",
            "currency": "USD",
        }
    )
    assert inst.id is not None
    found = repo.get_by_id(inst.id)
    assert found.symbol == "AAPL"


def test_upsert_by_symbol(db_session):
    repo = InstrumentRepository(db_session)
    _, created = repo.upsert_by_symbol(
        {"symbol": "MSFT", "name": "Microsoft", "asset_type": "STOCK", "exchange": "NASDAQ"}
    )
    assert created is True
    inst, created2 = repo.upsert_by_symbol(
        {"symbol": "MSFT", "name": "Microsoft Corp", "asset_type": "STOCK", "exchange": "NASDAQ"}
    )
    assert created2 is False
    assert inst.name == "Microsoft Corp"


def test_list_paginated_filter(db_session):
    repo = InstrumentRepository(db_session)
    repo.create({"symbol": "AAPL", "name": "Apple", "asset_type": "STOCK"})
    repo.create({"symbol": "SPX", "name": "S&P 500", "asset_type": "INDEX", "exchange": "CBOE"})
    items, total = repo.list_paginated(
        page=1, page_size=10, filters=InstrumentFilters(asset_type="INDEX")
    )
    assert total == 1
    assert items[0].symbol == "SPX"


def test_list_unresolved(db_session):
    repo = InstrumentRepository(db_session)
    repo.create({"symbol": "NVDA", "name": "NVIDIA", "asset_type": "STOCK", "ibkr_conid": 123})
    repo.create({"symbol": "TSLA", "name": "Tesla", "asset_type": "STOCK"})
    unresolved = repo.list_unresolved(limit=10)
    assert len(unresolved) == 1
    assert unresolved[0].symbol == "TSLA"
