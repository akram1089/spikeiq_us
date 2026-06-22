"""Read-only ClickHouse analytics endpoints for dashboard and pre-spike UI."""

from __future__ import annotations

import time
from datetime import date as date_cls, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from loguru import logger

from config import settings
from src.auth.router import get_current_user
from src.db.clickhouse_client import ch_manager

router = APIRouter(prefix="/api/market", tags=["market-analytics"])

TZ = "America/New_York"
_IST_OFFSET = timedelta(hours=5, minutes=30)
ENABLE_PRE_SPIKE_ALERTS = True

_SYMBOL_ALLOWED_CHARS = set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.& "
)


def ch_query(sql: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    client = ch_manager.get_client()
    result = client.query(sql, parameters=parameters or {})
    cols = result.column_names
    return [dict(zip(cols, row)) for row in result.result_rows]



_pre_spike_views_checked = False


async def check_and_create_pre_spike_views():
    global _pre_spike_views_checked
    if _pre_spike_views_checked:
        return
    logger.info("Pre-spike view check skipped (deploy analytics views via SQL script).")
    _pre_spike_views_checked = True


class PreSpikeDashboardResponse(BaseModel):
    kpis: Dict[str, Any]
    watchlist: List[Dict[str, Any]]
    watchlist_total: int
    alerts: List[Dict[str, Any]]
    alerts_total: int
    symbols: List[str]


def _et_to_utc(ts_str: str) -> str:
    """Convert an IST datetime string (from frontend datetime-local input) to UTC.

    The frontend sends values like '2026-05-15T10:42' which are in
    America/New_York (IST = UTC+05:30).  ClickHouse stores everything in UTC,
    so we subtract 5 h 30 min before building the SQL filter.
    """
    ts_str = ts_str.replace('T', ' ')
    if len(ts_str) == 16:          # '2026-05-15 10:42'
        ts_str += ':00'
    try:
        dt_ist = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        # handle milliseconds or other formats
        dt_ist = datetime.fromisoformat(ts_str)
    dt_utc = dt_ist - _IST_OFFSET
    return dt_utc.strftime("%Y-%m-%d %H:%M:%S")


def _utc_to_et_str(dt_val) -> str:
    """Convert a datetime value from ClickHouse to an IST ISO string."""
    if not hasattr(dt_val, "isoformat"):
        dt_val = datetime.fromisoformat(str(dt_val))
    if dt_val.tzinfo is None:
        dt_val = dt_val.replace(tzinfo=ZoneInfo("America/New_York"))
    dt_ist = dt_val.astimezone(ZoneInfo("America/New_York"))
    return dt_ist.isoformat()


def _today_et() -> date_cls:
    """Return today's calendar date in America/New_York (IST).

    This is the single source of truth for the dashboard's "today" anchor —
    all dashboard panels (summary, opportunities, breadth, trends) should
    derive their day clause from this helper so calendar-day semantics match
    the Price Spikes page.
    """
    return datetime.now(ZoneInfo("America/New_York")).date()


# Allowlist for the dashboard's `symbol` query parameter. The price_spike_alerts
# table stores tradingsymbols which are short uppercase identifiers (letters,
# digits, hyphens, ampersands, dot for series suffixes); anything outside this
# set is rejected so we never need to interpolate arbitrary user input into a
# raw SQL fragment.
_SYMBOL_ALLOWED_CHARS = set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
    "-_.& "
)


def _is_valid_symbol(symbol: str) -> bool:
    """Validate a dashboard `symbol` query param against an allowlist."""
    if not symbol:
        return False
    if len(symbol) > 32:
        return False
    return all(ch in _SYMBOL_ALLOWED_CHARS for ch in symbol)


