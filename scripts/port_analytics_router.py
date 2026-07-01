"""One-off script to port analytics endpoints from India market router."""
import re
from pathlib import Path

src = Path(r"c:\Users\tufai\OneDrive\Desktop\trade-analytics\backend\app\market\router.py").read_text(encoding="utf-8")
start = src.find("def _ist_to_utc")
end = src.find('@router.post("/ticker/start")')
chunk = src[start:end]

replacements = [
    ("Asia/Kolkata", "America/New_York"),
    ("_ist_to_utc", "_et_to_utc"),
    ("_utc_to_ist_str", "_utc_to_et_str"),
    ("_today_ist", "_today_et"),
    ("today_ist", "today_et"),
    ("BETWEEN 920 AND 1520", "BETWEEN 930 AND 1600"),
    (
        "(upper(symbol) LIKE '%NIFTY%' OR upper(symbol) LIKE '%BANKNIFTY%' OR "
        "upper(symbol) LIKE '%SENSEX%' OR upper(symbol) LIKE '%BSESN%' OR "
        "upper(symbol) LIKE '%MIDCP%' OR upper(symbol) LIKE '%FINNIFTY%' OR "
        "upper(symbol) LIKE '%VIX%')",
        "(upper(symbol) IN ('SPX', 'NDX', 'DJI', 'VIX') OR upper(symbol) LIKE '/%')",
    ),
    ("upper(symbol) LIKE '%FUT%'", "upper(symbol) LIKE '/%'"),
    ("upper(symbol) NOT LIKE '%FUT%'", "upper(symbol) NOT LIKE '/%'"),
]
for a, b in replacements:
    chunk = chunk.replace(a, b)

chunk = chunk.replace("ch.query(", "ch_query(")

header = '''"""Read-only ClickHouse analytics endpoints for dashboard and pre-spike UI."""

from __future__ import annotations

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


class PreSpikeDashboardResponse(BaseModel):
    kpis: Dict[str, Any]
    watchlist: List[Dict[str, Any]]
    watchlist_total: int
    alerts: List[Dict[str, Any]]
    alerts_total: int
    symbols: List[str]


_pre_spike_views_checked = False


async def check_and_create_pre_spike_views():
    global _pre_spike_views_checked
    if _pre_spike_views_checked:
        return
    logger.info("Pre-spike view check skipped (deploy analytics views via SQL script).")
    _pre_spike_views_checked = True


'''

out = header + chunk
out = re.sub(r"class PreSpikeDashboardResponse.*?(?=\n_pre_spike_views_checked)", "", out, flags=re.S)

summary_ep = '''

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
                max(ts) AS ts
            FROM {db}.raw_ticks
            WHERE ts >= now() - INTERVAL 1 DAY
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
            ts_val = r.get("ts")
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
'''

out = out + summary_ep
dst = Path(__file__).resolve().parent.parent / "src" / "market" / "analytics_router.py"
dst.write_text(out, encoding="utf-8")
print(f"Wrote {dst} ({len(out.splitlines())} lines)")
