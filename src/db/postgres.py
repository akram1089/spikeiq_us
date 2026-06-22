from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from config import settings
from src.db.base import Base

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if they do not exist and seed default instruments."""
    from src.security_master.models import Instrument

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        count = db.query(Instrument).count()
        if count == 0:
            default_instruments = [
                # (conId, symbol, exchange, asset_type, currency, name)
                (416904, "SPX", "CBOE", "INDEX", "USD", "S&P 500 Index"),
                (416843, "NDX", "NASDAQ", "INDEX", "USD", "NASDAQ 100 Index"),
                (1935181, "INDU", "CME", "INDEX", "USD", "Dow Jones Industrial Average"),
                (265598, "AAPL", "SMART", "STOCK", "USD", "Apple Inc."),
                (4815758, "NVDA", "SMART", "STOCK", "USD", "NVIDIA Corporation"),
                (272093, "MSFT", "SMART", "STOCK", "USD", "Microsoft Corporation"),
                (107113386, "META", "SMART", "STOCK", "USD", "Meta Platforms, Inc."),
                (208781907, "GOOGL", "SMART", "STOCK", "USD", "Alphabet Inc."),
                (76792991, "TSLA", "SMART", "STOCK", "USD", "Tesla, Inc."),
                (3691937, "AMZN", "SMART", "STOCK", "USD", "Amazon.com, Inc."),
                (8272386, "NFLX", "SMART", "STOCK", "USD", "Netflix, Inc."),
                (479361661, "COIN", "SMART", "STOCK", "USD", "Coinbase Global, Inc."),
                (651636257, "AVGO", "SMART", "STOCK", "USD", "Broadcom Inc."),
                (443831637, "PLTR", "SMART", "STOCK", "USD", "Palantir Technologies Inc."),
                (423610, "MSTR", "SMART", "STOCK", "USD", "MicroStrategy Incorporated"),
                (442526569, "SNOW", "SMART", "STOCK", "USD", "Snowflake Inc."),
                (369234857, "CRWD", "SMART", "STOCK", "USD", "CrowdStrike Holdings, Inc."),
                (273036, "ORCL", "SMART", "STOCK", "USD", "Oracle Corporation"),
                (166090175, "BABA", "SMART", "STOCK", "USD", "Alibaba Group Holding Limited"),
            ]
            for con_id, symbol, exchange, asset_type, currency, name in default_instruments:
                inst = Instrument(
                    ibkr_conid=con_id,
                    symbol=symbol,
                    exchange=exchange,
                    asset_type=asset_type,
                    currency=currency,
                    name=name,
                    is_active=True
                )
                db.add(inst)
            db.commit()
    finally:
        db.close()


def check_postgres_health() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