def _build_dashboard_where(
    target_date: date_cls,
    symbol: Optional[str],
    timeframe: str,
    today_et: date_cls,
    max_time: Any,
    col_name: str = "event_time"
) -> Tuple[str, str, Dict[str, Any]]:
    """Build the shared WHERE clauses for every dashboard panel query.

    Returns a tuple ``(base_where, windowed_where, params)`` where:
      * ``base_where`` scopes to the IST calendar day given by ``target_date``
        and (optionally) the ``symbol`` filter — this is what every panel
        ultimately filters on.
      * ``windowed_where`` is ``base_where`` plus the timeframe slice
        (``''`` extra clause for ``timeframe == 'ALL'``; otherwise an
        ``event_time >= anchor - INTERVAL N MINUTE`` slice anchored on
        ``now()`` when ``target_date == today_et``, else on the latest
        ``event_time`` of ``target_date`` — which is exactly ``max_time``
        when ``chosen_target_date`` is the latest day with data).
      * ``params`` holds the bound values (``target_date`` and ``symbol``)
        for the project's ClickHouse parameterized-query API
        (``{name:Type}`` placeholders + ``parameters=`` kwarg).

    All four panel queries (summary, opportunities, breadth, trends) MUST
    consume ``windowed_where`` so their (date, symbol, timeframe) scope is
    identical and the dashboard panels move together.
    """
    params: Dict[str, Any] = {
        "target_date": target_date.isoformat(),
    }

    base_where = (
        f"toDate({col_name}) = toDate({{target_date:String}})"
    )

    # Restrict to 9:20 AM to 3:20 PM IST (America/New_York timezone)
    time_window_filter = f"toHour(toTimeZone({col_name}, 'America/New_York')) * 100 + toMinute(toTimeZone({col_name}, 'America/New_York')) BETWEEN 930 AND 1600"
    base_where += f" AND {time_window_filter}"

    if symbol:
        # Defensive validation — the caller is expected to have already
        # rejected malformed values, but we re-check here so the helper is
        # safe in isolation.
        if not _is_valid_symbol(symbol):
            raise HTTPException(
                status_code=400,
                detail="symbol must contain only letters, digits, '-', '_', '.', or '&'",
            )
        params["symbol"] = symbol
        base_where += " AND symbol = {symbol:String}"

    tf_str = str(timeframe).upper()
    if tf_str == "ALL":
        if symbol:
            windowed_where = f"symbol = {{symbol:String}} AND {time_window_filter}"
        else:
            windowed_where = time_window_filter
    elif tf_str == "DAY":
        windowed_where = base_where
    else:
        try:
            minutes = int(timeframe)
        except (TypeError, ValueError):
            minutes = 30

        if target_date == today_et:
            anchor_expr = "now()"
        else:
            if max_time:
                params["anchor_time"] = max_time
                anchor_expr = "{anchor_time:DateTime64(3)}" if col_name == "event_start" else "{anchor_time:DateTime}"
            else:
                anchor_expr = f"toDateTime('{target_date.isoformat()} 15:30:00', 'America/New_York')"

        windowed_where = (
            f"{base_where} AND {col_name} >= {anchor_expr} - INTERVAL {minutes} MINUTE"
        )

    return base_where, windowed_where, params

