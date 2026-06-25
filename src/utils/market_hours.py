"""US equity session helpers (America/New_York)."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")

REGULAR_OPEN_MINUTES = 9 * 60 + 30   # 09:30 ET
REGULAR_CLOSE_MINUTES = 16 * 60      # 16:00 ET


def us_market_et_now() -> datetime:
    return datetime.now(ET)


def is_us_weekday(dt: datetime | None = None) -> bool:
    dt = dt or us_market_et_now()
    return dt.weekday() < 5


def is_us_regular_session_open(dt: datetime | None = None) -> bool:
    """True during regular US session (9:30 AM – 4:00 PM ET, Mon–Fri)."""
    dt = dt or us_market_et_now()
    if not is_us_weekday(dt):
        return False
    total_minutes = dt.hour * 60 + dt.minute
    return REGULAR_OPEN_MINUTES <= total_minutes < REGULAR_CLOSE_MINUTES


def check_us_market_active() -> bool:
    """Backward-compatible alias for regular session check."""
    return is_us_regular_session_open()
