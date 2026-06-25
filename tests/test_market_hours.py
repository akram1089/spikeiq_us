"""Tests for US market session helpers."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from src.utils.market_hours import is_us_regular_session_open, is_us_weekday

ET = ZoneInfo("America/New_York")


def _et(y, m, d, h, mi):
    return datetime(y, m, d, h, mi, tzinfo=ET)


@pytest.mark.parametrize(
    "dt,expected",
    [
        (_et(2024, 7, 1, 8, 0), False),   # pre-market
        (_et(2024, 7, 1, 9, 30), True),   # open
        (_et(2024, 7, 1, 15, 59), True),  # still open
        (_et(2024, 7, 1, 16, 0), False),  # closed
        (_et(2024, 7, 6, 11, 0), False),  # Saturday
        (_et(2024, 1, 1, 9, 30), True),   # winter open
        (_et(2024, 1, 1, 9, 0), False),   # winter pre-market
    ],
)
def test_is_us_regular_session_open(dt, expected):
    assert is_us_regular_session_open(dt) is expected
    assert is_us_weekday(dt) == (dt.weekday() < 5)
