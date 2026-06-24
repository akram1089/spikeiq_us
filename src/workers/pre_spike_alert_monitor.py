"""Detect new pre-spike rows in v_pre_spike_alerts_ui and dispatch via WebSocket."""

from __future__ import annotations

from collections import deque
from typing import Any, Deque, Dict, List, Tuple

from loguru import logger

from config import settings
from src.db.clickhouse_client import ch_manager
from src.market.pre_spike_source import (
    normalize_pre_spike_row,
    pre_spike_monitor_poll_sql,
    pre_spike_monitor_snapshot_sql,
)
from src.workers.pre_spike_alert_service import dispatch_pre_spike_alert

# Dedup by symbol + second + setup (ignore micro price ticks on the same event).
AlertKey = Tuple[str, str, str, str]


class PreSpikeAlertMonitor:
    """Tracks seen v_pre_spike_alerts_ui rows and dispatches only new ones."""

    def __init__(self):
        self._bootstrapped = False
        self._seen_keys: set[AlertKey] = set()
        self._seen_order: Deque[AlertKey] = deque()
        self._max_seen_keys = 2000

    def _lookback_seconds(self) -> int:
        return max(60, int(settings.PRE_SPIKE_ALERT_LOOKBACK_SECONDS))

    def _fetch_rows(self, sql: str) -> List[Dict[str, Any]]:
        client = ch_manager.create_worker_client()
        result = client.query(sql)
        cols = result.column_names
        return [dict(zip(cols, row)) for row in result.result_rows]

    @staticmethod
    def _alert_time_key(alert_time: Any) -> str:
        if hasattr(alert_time, "isoformat"):
            alert_time = alert_time.isoformat(sep=" ", timespec="seconds")
        text = str(alert_time or "")
        if len(text) >= 19:
            return text[:19]
        return text

    def _alert_key(self, row: Dict[str, Any]) -> AlertKey:
        return (
            self._alert_time_key(row.get("alert_time")),
            str(row.get("symbol") or ""),
            str(row.get("signal_type") or ""),
            str(row.get("setup") or ""),
        )

    def _remember(self, key: AlertKey) -> None:
        if key in self._seen_keys:
            return
        self._seen_keys.add(key)
        self._seen_order.append(key)
        while len(self._seen_order) > self._max_seen_keys:
            self._seen_keys.discard(self._seen_order.popleft())

    def _remember_row(self, row: Dict[str, Any]) -> None:
        self._remember(self._alert_key(row))

    def _fetch_poll_rows(self, *, limit: int | None = None) -> List[Dict[str, Any]]:
        db = settings.CLICKHOUSE_DB
        row_limit = limit if limit is not None else self._max_seen_keys
        sql = pre_spike_monitor_poll_sql(
            db, lookback_sec=self._lookback_seconds(), row_limit=row_limit
        )
        return self._fetch_rows(sql)

    def _fetch_snapshot_rows(self, *, limit: int) -> List[Dict[str, Any]]:
        db = settings.CLICKHOUSE_DB
        sql = pre_spike_monitor_snapshot_sql(
            db, lookback_sec=self._lookback_seconds(), row_limit=limit
        )
        return self._fetch_rows(sql)

    def _collapse_rows(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Keep the latest price per symbol/setup/second — avoids NDX tick spam."""
        latest: Dict[AlertKey, Dict[str, Any]] = {}
        for row in rows:
            latest[self._alert_key(row)] = row
        return list(latest.values())

    def bootstrap(self) -> None:
        if self._bootstrapped:
            return
        try:
            rows = self._collapse_rows(self._fetch_poll_rows())
            for row in rows:
                self._remember_row(row)
            self._bootstrapped = True
            logger.info(
                f"PreSpikeAlertMonitor bootstrapped with {len(rows)} unique event(s) from "
                f"v_pre_spike_alerts_ui (ET lookback={self._lookback_seconds()}s). "
                "Only newer unseen rows will alert."
            )
        except Exception as e:
            logger.warning(f"PreSpikeAlertMonitor bootstrap failed (will retry): {e}")

    def fetch_bootstrap_snapshot(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Recent watchlist rows for a newly connected WebSocket (alert_time DESC)."""
        self.bootstrap()
        rows = self._collapse_rows(self._fetch_snapshot_rows(limit=limit))
        for row in rows:
            self._remember_row(row)
        return [normalize_pre_spike_row(row) for row in rows]

    def poll_new_alerts(self) -> int:
        """Check v_pre_spike_alerts_ui once; returns count dispatched."""
        if not self._bootstrapped:
            self.bootstrap()
            return 0

        dispatched = 0
        for row in self._collapse_rows(self._fetch_poll_rows()):
            key = self._alert_key(row)
            if key in self._seen_keys:
                continue

            dispatch_pre_spike_alert(normalize_pre_spike_row(row))
            self._remember(key)
            dispatched += 1
        return dispatched