@router.get("/pre-spike", )
async def get_pre_spike_dashboard(
    timeframe: str = Query(default="DAY", description="Timeframe filter (15m, 30m, 45m, 60m, Day, All)"),
    symbol: Optional[str] = Query(default=None, description="Optional symbol filter"),
    symbol_type: str = Query(default="ALL", description="Filter by symbol type (ALL, FUTURES, INDEX, STOCK)"),
    wl_page: int = Query(default=1, ge=1, description="Watchlist page number"),
    wl_page_size: int = Query(default=10, ge=1, description="Watchlist page size"),
    alerts_page: int = Query(default=1, ge=1, description="Alerts page number"),
    alerts_page_size: int = Query(default=10, ge=1, description="Alerts page size"),
    alerts_action: str = Query(default="ALL", description="Alerts action tab filter (ALL, BUY, STRONG BUY, SELL, STRONG SELL, HOLD)"),
    user: dict = Depends(get_current_user)
):
    """Get Pre-Spike watch opportunities and counts from UI views."""
    # DISABLED: ClickHouse analytics pipeline (v_pre_spike_alerts_ui view chain) currently
    # returns 0 rows and causes significant unnecessary CPU load (~681 queries, avg 2s, max 8.9s).
    # Returning empty payload immediately — NO queries sent to v_pre_spike_alerts_ui.
    # Re-enable by setting ENABLE_PRE_SPIKE_ALERTS = True in this file.
    if not ENABLE_PRE_SPIKE_ALERTS:
        return {
            "kpis": {"futures_leads": 0, "index_watches": 0, "stock_watches": 0, "active_spikes": 0},
            "watchlist": [],
            "watchlist_total": 0,
            "alerts": [],
            "alerts_total": 0,
            "symbols": []
        }
    await check_and_create_pre_spike_views()
    try:
        db_name = settings.CLICKHOUSE_DB
        
        from datetime import datetime
        try:
            from zoneinfo import ZoneInfo
            today_et = datetime.now(tz=ZoneInfo("America/New_York")).date()
        except Exception:
            from datetime import timedelta
            # Fallback to UTC + 5:30 for IST
            today_et = (datetime.utcnow() + timedelta(hours=5, minutes=30)).date()
        today_str = today_et.isoformat()

        tf = timeframe.upper().strip()

        # 1. Watchlist fallback date check
        effective_date_str = today_str
        no_date_filter_watchlist = False
        if tf == "DAY":
            try:
                date_res = ch_query(
                    f"SELECT max(toDate(alert_time)) as max_d, "
                    f"countIf(toDate(alert_time) = toDate('{today_str}')) as today_c "
                    f"FROM {db_name}.v_pre_spike_alerts_ui "
                    f"WHERE alert_time >= today() - 7"
                )
                if date_res:
                    row = date_res[0]
                    today_c = row.get("today_c", 0)
                    max_d = row.get("max_d")
                    if today_c > 0:
                        effective_date_str = today_str
                    elif max_d and str(max_d) not in ("1970-01-01", "1970-01-02", "0000-00-00", "0000-01-01", "1970-01-01 00:00:00"):
                        effective_date_str = str(max_d)
                    else:
                        no_date_filter_watchlist = True
                else:
                    no_date_filter_watchlist = True
            except Exception as _e:
                logger.warning(f"Pre-spike DAY fallback check failed: {_e}")
                no_date_filter_watchlist = True

        # 2. Price spikes fallback date check
        effective_spike_date_str = today_str
        no_date_filter_spike = False
        if tf == "DAY":
            try:
                spike_date_res = ch_query(
                    f"SELECT max(toDate(event_start)) as max_d, "
                    f"countIf(toDate(event_start) = toDate('{today_str}')) as today_c "
                    f"FROM {db_name}.v_price_spike_alerts_ui "
                    f"WHERE event_start >= today() - 7"
                )
                if spike_date_res:
                    row = spike_date_res[0]
                    today_c = row.get("today_c", 0)
                    max_d = row.get("max_d")
                    if today_c > 0:
                        effective_spike_date_str = today_str
                    elif max_d and str(max_d) not in ("1970-01-01", "1970-01-02", "0000-00-00", "0000-01-01", "1970-01-01 00:00:00"):
                        effective_spike_date_str = str(max_d)
                    else:
                        no_date_filter_spike = True
                else:
                    no_date_filter_spike = True
            except Exception as _e:
                logger.warning(f"Pre-spike alerts DAY fallback check failed: {_e}")
                no_date_filter_spike = True

        # 3. Build watchlist filters
        # Always enforce a minimum 7-day bound to prevent full 4.9M row scans
        watchlist_where_clauses = ["alert_time >= now() - INTERVAL 7 DAY"]
        params = {}
        if symbol:
            watchlist_where_clauses.append("symbol = {symbol:String}")
            params["symbol"] = symbol

        if tf == "15M":
            watchlist_where_clauses.append("alert_time >= now() - INTERVAL 15 MINUTE")
        elif tf == "30M":
            watchlist_where_clauses.append("alert_time >= now() - INTERVAL 30 MINUTE")
        elif tf == "45M":
            watchlist_where_clauses.append("alert_time >= now() - INTERVAL 45 MINUTE")
        elif tf == "60M":
            watchlist_where_clauses.append("alert_time >= now() - INTERVAL 60 MINUTE")
        elif tf == "DAY" and not no_date_filter_watchlist:
            watchlist_where_clauses.append(
                f"alert_time >= toDateTime('{effective_date_str} 00:00:00', 'America/New_York') "
                f"AND alert_time <= toDateTime('{effective_date_str} 23:59:59', 'America/New_York')"
            )

        if not no_date_filter_watchlist and tf != "ALL":
            watchlist_where_clauses.append("toHour(toTimeZone(alert_time, 'America/New_York')) * 100 + toMinute(toTimeZone(alert_time, 'America/New_York')) BETWEEN 930 AND 1600")

        # Classify symbol type in ClickHouse
        is_index_sql = (
            "(upper(symbol) IN ('SPX', 'NDX', 'COMP', 'DJI', 'RUT', 'VIX') OR upper(symbol) LIKE '%INDEX%')"
        )
        sym_type = symbol_type.upper().strip()
        if sym_type == "INDEX":
            watchlist_where_clauses.append(f"{is_index_sql} AND upper(symbol) NOT LIKE '/%'")
        elif sym_type == "FUTURES":
            watchlist_where_clauses.append("upper(symbol) LIKE '/%'")
        elif sym_type == "STOCK":
            watchlist_where_clauses.append(f"NOT {is_index_sql} AND upper(symbol) NOT LIKE '/%'")

        watchlist_where_str = " AND ".join(watchlist_where_clauses)

        # 4. Build price spike filters
        # Always enforce a minimum 7-day bound to prevent full table scans
        spike_where_clauses = ["event_start >= now() - INTERVAL 7 DAY"]
        if symbol:
            spike_where_clauses.append("symbol = {symbol:String}")

        if tf == "15M":
            spike_where_clauses.append("event_start >= now() - INTERVAL 15 MINUTE")
        elif tf == "30M":
            spike_where_clauses.append("event_start >= now() - INTERVAL 30 MINUTE")
        elif tf == "45M":
            spike_where_clauses.append("event_start >= now() - INTERVAL 45 MINUTE")
        elif tf == "60M":
# Build a 60‑minute look‑back window for spike detection
            spike_where_clauses.append("event_start >= now() - INTERVAL 60 MINUTE")
        elif tf == "DAY" and not no_date_filter_spike:
            spike_where_clauses.append(
                f"event_start >= toDateTime('{effective_spike_date_str} 00:00:00', 'America/New_York') "
                f"AND event_start <= toDateTime('{effective_spike_date_str} 23:59:59', 'America/New_York')"
            )

        if not no_date_filter_spike and tf != "ALL":
            spike_where_clauses.append("toHour(toTimeZone(event_start, 'America/New_York')) * 100 + toMinute(toTimeZone(event_start, 'America/New_York')) BETWEEN 930 AND 1600")

        if sym_type == "INDEX":
            spike_where_clauses.append(f"{is_index_sql} AND upper(symbol) NOT LIKE '/%'")
        elif sym_type == "FUTURES":
            spike_where_clauses.append("upper(symbol) LIKE '/%'")
        elif sym_type == "STOCK":
            spike_where_clauses.append(f"NOT {is_index_sql} AND upper(symbol) NOT LIKE '/%'")

        spike_base_where_str = " AND ".join(spike_where_clauses)

