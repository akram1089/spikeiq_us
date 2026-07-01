"""Strip India-only endpoints from ported analytics router."""
from pathlib import Path

path = Path(__file__).resolve().parent.parent / "src" / "market" / "analytics_router.py"
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

# Keep lines 1-189 (through _build_dashboard_where)
head = lines[:189]

# Find pre-spike endpoint
start_pre = next(i for i, l in enumerate(lines) if '@router.get("/pre-spike"' in l)

# Find end of dashboard-analytics (before duplicate summary)
end_dash = next(i for i, l in enumerate(lines) if i > start_pre and l.startswith("@router.get(\"/summary\")"))

tail = lines[start_pre:end_dash]

# Simplified summary
summary = '''

class PreSpikeDashboardResponse(BaseModel):
    kpis: Dict[str, Any]
    watchlist: List[Dict[str, Any]]
    watchlist_total: int
    alerts: List[Dict[str, Any]]
    alerts_total: int
    symbols: List[str]


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

# Fix pre-spike response model - remove PreSpikeKPIs if present in tail text
tail_text = "".join(tail)
tail_text = tail_text.replace("response_model=PreSpikeDashboardResponse", "")

# Remove duplicate check_and_create in tail - keep first one at top
out = "".join(head) + tail_text + summary
path.write_text(out, encoding="utf-8")
print("Cleaned", path, "lines", len(out.splitlines()))
