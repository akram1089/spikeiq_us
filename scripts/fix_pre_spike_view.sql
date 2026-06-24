-- Fix v_pre_spike_alerts_ui to include version (run once on VPS ClickHouse).
-- Usage:
--   docker exec -i spikeiq_clickhouse clickhouse-client --user clickhouse_user --password clickhouse_pass \
--     --multiquery < scripts/fix_pre_spike_view.sql

USE trade_analytics_us;

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
