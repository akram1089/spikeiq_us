"""Single source of truth for pre-spike watchlist data (v_pre_spike_alerts_ui)."""

from __future__ import annotations

from typing import Any, Dict, List

# Dashboard + WebSocket alerts both read this view (not price_spike_alerts).
PRE_SPIKE_UI_VIEW = "v_pre_spike_alerts_ui"

PRE_SPIKE_UI_SELECT_COLUMNS = """
    alert_time,
    symbol,
    price,
    signal_type,
    setup,
    alert_status
""".strip()


def pre_spike_ui_from_clause(db: str) -> str:
    return f"{db}.{PRE_SPIKE_UI_VIEW}"


def pre_spike_monitor_where(lookback_sec: int) -> str:
    """ET session window: today from midnight America/New_York, plus lookback."""
    return f"""
    alert_time >= greatest(
        now() - INTERVAL {int(lookback_sec)} SECOND,
        toDateTime(concat(toString(toDate(now(), 'America/New_York')), ' 00:00:00'), 'America/New_York')
    )
    """.strip()


def pre_spike_monitor_poll_sql(db: str, *, lookback_sec: int, row_limit: int) -> str:
    """Ascending order — dispatch oldest unseen row first."""
    return f"""
    SELECT
        {PRE_SPIKE_UI_SELECT_COLUMNS}
    FROM {pre_spike_ui_from_clause(db)}
    WHERE {pre_spike_monitor_where(lookback_sec)}
    ORDER BY alert_time ASC, symbol ASC
    LIMIT {int(row_limit)}
    """


def pre_spike_monitor_snapshot_sql(db: str, *, lookback_sec: int, row_limit: int) -> str:
    """Descending order — matches: SELECT * FROM v_pre_spike_alerts_ui ORDER BY alert_time DESC."""
    return f"""
    SELECT
        {PRE_SPIKE_UI_SELECT_COLUMNS}
    FROM {pre_spike_ui_from_clause(db)}
    WHERE {pre_spike_monitor_where(lookback_sec)}
    ORDER BY alert_time DESC, symbol ASC
    LIMIT {int(row_limit)}
    """


def normalize_pre_spike_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize ClickHouse row for API / WebSocket payloads."""
    out: Dict[str, Any] = {}
    for key, value in row.items():
        if hasattr(value, "isoformat"):
            out[key] = value.isoformat()
        elif hasattr(value, "as_tuple"):
            out[key] = float(value)
        else:
            out[key] = value
    return out


def normalize_pre_spike_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [normalize_pre_spike_row(r) for r in rows]
