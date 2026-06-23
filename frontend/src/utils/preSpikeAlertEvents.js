export const PRE_SPIKE_ALERT_EVENT = 'spikeiq:pre-spike-alert'
export const PRE_SPIKE_ALERT_SNAPSHOT_EVENT = 'spikeiq:pre-spike-alert-snapshot'
export const ALERT_WS_STATUS_EVENT = 'spikeiq:alert-ws-status'

export function emitPreSpikeAlert(data) {
  window.dispatchEvent(new CustomEvent(PRE_SPIKE_ALERT_EVENT, { detail: data }))
}

export function emitPreSpikeAlertSnapshot(rows) {
  window.dispatchEvent(new CustomEvent(PRE_SPIKE_ALERT_SNAPSHOT_EVENT, { detail: rows }))
}

export function emitAlertWsStatus(connected) {
  window.dispatchEvent(new CustomEvent(ALERT_WS_STATUS_EVENT, { detail: { connected } }))
}
