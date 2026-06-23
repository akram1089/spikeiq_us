import pytest
from src.security_master.ibkr_resolver import (
    build_ib_contract,
    generate_futures_contracts,
    normalize_asset_type,
    parse_futures_contract_symbol,
    parse_futures_expiry,
    resolve_futures_root,
    MONTH_CODES,
)


def test_parse_futures_expiry():
    assert parse_futures_expiry("ESU26") == "202609"
    assert parse_futures_expiry("ESH27") == "202703"
    assert parse_futures_expiry("INVALID") == ""


def test_parse_futures_contract_symbol():
    assert parse_futures_contract_symbol("ESU26") == ("ES", "202609")
    assert parse_futures_contract_symbol("MESU26") == ("MES", "202609")
    assert parse_futures_contract_symbol("6EZ25") == ("6E", "202512")
    assert parse_futures_contract_symbol("INVALID") == ("INVALID", "")


def test_build_ib_contract_future_uses_root_not_full_symbol():
    class Inst:
        asset_type = "FUTURE"
        symbol = "ESU26"
        local_symbol = "ESU26"
        exchange = "CME"
        currency = "USD"

    contract = build_ib_contract(Inst())
    assert contract.symbol == "ES"
    assert contract.lastTradeDateOrContractMonth == "202609"
    assert contract.localSymbol == "ESU26"
    assert contract.tradingClass == "ES"


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


def test_resolve_futures_root_aliases():
    assert resolve_futures_root("SPX") == "ES"
    assert resolve_futures_root("NASDAQ") == "NQ"
    assert resolve_futures_root("NDX") == "NQ"
    assert resolve_futures_root("ES") == "ES"


def test_normalize_asset_type():
    assert normalize_asset_type(None, "FUT") == "FUTURE"
    assert normalize_asset_type("INDEX", None) == "INDEX"
    assert normalize_asset_type(None, "STK") == "STOCK"
