import pytest
from src.security_master.ibkr_resolver import (
    generate_futures_contracts,
    parse_futures_expiry,
    MONTH_CODES,
)


def test_parse_futures_expiry():
    assert parse_futures_expiry("ESU26") == "202609"
    assert parse_futures_expiry("ESH27") == "202703"
    assert parse_futures_expiry("INVALID") == ""


def test_generate_futures_contracts_quarterly():
    rows = generate_futures_contracts("ES", "CME", "E-mini S&P 500", months_ahead=12)
    assert len(rows) > 0
    for row in rows:
        assert row["asset_type"] == "FUTURE"
        assert row["symbol"].startswith("ES")
        assert row["exchange"] == "CME"
        month_char = row["symbol"][-3]
        assert month_char in MONTH_CODES


def test_generate_futures_unique_symbols():
    rows = generate_futures_contracts("NQ", "CME", "E-mini Nasdaq 100", months_ahead=12)
    symbols = [r["symbol"] for r in rows]
    assert len(symbols) == len(set(symbols))
