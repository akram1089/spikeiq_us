-- DO NOT run on production VPS if v_pre_spike_alerts_ui already exists with the full
-- analytics pipeline (VOLATILITY EXPANSION / INDEX LEADING setups).
--
-- Production uses the native view chain:
--   v_pre_spike_alerts_ui → v_pre_spike_alerts → v_pre_spike_candidates → ...
--
-- Backend alerts + dashboard read v_pre_spike_alerts_ui directly.
-- Only use this script on a fresh install that has price_spike_alerts but no pre-spike view.

USE trade_analytics_us;

CREATE OR REPLACE VIEW trade_analytics_us.v_pre_spike_alerts_ui AS
SELECT
    event_time AS alert_time,
    symbol,
    close AS price,
    multiIf(startsWith(symbol, '/'), 'FUTURES LEAD', symbol IN ('SPX', 'NDX', 'DJI', 'INDU', 'VIX'), 'INDEX WATCH', 'STOCK WATCH') AS signal_type,
    multiIf(confidence_score >= 8, 'Volume Surge', confidence_score >= 6, 'VWAP Breakout', 'Momentum Bounce') AS setup,
    multiIf(confidence_score >= 8, 'HOT', confidence_score >= 6, 'WATCH', 'EARLY') AS alert_status
FROM trade_analytics_us.price_spike_alerts;