# ---------------------------------------------------------------------
        # Alerts table action filter – optionally restrict alerts by their
        # action type (e.g. BUY, SELL). When `alerts_action` is not "ALL" we add
        # a condition on the `action` column.
        # ---------------------------------------------------------------------
        # Alerts table action filter
        alerts_where_clauses = list(spike_where_clauses)
        action_tab = alerts_action.upper().strip()
        if action_tab != "ALL":
            alerts_where_clauses.append("upper(action) = {alerts_action:String}")
            params["alerts_action"] = action_tab
        alerts_where_str = " AND ".join(alerts_where_clauses)

        # 5. KPI Counts from the new views (uses watchlist_where_str and spike_base_where_str)
# ---------------------------------------------------------------------
        # KPI Counts – aggregate the number of pre‑spike alerts by `signal_type`
        # using the materialised view `v_pre_spike_alerts_ui`. The `watchlist_where_str`
        # clause applies the same date/symbol filters as the main alert query.
        # ---------------------------------------------------------------------
        kpis_query = f"""
        SELECT signal_type, count() as cnt 
        FROM {db_name}.v_pre_spike_alerts_ui
        WHERE {watchlist_where_str}
        GROUP BY signal_type
        """
# Execute the KPI aggregation query and fetch results
        kpis_res = ch_query(kpis_query, parameters=params)

        fl_count = iw_count = sw_count = 0
        for r in kpis_res:
            st = str(r.get("signal_type", "")).upper()
            cnt = r.get("cnt", 0)
            if "FUTURES" in st or "LEAD" in st:
                fl_count += cnt
            elif "INDEX" in st:
                iw_count += cnt
            elif "STOCK" in st:
                sw_count += cnt

        as_query = f"""
        SELECT count() as cnt FROM {db_name}.v_price_spikes
        WHERE {spike_base_where_str}
        """
        as_res = ch_query(as_query, parameters=params)
        as_count = as_res[0]["cnt"] if as_res else 0

        # Query watchlist total count
        watchlist_count_query = f"""
        SELECT count() as cnt 
        FROM {db_name}.v_pre_spike_alerts_ui
        WHERE {watchlist_where_str}
        """
        wl_count_res = ch_query(watchlist_count_query, parameters=params)
        watchlist_total = wl_count_res[0]["cnt"] if wl_count_res else 0

        # Query alerts total count
        alerts_count_query = f"""
        SELECT count() as cnt 
        FROM {db_name}.v_price_spikes
        WHERE {alerts_where_str}
        """
        alerts_count_res = ch_query(alerts_count_query, parameters=params)
        alerts_total = alerts_count_res[0]["cnt"] if alerts_count_res else 0

        # 6. Watchlist query — paginated
        wl_limit = max(1, wl_page_size)
        wl_offset = max(0, (wl_page - 1) * wl_page_size)
        watchlist_query = f"""
        SELECT
            alert_time,
            symbol,
            price,
            signal_type,
            setup,
            alert_status
        FROM {db_name}.v_pre_spike_alerts_ui
        WHERE {watchlist_where_str}
        ORDER BY alert_time DESC
        LIMIT {wl_limit} OFFSET {wl_offset}
        """
        watchlist_raw = ch_query(watchlist_query, parameters=params)
        watchlist = []
        for r in watchlist_raw:
            item = {}
            for k, v in r.items():
                if k == "alert_time" and hasattr(v, "isoformat"):
                    item[k] = v.isoformat()
                else:
                    item[k] = float(v) if hasattr(v, "as_tuple") else v
            watchlist.append(item)

        # 7. Price Spike Alerts query — paginated
        alerts_limit = max(1, alerts_page_size)
        alerts_offset = max(0, (alerts_page - 1) * alerts_page_size)
        alerts_query = f"""
        SELECT
            event_start,
            symbol,
            price,
            action,
            quality,
            setup
        FROM {db_name}.v_price_spikes
        WHERE {alerts_where_str}
        ORDER BY event_start DESC
        LIMIT {alerts_limit} OFFSET {alerts_offset}
        """
        alerts_raw = ch_query(alerts_query, parameters=params)
        alerts = []
        for r in alerts_raw:
            item = {}
            for k, v in r.items():
                if k == "event_start" and hasattr(v, "isoformat"):
                    item[k] = v.isoformat()
                else:
                    item[k] = float(v) if hasattr(v, "as_tuple") else v
            alerts.append(item)

        # Query all unique symbols matching the active date/timeframe/type filters
        watchlist_where_no_sym_clauses = [c for c in watchlist_where_clauses if "symbol =" not in c]
        watchlist_where_no_sym_str = " AND ".join(watchlist_where_no_sym_clauses)
        spike_where_no_sym_clauses = [c for c in spike_where_clauses if "symbol =" not in c]
        spike_where_no_sym_str = " AND ".join(spike_where_no_sym_clauses)

        # ---- Simple in‑memory cache (TTL 5 minutes) ----
        CACHE_TTL_SECONDS = 300
        if not hasattr(__import__('builtins'), '_symbol_cache'):
            # initialise cache on first request
            __import__('builtins')._symbol_cache = {"data": None, "ts": 0}
        cache = __import__('builtins')._symbol_cache
        now_ts = time.time()
        if cache["data"] is not None and (now_ts - cache["ts"]) < CACHE_TTL_SECONDS:
            symbols = cache["data"]
        else:
            symbols_query = f"""
            SELECT distinct symbol FROM (
                SELECT symbol FROM {db_name}.v_pre_spike_alerts_ui WHERE {watchlist_where_no_sym_str}
                UNION ALL
                SELECT symbol FROM {db_name}.v_price_spikes WHERE {spike_where_no_sym_str}
            )
            ORDER BY symbol ASC
            """
            symbols_res = ch_query(symbols_query, parameters=params)
            symbols = [r["symbol"] for r in symbols_res if r.get("symbol")]
            # store in cache
            cache["data"] = symbols
            cache["ts"] = now_ts
        # --------------------------------------------
            
        return {
            "kpis": {
                "futures_leads": fl_count,
                "index_watches": iw_count,
                "stock_watches": sw_count,
                "active_spikes": as_count,
            },
            "watchlist": watchlist,
            "watchlist_total": int(watchlist_total),
            "alerts": alerts,
            "alerts_total": int(alerts_total),
            "symbols": symbols
        }

    except Exception as e:
        logger.error(f"Error compiling pre-spike dashboard endpoint: {e}", exc_info=True)
        return {
            "kpis": {"futures_leads": 0, "index_watches": 0, "stock_watches": 0, "active_spikes": 0},
            "watchlist": [],
            "watchlist_total": 0,
            "alerts": [],
            "alerts_total": 0,
            "symbols": []
        }



