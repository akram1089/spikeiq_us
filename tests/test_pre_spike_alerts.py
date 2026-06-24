from types import SimpleNamespace

from src.workers import pre_spike_alert_service as service
from src.workers.pre_spike_alert_monitor import PreSpikeAlertMonitor


def _row(symbol, version=12345, alert_time="2026-06-23T13:14:53"):
    return {
        "alert_time": alert_time,
        "symbol": symbol,
        "price": 30166.25,
        "signal_type": "STOCK WATCH",
        "setup": "MOMENTUM BUILDING",
        "alert_status": "HOT",
        "version": version,
    }


def test_pre_spike_monitor_dispatches_all_rows_with_same_version(monkeypatch):
    dispatched = []
    monitor = PreSpikeAlertMonitor()
    monitor._bootstrapped = True

    rows = [_row("AAPL"), _row("MSFT")]
    monkeypatch.setattr(monitor, "_fetch_poll_rows", lambda **kwargs: rows)
    monkeypatch.setattr(
        "src.workers.pre_spike_alert_monitor.dispatch_pre_spike_alert",
        lambda alert: dispatched.append(alert),
    )

    monitor.poll_new_alerts()
    monitor.poll_new_alerts()

    assert len(dispatched) == 2
    assert {alert["symbol"] for alert in dispatched} == {"AAPL", "MSFT"}


def test_dispatch_broadcasts_before_telegram_queue(monkeypatch):
    calls = []

    class DummyExecutor:
        def submit(self, fn, *args):
            calls.append(("telegram", args[2]["symbol"]))
            return SimpleNamespace()

    monkeypatch.setattr(service, "broadcast_alert_websockets", lambda msg: (calls.append(("alert_ws", msg["type"])) or 1))
    monkeypatch.setattr(service.settings, "TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setattr(service.settings, "TELEGRAM_CHAT_ID", "chat")
    monkeypatch.setattr(service, "_telegram_executor", DummyExecutor())

    result = service.dispatch_pre_spike_alert(_row("AAPL"))

    assert calls == [("alert_ws", "pre_spike_alert"), ("telegram", "AAPL")]
    assert result["ws_clients"] == 1
    assert result["telegram_configured"] is True
    assert result["telegram_queued"] is True
    assert result["telegram_sent"] is None


def test_dispatch_uses_dedicated_alert_websocket(monkeypatch):
    calls = []

    monkeypatch.setattr(
        service,
        "broadcast_alert_websockets",
        lambda msg: (calls.append(("alert_ws", msg["type"])) or 2),
    )
    monkeypatch.setattr(service.settings, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(service.settings, "TELEGRAM_CHAT_ID", "")

    result = service.dispatch_pre_spike_alert(_row("NDX"))

    assert calls == [("alert_ws", "pre_spike_alert")]
    assert result["alert_ws_clients"] == 2
    assert result["legacy_ws_clients"] == 0
