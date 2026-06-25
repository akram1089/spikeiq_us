export const PRE_SPIKE_ALERT_EVENT = 'spikeiq:pre-spike-alert'
export const PRE_SPIKE_ALERT_SNAPSHOT_EVENT = 'spikeiq:pre-spike-alert-snapshot'
export const ALERT_WS_STATUS_EVENT = 'spikeiq:alert-ws-status'
export const PRE_SPIKE_PRICE_EVENT = 'spikeiq:pre-spike-price'
export const PRE_SPIKE_PRICE_SNAPSHOT_EVENT = 'spikeiq:pre-spike-price-snapshot'
export const ALERT_WATCH_SYMBOLS_EVENT = 'spikeiq:alert-watch-symbols'

export function emitPreSpikeAlert(data) {
  window.dispatchEvent(new CustomEvent(PRE_SPIKE_ALERT_EVENT, { detail: data }))
}

export function emitPreSpikeAlertSnapshot(rows) {
  window.dispatchEvent(new CustomEvent(PRE_SPIKE_ALERT_SNAPSHOT_EVENT, { detail: rows }))
}

export function emitAlertWsStatus(connected) {
  window.dispatchEvent(new CustomEvent(ALERT_WS_STATUS_EVENT, { detail: { connected } }))
}

export function emitSymbolPrice(data) {
  window.dispatchEvent(new CustomEvent(PRE_SPIKE_PRICE_EVENT, { detail: data }))
}

export function emitSymbolPriceSnapshot(rows) {
  window.dispatchEvent(new CustomEvent(PRE_SPIKE_PRICE_SNAPSHOT_EVENT, { detail: rows }))
}

export function emitAlertWatchSymbols(symbols) {
  window.dispatchEvent(new CustomEvent(ALERT_WATCH_SYMBOLS_EVENT, { detail: symbols }))
}
