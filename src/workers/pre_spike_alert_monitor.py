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

AlertKey = Tuple[str, str, str, str, str, str]


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

    def bootstrap(self) -> None:
        if self._bootstrapped:
            return
        try:
            rows = self._fetch_poll_rows()
            for row in rows:
                self._remember(self._alert_key(row))
            self._bootstrapped = True
            logger.info(
                f"PreSpikeAlertMonitor bootstrapped with {len(rows)} row(s) from "
                f"v_pre_spike_alerts_ui (ET lookback={self._lookback_seconds()}s). "
                "Only newer unseen rows will alert."
            )
        except Exception as e:
            logger.warning(f"PreSpikeAlertMonitor bootstrap failed (will retry): {e}")

    def fetch_bootstrap_snapshot(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Recent watchlist rows for a newly connected WebSocket (alert_time DESC)."""
        self.bootstrap()
        rows = self._fetch_snapshot_rows(limit=limit)
        return [normalize_pre_spike_row(row) for row in rows]

    def poll_new_alerts(self) -> int:
        """Check v_pre_spike_alerts_ui once; returns count dispatched."""
        if not self._bootstrapped:
            self.bootstrap()
            return 0

        dispatched = 0
        for row in self._fetch_poll_rows():
            key = self._alert_key(row)
            if key in self._seen_keys:
                continue

            dispatch_pre_spike_alert(normalize_pre_spike_row(row))
            self._remember(key)
            dispatched += 1
        return dispatched
