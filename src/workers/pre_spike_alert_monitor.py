"""Detect new pre-spike rows in ClickHouse and dispatch via WebSocket (no background poll thread)."""

from __future__ import annotations

from collections import deque
from typing import Any, Deque, Dict, List, Tuple

from loguru import logger

from config import settings
from src.db.clickhouse_client import ch_manager
from src.workers.pre_spike_alert_service import dispatch_pre_spike_alert, serialize_pre_spike_alert

# Dedup key — no version column on production v_pre_spike_alerts_ui view chain.
AlertKey = Tuple[str, str, str, str, str, str]

# Watch the same source as the Pre-Spike dashboard (not price_spike_alerts).
_PRE_SPIKE_UI_SQL = """
SELECT
    alert_time,
    symbol,
    price,
    signal_type,
    setup,
    alert_status
FROM {db}.v_pre_spike_alerts_ui
WHERE alert_time >= now() - INTERVAL {lookback_sec} SECOND
ORDER BY alert_time ASC, symbol ASC
LIMIT {row_limit}
"""


class PreSpikeAlertMonitor:
    """Tracks seen alert rows and dispatches only new ones to the alert WebSocket channel."""

    def __init__(self):
        self._bootstrapped = False
        self._seen_keys: set[AlertKey] = set()
        self._seen_order: Deque[AlertKey] = deque()
        self._max_seen_keys = 2000

    def _lookback_seconds(self) -> int:
        return max(60, int(settings.PRE_SPIKE_ALERT_LOOKBACK_SECONDS))

    def _fetch_rows(self, sql: str, parameters: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        client = ch_manager.create_worker_client()
        result = client.query(sql, parameters=parameters or {})
        cols = result.column_names
        return [dict(zip(cols, row)) for row in result.result_rows]

    def _alert_key(self, row: Dict[str, Any]) -> AlertKey:
        alert_time = row.get("alert_time")
        if hasattr(alert_time, "isoformat"):
            alert_time = alert_time.isoformat()

        price = row.get("price")
        if hasattr(price, "as_tuple"):
            price = str(price)

        return (
            str(alert_time or ""),
            str(row.get("symbol") or ""),
            str(price or ""),
            str(row.get("signal_type") or ""),
            str(row.get("setup") or ""),
            str(row.get("alert_status") or ""),
        )

    def _remember(self, key: AlertKey) -> None:
        if key in self._seen_keys:
            return
        self._seen_keys.add(key)
        self._seen_order.append(key)
        while len(self._seen_order) > self._max_seen_keys:
            self._seen_keys.discard(self._seen_order.popleft())

    def _fetch_recent_alerts(self, *, limit: int | None = None) -> List[Dict[str, Any]]:
        db = settings.CLICKHOUSE_DB
        row_limit = limit if limit is not None else self._max_seen_keys
        return self._fetch_rows(
            _PRE_SPIKE_UI_SQL.format(
                db=db,
                lookback_sec=self._lookback_seconds(),
                row_limit=row_limit,
            ),
        )

    def bootstrap(self) -> None:
        if self._bootstrapped:
            return
        try:
            rows = self._fetch_recent_alerts()
            for row in rows:
                self._remember(self._alert_key(row))
            self._bootstrapped = True
            logger.info(
                f"PreSpikeAlertMonitor bootstrapped with {len(rows)} recent row(s) from "
                f"v_pre_spike_alerts_ui (lookback={self._lookback_seconds()}s). "
                "Only newer unseen rows will alert."
            )
        except Exception as e:
            logger.warning(f"PreSpikeAlertMonitor bootstrap failed (will retry): {e}")

    def fetch_bootstrap_snapshot(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Recent watchlist rows for a newly connected WebSocket client (no dispatch)."""
        self.bootstrap()
        rows = self._fetch_recent_alerts(limit=limit)
        return [serialize_pre_spike_alert(row) for row in reversed(rows)]

    def poll_new_alerts(self) -> int:
        """Check ClickHouse once for new rows; returns count dispatched."""
        if not self._bootstrapped:
            self.bootstrap()
            return 0

        dispatched = 0
        rows = self._fetch_recent_alerts()
        for row in rows:
            key = self._alert_key(row)
            if key in self._seen_keys:
                continue

            alert = serialize_pre_spike_alert(row)
            dispatch_pre_spike_alert(alert)
            self._remember(key)
            dispatched += 1
        return dispatched