@router.get("/dashboard-analytics")
async def get_dashboard_analytics(
    timeframe: str = Query(default="30", description="Timeframe in minutes or 'ALL'"),
    symbol: Optional[str] = Query(default=None, description="Optional symbol filter for trends and summary"),
    target_date: Optional[str] = Query(
        default=None,
        description=(
            "Optional ISO calendar date (YYYY-MM-DD) anchor for all dashboard panels. "
            "When omitted, the server picks today (IST) if the alerts table has rows "
            "for today, otherwise falls back to the latest day with data."
        ),
    ),
    opp_page: int = Query(default=1, ge=1, description="Opportunities page number"),
    opp_page_size: int = Query(default=15, ge=1, description="Opportunities page size"),
    opp_action: str = Query(default="ALL", description="Opportunities action filter (ALL, BUY, STRONG BUY, SELL, STRONG SELL, HOLD)"),
    backup_opp_page: int = Query(default=1, ge=1, description="Backup opportunities page number"),
    backup_opp_page_size: int = Query(default=15, ge=1, description="Backup opportunities page size"),
    backup_opp_action: str = Query(default="ALL", description="Backup opportunities action filter (ALL, BUY, STRONG BUY, SELL, STRONG SELL, HOLD)"),
    user: dict = Depends(get_current_user)
):
    """Get aggregated dashboard metrics, trading opportunities, and intraday trends from ClickHouse."""
    try:
        db_name = settings.CLICKHOUSE_DB
        # ── Shared calendar-day anchor (target_date) ──
        # The dashboard must scope to the same calendar day the Price Spikes page
        # would show by default (today IST). Fall back to the latest day with data
        # only when today has no rows, so the dashboard never shows an empty board
        # on a quiet day. The day check uses IST so it lines up with the Price
        # Spikes page's `'en-CA'`-formatted local date input.
        today_et = _today_et()
 
        # Parse the optional explicit date forwarded by the front end. Reject any
        # value that is not a valid ISO date so we never interpolate arbitrary
        # strings into SQL downstream.
        explicit_target_date: Optional[date_cls] = None
        if target_date:
            try:
                explicit_target_date = date_cls.fromisoformat(target_date)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="target_date must be an ISO calendar date (YYYY-MM-DD)",
                )
 
        # Validate the symbol filter upfront. The dashboard only ever needs
        # short uppercase tradingsymbols (letters, digits, '-', '_', '.', '&');
        # anything else is rejected so the shared WHERE-builder can rely on a
        # clean value when binding it via the ClickHouse parameterized API.
        if symbol is not None and symbol != "" and not _is_valid_symbol(symbol):
            raise HTTPException(
                status_code=400,
                detail="symbol must contain only letters, digits, '-', '_', '.', or '&'",
            )
 
        # Single query that returns both the latest event time AND the latest IST
        # calendar date with data, plus a flag for whether today IST has any rows.
        max_time = None
        max_date = None
        today_count = 0
        try:
            max_res = ch_query(
                f"SELECT event_start FROM {db_name}.v_trade_opportunities "
                f"ORDER BY event_start DESC LIMIT 1"
            )
            if max_res:
                max_time = max_res[0]["event_start"]
                if hasattr(max_time, "date"):
                    max_date = max_time.date()
                else:
                    max_date = date_cls.fromisoformat(str(max_time)[:10])
        except Exception as e:
            logger.warning(f"Failed to fetch dashboard max_time: {e}")
 
        if max_time:
            try:
                count_res = ch_query(
                    f"SELECT count() as cnt FROM {db_name}.v_trade_opportunities "
                    f"WHERE toDate(event_start) = toDate('{today_et.isoformat()}')"
                )
                if count_res:
                    today_count = count_res[0]["cnt"]
            except Exception as e:
                logger.warning(f"Failed to fetch dashboard today count: {e}")
 
        if not max_time:
            # Table is completely empty — return an empty board but still honour the
            # response shape so the front end can render a sensible label.
            anchor = explicit_target_date or today_et
            return {
                "summary": {
                    "active_signals": 0, "buy_signals": 0, "sell_signals": 0,
                    "hold_signals": 0, "spikes_count": 0,
                    "market_breadth": {"adv": 0, "dec": 0, "unch": 0},
                    "target_date": anchor.isoformat(),
                    "is_today": anchor == today_et,
                },
                "opportunities": [],
                "opportunities_total": 0,
                "backup_opportunities": [],
                "backup_opportunities_total": 0,
                "trends": [],
                "symbols": []
            }
 
        # Pick the anchor: explicit query parameter > today (if it has rows) > max_date.
        if explicit_target_date is not None:
            chosen_target_date = explicit_target_date
        elif today_count and today_count > 0:
            chosen_target_date = today_et
        else:
            chosen_target_date = max_date if isinstance(max_date, date_cls) else date_cls.fromisoformat(str(max_date))
 
        is_today = chosen_target_date == today_et
 
        max_opp_time = None
        max_alert_time = None
        if not is_today:
            if chosen_target_date == max_date:
                max_opp_time = max_time
            else:
                try:
                    opp_res = ch_query(
                        f"SELECT max(event_start) as m FROM {db_name}.v_trade_opportunities "
                        f"WHERE event_start >= toDateTime('{chosen_target_date.isoformat()} 00:00:00', 'America/New_York') "
                        f"AND event_start <= toDateTime('{chosen_target_date.isoformat()} 23:59:59', 'America/New_York')"
                    )
                    max_opp_time = opp_res[0]["m"] if opp_res else None
                except Exception:
                    pass
 
            try:
                alert_res = ch_query(
                    f"SELECT max(event_time) as m FROM {db_name}.price_spike_alerts "
                    f"WHERE event_time >= toDateTime('{chosen_target_date.isoformat()} 00:00:00', 'America/New_York') "
                    f"AND event_time <= toDateTime('{chosen_target_date.isoformat()} 23:59:59', 'America/New_York')"
                )
                max_alert_time = alert_res[0]["m"] if alert_res else None
            except Exception:
                pass
 
        # ── Single shared WHERE-builder for every dashboard panel ──
        # Build the (date, symbol, timeframe) scope ONCE and apply it uniformly to
        # all four panel queries (summary, opportunities, breadth, trends) so they
        # are computed from the same record set. Values are bound via the project's
        # ClickHouse client parameterized-query API (`{name:Type}` placeholders +
        # `parameters=` kwarg) so user input is never interpolated as raw SQL.
        _, windowed_where, where_params = _build_dashboard_where(
            target_date=chosen_target_date,
            symbol=symbol,
            timeframe=timeframe,
            today_et=today_et,
            max_time=max_alert_time,
            col_name="event_time",
        )
 
        _, opp_windowed_where, _ = _build_dashboard_where(
            target_date=chosen_target_date,
            symbol=symbol,
            timeframe=timeframe,
            today_et=today_et,
            max_time=max_opp_time,
            col_name="event_start",
        )
  
        # 1. Summary statistics & Market Breadth combined query, scoped to the same window as opportunities.
        combined_query = f"""
        SELECT
            uniq(symbol) as active_signals,
            countIf(upper(action) = 'BUY') as buy_signals,
            countIf(upper(action) = 'STRONG BUY') as strong_buy_signals,
            countIf(upper(action) = 'SELL') as sell_signals,
            countIf(upper(action) = 'STRONG SELL') as strong_sell_signals,
            countIf(upper(action) NOT IN ('BUY', 'STRONG BUY', 'SELL', 'STRONG SELL')) as hold_signals,
            count() as spikes_count,
            countIf(price_move > 0) as adv,
            countIf(price_move < 0) as dec,
            countIf(price_move = 0) as unch
        FROM {db_name}.v_trade_opportunities
        WHERE {opp_windowed_where}
        """
        combined_res = ch_query(combined_query, parameters=where_params)
        res_row = combined_res[0] if combined_res else {}
        summary = {
            "active_signals": res_row.get("active_signals", 0),
            "buy_signals": res_row.get("buy_signals", 0),
            "strong_buy_signals": res_row.get("strong_buy_signals", 0),
            "sell_signals": res_row.get("sell_signals", 0),
            "strong_sell_signals": res_row.get("strong_sell_signals", 0),
            "hold_signals": res_row.get("hold_signals", 0),
            "spikes_count": res_row.get("spikes_count", 0),
        }
        breadth = {
            "adv": res_row.get("adv", 0),
            "dec": res_row.get("dec", 0),
            "unch": res_row.get("unch", 0)
        }
 
        # 3. Priority Opportunities — paginated
        opp_where_clauses = [opp_windowed_where]
        opp_action_tab = opp_action.upper().strip()
        if opp_action_tab != "ALL":
            opp_where_clauses.append("upper(action) = {opp_action:String}")
            where_params["opp_action"] = opp_action_tab
        opp_final_where = " AND ".join(opp_where_clauses)

        # Count total Priority Opportunities
        opp_count_query = f"""
        SELECT count() as cnt
        FROM {db_name}.v_trade_opportunities
        WHERE {opp_final_where}
        """
        opp_count_res = ch_query(opp_count_query, parameters=where_params)
        opportunities_total = opp_count_res[0]["cnt"] if opp_count_res else 0

        opp_limit = max(1, opp_page_size)
        opp_offset = max(0, (opp_page - 1) * opp_page_size)
        opp_query = f"""
        SELECT
            event_start,
            symbol,
            entry_price,
            action,
            quality,
            opportunity,
            instrument_token
        FROM {db_name}.v_trade_opportunities
        WHERE {opp_final_where}
        ORDER BY event_start DESC
        LIMIT {opp_limit} OFFSET {opp_offset}
        """
        opportunities = ch_query(opp_query, parameters=where_params)
  
        # Format dates in opportunities to strings
        for o in opportunities:
            if "event_start" in o and hasattr(o["event_start"], "isoformat"):
                o["event_start"] = o["event_start"].isoformat()
  
        # 3b. Backup trading opportunities (price_spike_alerts) for the same window.
        backup_where_clauses = [windowed_where]
        backup_action_tab = backup_opp_action.upper().strip()
        if backup_action_tab != "ALL":
            if backup_action_tab == "STRONG BUY":
                backup_where_clauses.append("(upper(final_signal) = 'STRONG BUY' OR final_signal = '5')")
            elif backup_action_tab == "STRONG SELL":
                backup_where_clauses.append("(upper(final_signal) = 'STRONG SELL' OR final_signal = '4')")
            elif backup_action_tab == "BUY":
                backup_where_clauses.append("(upper(final_signal) = 'BUY' OR final_signal = '2')")
            elif backup_action_tab == "SELL":
                backup_where_clauses.append("(upper(final_signal) = 'SELL' OR final_signal = '3')")
            elif backup_action_tab == "HOLD":
                backup_where_clauses.append("upper(final_signal) NOT IN ('STRONG BUY', '5', 'STRONG SELL', '4', 'BUY', '2', 'SELL', '3')")
        backup_final_where = " AND ".join(backup_where_clauses)

        # Count total Backup Opportunities
        backup_count_query = f"""
        SELECT count() as cnt
        FROM {db_name}.price_spike_alerts
        WHERE {backup_final_where}
        """
        backup_count_res = ch_query(backup_count_query, parameters=where_params)
        backup_opportunities_total = backup_count_res[0]["cnt"] if backup_count_res else 0

        backup_opp_limit = max(1, backup_opp_page_size)
        backup_opp_offset = max(0, (backup_opp_page - 1) * backup_opp_page_size)
        backup_opp_query = f"""
        SELECT
            event_time AS event_start,
            symbol,
            final_signal AS event_signal,
            CAST(confidence_score, 'Float64') AS event_score,
            CAST(confidence_score, 'Float64') AS max_confidence,
            pct_change AS price_move,
            ticks AS alerts_in_event,
            0 AS duration_seconds,
            instrument_token,
            if(upper(final_signal) = 'STRONG BUY' OR final_signal = '5', 'STRONG BUY',
               if(upper(final_signal) = 'STRONG SELL' OR final_signal = '4', 'STRONG SELL',
                  if(upper(final_signal) = 'BUY' OR final_signal = '2', 'BUY',
                     if(upper(final_signal) = 'SELL' OR final_signal = '3', 'SELL', 'HOLD')))) as signal_bucket,
            open,
            high,
            low,
            close,
            prev_close,
            price_diff,
            pct_change,
            rsi,
            rsi_slope,
            prev_rsi,
            ticks,
            confidence_score,
            rsi_signal
        FROM {db_name}.price_spike_alerts
        WHERE {backup_final_where}
        ORDER BY event_time DESC
        LIMIT {backup_opp_limit} OFFSET {backup_opp_offset}
        """
        backup_opportunities = ch_query(backup_opp_query, parameters=where_params)
  
        # Format dates in backup opportunities to strings
        for o in backup_opportunities:
            if "event_start" in o and hasattr(o["event_start"], "isoformat"):
                o["event_start"] = o["event_start"].isoformat()
  
        # 4. Intraday spike trends grouped into 15-minute IST buckets, on the SAME window.
        trend_query = f"""
        SELECT
            toStartOfFifteenMinutes(toTimeZone(event_start, 'America/New_York')) as interval_time,
            countIf(price_move > 0) as up_spikes,
            countIf(price_move < 0) as down_spikes
        FROM {db_name}.v_trade_opportunities
        WHERE {opp_windowed_where}
        GROUP BY interval_time
        ORDER BY interval_time ASC
        """
        trends = ch_query(trend_query, parameters=where_params)
 
        # Format trends time to format like '09:15'
        formatted_trends = []
        for t in trends:
            interval_time = t["interval_time"]
            time_str = ""
            if hasattr(interval_time, "strftime"):
                time_str = interval_time.strftime("%H:%M")
            else:
                time_str = str(interval_time)[11:16] if len(str(interval_time)) >= 16 else str(interval_time)
            
            formatted_trends.append({
                "time": time_str,
                "up_spikes": t["up_spikes"],
                "down_spikes": t["down_spikes"]
            })

        # Query all unique symbols matching the active date/timeframe filters (without symbol filter)
        _, opp_windowed_where_no_sym, _ = _build_dashboard_where(
            target_date=chosen_target_date,
            symbol=None,
            timeframe=timeframe,
            today_et=today_et,
            max_time=max_opp_time,
            col_name="event_start",
        )
        _, windowed_where_no_sym, _ = _build_dashboard_where(
            target_date=chosen_target_date,
            symbol=None,
            timeframe=timeframe,
            today_et=today_et,
            max_time=max_alert_time,
            col_name="event_time",
        )

        symbols_query = f"""
        SELECT distinct symbol FROM (
            SELECT symbol FROM {db_name}.v_trade_opportunities WHERE {opp_windowed_where_no_sym}
            UNION ALL
            SELECT symbol FROM {db_name}.price_spike_alerts WHERE {windowed_where_no_sym}
        )
        ORDER BY symbol ASC
        """
        symbols_res = ch_query(symbols_query, parameters=where_params)
        dashboard_symbols = [r["symbol"] for r in symbols_res if r.get("symbol")]
 
        return {
            "summary": {
                "active_signals": summary.get("active_signals", 0),
                "buy_signals": summary.get("buy_signals", 0),
                "strong_buy_signals": summary.get("strong_buy_signals", 0),
                "sell_signals": summary.get("sell_signals", 0),
                "strong_sell_signals": summary.get("strong_sell_signals", 0),
                "hold_signals": summary.get("hold_signals", 0),
                "spikes_count": summary.get("spikes_count", 0),
                "market_breadth": {
                    "adv": breadth.get("adv", 0),
                    "dec": breadth.get("dec", 0),
                    "unch": breadth.get("unch", 0)
                },
                "target_date": chosen_target_date.isoformat(),
                "is_today": is_today,
            },
            "opportunities": opportunities,
            "opportunities_total": int(opportunities_total),
            "backup_opportunities": backup_opportunities,
            "backup_opportunities_total": int(backup_opportunities_total),
            "trends": formatted_trends,
            "symbols": dashboard_symbols
        }
    except HTTPException:
        # Re-raise validation errors (e.g. malformed target_date) so the client
        # sees a 400 rather than a silent empty board.
        raise
    except Exception as e:
        logger.error(f"Error compiling dashboard-analytics: {e}", exc_info=True)
        return {
            "summary": {
                "active_signals": 0, "buy_signals": 0, "sell_signals": 0, "hold_signals": 0, "spikes_count": 0,
                "market_breadth": {"adv": 0, "dec": 0, "unch": 0},
                "target_date": _today_et().isoformat(),
                "is_today": True,
            },
            "opportunities": [],
            "opportunities_total": 0,
            "backup_opportunities": [],
            "backup_opportunities_total": 0,
            "trends": [],
            "symbols": []
        }



