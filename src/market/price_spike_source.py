"""Single source of truth for price spike panel data (v_price_spikes)."""

from __future__ import annotations

from typing import Any, Dict, List

from src.market.pre_spike_source import pre_spike_monitor_where

PRICE_SPIKE_VIEW = "v_price_spikes"

PRICE_SPIKE_SELECT_COLUMNS = """
    event_start,
    symbol,
    price,
    action,
    quality,
    setup
""".strip()


def price_spike_from_clause(db: str) -> str:
    return f"{db}.{PRICE_SPIKE_VIEW}"


def _time_column_where(lookback_sec: int) -> str:
    """v_price_spikes uses event_start; same ET session window as pre-spike."""
    base = pre_spike_monitor_where(lookback_sec)
    return base.replace("alert_time", "event_start")


def price_spike_monitor_poll_sql(db: str, *, lookback_sec: int, row_limit: int) -> str:
    return f"""
    SELECT
        {PRICE_SPIKE_SELECT_COLUMNS}
    FROM {price_spike_from_clause(db)}
    WHERE {_time_column_where(lookback_sec)}
    ORDER BY event_start ASC, symbol ASC
    LIMIT {int(row_limit)}
    """


def price_spike_monitor_snapshot_sql(db: str, *, lookback_sec: int, row_limit: int) -> str:
    return f"""
    SELECT
        {PRICE_SPIKE_SELECT_COLUMNS}
    FROM {price_spike_from_clause(db)}
    WHERE {_time_column_where(lookback_sec)}
    ORDER BY event_start DESC, symbol ASC
    LIMIT {int(row_limit)}
    """


def normalize_price_spike_row(row: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, value in row.items():
        if hasattr(value, "isoformat"):
            out[key] = value.isoformat()
        elif hasattr(value, "as_tuple"):
            out[key] = float(value)
        else:
            out[key] = value
    return out


def normalize_price_spike_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [normalize_price_spike_row(r) for r in rows]
