-- Analytics read-layer views for trade_analytics_us (run once; does not modify ingestion tables)
-- Usage: clickhouse-client --multiquery < scripts/deploy_analytics_views.sql

USE trade_analytics_us;

CREATE TABLE IF NOT EXISTS trade_analytics_us.price_spike_alerts (
    version         UInt64  DEFAULT toUnixTimestamp64Milli(now64(3)),
    event_time      DateTime64(3),
    instrument_token UInt32,
    symbol          LowCardinality(String),
    open            Decimal64(4)  DEFAULT 0,
    high            Decimal64(4)  DEFAULT 0,
    low             Decimal64(4)  DEFAULT 0,
    close           Decimal64(4)  DEFAULT 0,
    prev_close      Decimal64(4)  DEFAULT 0,
    price_diff      Decimal64(4)  DEFAULT 0,
    pct_change      Decimal64(6)  DEFAULT 0,
    ticks           UInt32        DEFAULT 0,
    rsi             Decimal64(4)  DEFAULT 0,
    rsi_slope       Decimal64(4)  DEFAULT 0,
    prev_rsi        Decimal64(4)  DEFAULT 0,
    rsi_signal      LowCardinality(String) DEFAULT 'HOLD',
    processed_at    DateTime64(3) DEFAULT now64(3),
    final_signal    LowCardinality(String) DEFAULT 'HOLD',
    confidence_score Int8 DEFAULT 0
) ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMMDD(event_time)
ORDER BY (symbol, instrument_token, event_time)
SETTINGS index_granularity = 8192;

-- ─────────────────────────────────────────────
-- UI View: price spike alerts for the pre-spike dashboard and WebSocket watcher
-- Aliases price_spike_alerts columns to the names expected by the backend
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW trade_analytics_us.v_price_spike_alerts_ui AS
SELECT
    event_time                                      AS event_start,
    symbol,
    instrument_token,
    close                                           AS price,
    final_signal                                    AS direction,
    CAST(rsi, 'Float64')                            AS signal_strength,
    CAST(confidence_score, 'Int32')                 AS conviction,
    CAST(pct_change, 'Float64')                     AS price_move,
    version
FROM trade_analytics_us.price_spike_alerts;

-- ─────────────────────────────────────────────
-- UI View: trade opportunities for the main dashboard analytics
-- Columns: event_start, symbol, entry_price, action, quality, opportunity
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW trade_analytics_us.v_trade_opportunities AS
SELECT
    event_time                                                                          AS event_start,
    symbol,
    instrument_token,
    open                                                                                AS entry_price,
    final_signal                                                                        AS action,
    multiIf(confidence_score >= 8, 'A+', confidence_score >= 6, 'A', confidence_score >= 4, 'B', 'C') AS quality,
    multiIf(confidence_score >= 8, '🔥 HIGH', confidence_score >= 6, '⭐ STRONG', confidence_score >= 4, '👀 BUILDING', '⚪ WATCH') AS opportunity,
    CAST(pct_change, 'Float64')                                                         AS price_move
FROM trade_analytics_us.price_spike_alerts;

-- ─────────────────────────────────────────────
-- UI View: price spikes for the pre-spike right panel
-- Columns: event_start, symbol, price, action, quality, setup
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW trade_analytics_us.v_price_spikes AS
SELECT
    event_time                                                                          AS event_start,
    symbol,
    instrument_token,
    close                                                                               AS price,
    final_signal                                                                        AS action,
    multiIf(confidence_score >= 8, 'A+', confidence_score >= 6, 'A', confidence_score >= 4, 'B', 'C') AS quality,
    multiIf(confidence_score >= 8, '🔥 HIGH', confidence_score >= 6, '⭐ STRONG', confidence_score >= 4, '👀 BUILDING', '⚪ WATCH') AS setup,
    CAST(pct_change, 'Float64')                                                         AS price_move
FROM trade_analytics_us.price_spike_alerts;

-- Pre-spike watchlist UI view (simplified US mapping from spike alerts)
CREATE OR REPLACE VIEW trade_analytics_us.v_pre_spike_alerts_ui AS
SELECT
    event_time AS alert_time,
    symbol,
    close AS price,
    multiIf(startsWith(symbol, '/'), 'FUTURES LEAD', symbol IN ('SPX', 'NDX', 'DJI', 'INDU', 'VIX'), 'INDEX WATCH', 'STOCK WATCH') AS signal_type,
    multiIf(confidence_score >= 8, 'Volume Surge', confidence_score >= 6, 'VWAP Breakout', 'Momentum Bounce') AS setup,
    multiIf(confidence_score >= 8, 'HOT', confidence_score >= 6, 'WATCH', 'EARLY') AS alert_status,
    version
FROM trade_analytics_us.price_spike_alerts;