@router.get("/summary")
async def get_dashboard_summary(user: dict = Depends(get_current_user)):
    db = settings.CLICKHOUSE_DB
    live_instruments = []
    try:
        rows = ch_query(
            f"""
            SELECT
                instrument_token,
                argMax(symbol, ts) AS symbol,
                argMax(exchange, ts) AS exchange,
                argMax(ltp, ts) AS ltp,
                argMax(close, ts) AS close,
                argMax(change, ts) AS change,
                max(ts) AS max_ts
            FROM {db}.raw_ticks
            WHERE raw_ticks.ts >= now() - INTERVAL 1 DAY
            GROUP BY instrument_token
            ORDER BY symbol
            LIMIT 50
            """
        )
        for r in rows:
            ltp = float(r.get("ltp") or 0)
            close = float(r.get("close") or 0)
            change = float(r.get("change") or 0)
            if change == 0 and close > 0:
                change = ((ltp - close) / close) * 100
            ts_val = r.get("max_ts")
            live_instruments.append({
                "instrument_token": int(r.get("instrument_token") or 0),
                "symbol": r.get("symbol") or "",
                "exchange": r.get("exchange") or "",
                "ltp": ltp,
                "close": close,
                "change": change,
                "ts": ts_val.isoformat() if hasattr(ts_val, "isoformat") else str(ts_val or ""),
            })
    except Exception as e:
        logger.warning(f"summary raw_ticks fallback failed: {e}")

    return {
        "live_instruments": live_instruments,
        "ticker_running": True,
        "authenticated": True,
    }
