"""Generate deploy_analytics_views.sql from India schema."""
from pathlib import Path

src = Path(r"c:\Users\tufai\OneDrive\Desktop\trade-analytics\backend\app\db\schema.sql").read_text(encoding="utf-8")
# Extract from price_spike_alerts table onward (analytics layer)
start = src.find("CREATE TABLE IF NOT EXISTS trade_analytics.price_spike_alerts")
if start == -1:
    start = src.find("CREATE OR REPLACE VIEW")
chunk = src[start:]
chunk = chunk.replace("trade_analytics.", "trade_analytics_us.")
chunk = chunk.replace("Asia/Kolkata", "America/New_York")
chunk = chunk.replace("920 AND 1520", "930 AND 1600")

header = """-- Analytics read-layer views for trade_analytics_us (run once; does not modify ingestion tables)
-- Usage: clickhouse-client --multiquery < scripts/deploy_analytics_views.sql

USE trade_analytics_us;

"""

out = header + chunk
dst = Path(__file__).resolve().parent / "deploy_analytics_views.sql"
dst.write_text(out, encoding="utf-8")
print(f"Wrote {dst} ({len(out.splitlines())} lines)")
