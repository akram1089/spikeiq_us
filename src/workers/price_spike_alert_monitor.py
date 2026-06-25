"""Detect new rows in v_price_spikes and push to alert WebSocket (no Telegram)."""

from __future__ import annotations

from collections import deque
from typing import Any, Deque, Dict, List, Tuple

from loguru import logger

from config import settings
from src.db.clickhouse_client import ch_manager
from src.market.price_spike_source import (
    normalize_price_spike_row,
    price_spike_monitor_poll_sql,
    price_spike_monitor_snapshot_sql,
)
from src.workers.pre_spike_alert_service import dispatch_price_spike_record

RecordKey = Tuple[str, str, str]


class PriceSpikeAlertMonitor:
    """Tracks seen v_price_spikes rows and dispatches only new ones."""

    def __init__(self):
        self._bootstrapped = False
        self._seen_keys: set[RecordKey] = set()
        self._seen_order: Deque[RecordKey] = deque()
        self._max_seen_keys = 2000

    def _lookback_seconds(self) -> int:
        return max(60, int(settings.PRE_SPIKE_ALERT_LOOKBACK_SECONDS))

    def _fetch_rows(self, sql: str) -> List[Dict[str, Any]]:
        client = ch_manager.create_worker_client()
        result = client.query(sql)
        cols = result.column_names
        return [dict(zip(cols, row)) for row in result.result_rows]

    @staticmethod
    def _time_key(event_start: Any) -> str:
        if hasattr(event_start, "isoformat"):
            event_start = event_start.isoformat(sep=" ", timespec="seconds")
        text = str(event_start or "")
        if len(text) >= 19:
            return text[:19]
        return text

    def _record_key(self, row: Dict[str, Any]) -> RecordKey:
        return (
            self._time_key(row.get("event_start")),
            str(row.get("symbol") or ""),
            str(row.get("action") or ""),
        )

    def _remember(self, key: RecordKey) -> None:
        if key in self._seen_keys:
            return
        self._seen_keys.add(key)
        self._seen_order.append(key)
        while len(self._seen_order) > self._max_seen_keys:
            self._seen_keys.discard(self._seen_order.popleft())

    def _remember_row(self, row: Dict[str, Any]) -> None:
        self._remember(self._record_key(row))

    def _fetch_poll_rows(self, *, limit: int | None = None) -> List[Dict[str, Any]]:
        db = settings.CLICKHOUSE_DB
        row_limit = limit if limit is not None else self._max_seen_keys
        sql = price_spike_monitor_poll_sql(
            db, lookback_sec=self._lookback_seconds(), row_limit=row_limit
        )
        return self._fetch_rows(sql)

    def _fetch_snapshot_rows(self, *, limit: int) -> List[Dict[str, Any]]:
        db = settings.CLICKHOUSE_DB
        sql = price_spike_monitor_snapshot_sql(
            db, lookback_sec=self._lookback_seconds(), row_limit=limit
        )
        return self._fetch_rows(sql)

    def _collapse_rows(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        latest: Dict[RecordKey, Dict[str, Any]] = {}
        for row in rows:
            latest[self._record_key(row)] = row
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
                f"PriceSpikeAlertMonitor bootstrapped with {len(rows)} unique event(s) from "
                f"v_price_spikes (ET lookback={self._lookback_seconds()}s)."
            )
        except Exception as e:
            logger.warning(f"PriceSpikeAlertMonitor bootstrap failed (will retry): {e}")

    def fetch_bootstrap_snapshot(self, limit: int = 100) -> List[Dict[str, Any]]:
        self.bootstrap()
        rows = self._collapse_rows(self._fetch_snapshot_rows(limit=limit))
        for row in rows:
            self._remember_row(row)
        return [normalize_price_spike_row(row) for row in rows]

    def poll_new_records(self) -> int:
        if not self._bootstrapped:
            self.bootstrap()
            return 0

        dispatched = 0
        for row in self._collapse_rows(self._fetch_poll_rows()):
            key = self._record_key(row)
            if key in self._seen_keys:
                continue
            dispatch_price_spike_record(normalize_price_spike_row(row))
            self._remember(key)
            dispatched += 1
        return dispatched
