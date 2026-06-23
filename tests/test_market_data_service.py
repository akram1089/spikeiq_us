import math
from types import SimpleNamespace

from src.market_data_service import _ticker_market_price


def test_ticker_market_price_prefers_last():
    ticker = SimpleNamespace(last=100.5, close=99.0)
    ticker.marketPrice = lambda: math.nan
    assert _ticker_market_price(ticker) == 100.5


def test_ticker_market_price_falls_back_to_close_for_index():
    ticker = SimpleNamespace(last=math.nan, close=42150.25, bid=math.nan, ask=math.nan)
    ticker.marketPrice = lambda: math.nan
    assert _ticker_market_price(ticker) == 42150.25


def test_ticker_market_price_uses_market_price_when_last_missing():
    ticker = SimpleNamespace(last=math.nan, close=math.nan)
    ticker.marketPrice = lambda: 42151.0
    assert _ticker_market_price(ticker) == 42151.0
