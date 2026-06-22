"""Poll v_pre_spike_alerts_ui for new watchlist rows and dispatch alerts."""

import threading
import time
from typing import Any, Dict, List

from loguru import logger

from config import settings
from src.db.clickhouse_client import ch_manager
from src.workers.pre_spike_alert_service import dispatch_pre_spike_alert, serialize_pre_spike_alert


class PreSpikeAlertWorker(threading.Thread):
    """Background worker that watches ClickHouse for new pre-spike watchlist entries."""

    def __init__(self):
        super().__init__(daemon=True, name="PreSpikeAlertWorker")
        self.running = False
        self._last_version = 0
        self._bootstrapped = False

    def _poll_interval(self) -> float:
        return max(3.0, float(settings.PRE_SPIKE_ALERT_POLL_SECONDS))

    def _fetch_rows(self, sql: str, parameters: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        client = ch_manager.create_worker_client()
        result = client.query(sql, parameters=parameters or {})
        cols = result.column_names
        return [dict(zip(cols, row)) for row in result.result_rows]

    def _bootstrap_cursor(self) -> None:
        db = settings.CLICKHOUSE_DB
        try:
            rows = self._fetch_rows(
                f"SELECT max(version) AS m FROM {db}.v_pre_spike_alerts_ui"
            )
            max_version = int(rows[0]["m"] or 0) if rows else 0
            self._last_version = max_version
            self._bootstrapped = True
            logger.info(
                f"PreSpikeAlertWorker bootstrapped at version={self._last_version} "
                "(only newer rows will alert)"
            )
        except Exception as e:
            logger.warning(f"PreSpikeAlertWorker bootstrap failed (will retry): {e}")

    def _poll_new_alerts(self) -> None:
        if not self._bootstrapped:
            self._bootstrap_cursor()
            return

        db = settings.CLICKHOUSE_DB
        rows = self._fetch_rows(
            f"""
            SELECT
                alert_time,
                symbol,
                price,
                signal_type,
                setup,
                alert_status,
                version
            FROM {db}.v_pre_spike_alerts_ui
            WHERE version > {{last_version:UInt64}}
            ORDER BY version ASC
            LIMIT 50
            """,
            parameters={"last_version": self._last_version},
        )

        for row in rows:
            version = int(row.get("version") or 0)
            if version <= self._last_version:
                continue
            alert = serialize_pre_spike_alert(row)
            dispatch_pre_spike_alert(alert)
            self._last_version = version

    def run(self) -> None:
        logger.info("Starting PreSpikeAlertWorker thread...")
        self.running = True
        while self.running:
            try:
                self._poll_new_alerts()
            except Exception as e:
                logger.error(f"PreSpikeAlertWorker poll error: {e}")
            time.sleep(self._poll_interval())

    def stop(self) -> None:
        self.running = False
        logger.info("PreSpikeAlertWorker stopped.")
