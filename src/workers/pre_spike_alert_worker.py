"""Backward-compatible alias — polling thread removed; use pre_spike_alert_watcher instead."""

from src.workers.pre_spike_alert_monitor import PreSpikeAlertMonitor

PreSpikeAlertWorker = PreSpikeAlertMonitor
