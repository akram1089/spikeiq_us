/**
 * Feature Flags — trade-analytics frontend
 *
 * ENABLE_PRE_SPIKE_ALERTS
 * -----------------------
 * Disabled because the ClickHouse analytics pipeline (v_pre_spike_alerts_ui view chain:
 *   v_pre_spike_alerts_ui → v_pre_spike_alerts → v_pre_spike_candidates
 *   → v_pre_spike_events → v_pre_spike_watch_dashboard_v3)
 * currently returns 0 rows and causes significant unnecessary CPU load:
 *   - 681 executions recorded
 *   - ~2 seconds average execution time
 *   - up to 8.9 seconds max execution time
 *   - zero rows returned
 * Re-enable this flag when the ClickHouse view chain is producing data again.
 */
export const ENABLE_PRE_SPIKE_ALERTS = true

/**
 * NAVBAR_STATUS_POLL_INTERVAL
 * ---------------------------
 * Interval (ms) for the Navbar ticker-status poll which calls GET /market/ticker/status.
 * That endpoint runs COUNT(raw_ticks) and COUNT(alerts) against ClickHouse.
 * Increased from 5 000 ms → 30 000 ms to reduce COUNT scan frequency.
 * The backend cache TTL (_STATUS_CACHE_TTL) has been increased to match.
 */
export const NAVBAR_STATUS_POLL_INTERVAL = 30_000 // 30 seconds
