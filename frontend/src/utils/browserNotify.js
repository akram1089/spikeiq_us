/**
 * browserNotify.js
 * Shared utility for browser (Web Notification API) push alerts.
 * Works in any component or hook — no service worker required.
 */

const STORAGE_KEY = 'pushEnabled'
const TAG_PREFIX  = 'trade-alert'

/** Is the Web Notification API available in this browser? */
export function isPushSupported() {
  return 'Notification' in window
}

/** Current raw permission state: 'default' | 'granted' | 'denied' | 'unsupported' */
export function getPushPermission() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/** Has the user both granted permission AND opted in via Settings? */
export function isPushActive() {
  return getPushPermission() === 'granted' && localStorage.getItem(STORAGE_KEY) === '1'
}

/** Request browser permission. Returns true if granted. */
export async function requestPushPermission() {
  if (!isPushSupported()) return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

/**
 * Fire a browser notification.
 * @param {string}  title
 * @param {string}  body
 * @param {object}  opts  - optional overrides (icon, tag, requireInteraction, etc.)
 * @returns {boolean} true if sent, false if blocked / unsupported
 */
export function sendBrowserNotification(title, body, opts = {}) {
  if (!isPushActive()) return false
  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: TAG_PREFIX,
      requireInteraction: false,
      ...opts,
    })
    return true
  } catch (e) {
    return false
  }
}

const SOUND_KEY = 'alertSoundEnabled'

/** Check if alert sound is enabled (defaults to true if not set) */
export function isAlertSoundEnabled() {
  return localStorage.getItem(SOUND_KEY) !== '0'
}

/** Enable / disable alert sound */
export function setAlertSoundEnabled(enabled) {
  localStorage.setItem(SOUND_KEY, enabled ? '1' : '0')
}

/** Play a nice premium two-tone chime using Web Audio API */
export function playAlertSound() {
  if (!isAlertSoundEnabled()) return
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    const audioCtx = new AudioContextClass()

    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }

    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()

      osc.connect(gain)
      gain.connect(audioCtx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)

      gain.gain.setValueAtTime(0.12, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    const now = audioCtx.currentTime
    // Premium major third chime (A5 to C#6)
    playTone(880, now, 0.15)
    playTone(1108.73, now + 0.1, 0.3)
  } catch (e) {
    console.warn('Web Audio playback failed or blocked:', e)
  }
}

/**
 * Convert an alert object from the WebSocket/API into a browser notification.
 * Accepts USER_ALERT, HF_ALERT, and system alerts.
 */
export function notifyFromAlert(alert) {
  if (!alert) return

  // Play sound if enabled
  if (isAlertSoundEnabled()) {
    playAlertSound()
  }

  if (!isPushActive()) return

  let title = 'Trade Alert'
  let body = 'Alert triggered'
  let tag = `${TAG_PREFIX}-general`
  let requireInteraction = false

  if (alert.type === 'USER_ALERT' || alert.condition_type) {
    // ── User-defined alert ──
    const cond = alert.condition_type || ''
    const isAbove = cond.includes('above') || cond.includes('up')
    const emoji = isAbove ? '📈' : '📉'
    const nameStr = alert.name ? ` "${alert.name}"` : ''
    
    title = `${emoji} Alert: ${alert.symbol || ''}${nameStr}`
    body = `${cond.replace(/_/g, ' ').toUpperCase()} triggered. Target: ${alert.threshold}, Actual: ${alert.actual_value}`
    tag = `${TAG_PREFIX}-user-${alert.alert_id || alert.id || 'unknown'}`
    requireInteraction = true
  } else if (alert.type === 'HF_ALERT') {
    // ── HF rule alert ──
    const type = alert.alert_type || ''
    const isDown = type.includes('crash') || type.includes('down')
    const emoji = isDown ? '📉' : '📈'
    const nameStr = alert.name ? ` "${alert.name}"` : ''
    
    title = `${emoji} HF Alert: ${alert.symbol || ''}${nameStr}`
    
    if (type === 'volume_spike') {
      body = `Volume Spike! Ratio: ${Number(alert.volume_ratio).toFixed(2)}x, Volume: ${alert.current_volume} (Avg: ${alert.avg_volume})`
    } else {
      const pct = alert.change_pct != null ? ` (${alert.change_pct > 0 ? '+' : ''}${Number(alert.change_pct).toFixed(2)}%)` : ''
      body = `${type.replace(/_/g, ' ').toUpperCase()}: ${alert.price_from} → ${alert.price_to}${pct}`
    }
    
    tag = `${TAG_PREFIX}-hf-${alert.rule_id || 'unknown'}`
    requireInteraction = true
  } else if (alert.alert_type === 'FLASH_CRASH' || alert.alert_type === 'FLASH_RALLY') {
    // ── System alert ──
    const isCrash = alert.alert_type === 'FLASH_CRASH'
    const emoji = isCrash ? '📉' : '📈'
    const pct = alert.change_pct != null ? ` (${alert.change_pct > 0 ? '+' : ''}${Number(alert.change_pct).toFixed(2)}%)` : ''
    
    title = `${emoji} System Alert: ${alert.symbol || ''}`
    body = `${alert.alert_type.replace(/_/g, ' ')}: ${alert.price_from} → ${alert.price_to}${pct} in ${alert.window_seconds}s`
    tag = `${TAG_PREFIX}-sys-${alert.symbol || 'general'}`
    requireInteraction = true
  } else {
    // Fallback
    title = alert.title || `🚨 Alert: ${alert.symbol || ''}`
    body = alert.body || alert.message || alert.condition || 'Trigger fired'
    tag = `${TAG_PREFIX}-${alert.symbol || 'gen'}`
  }

  return sendBrowserNotification(title, body, { tag, requireInteraction })
}

/** Enable / disable push (persisted to localStorage). */
export function setPushEnabled(enabled) {
  localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
}

/** Build display strings for a pre-spike watchlist alert row. */
export function getPreSpikeAlertDisplay(alert) {
  if (!alert) {
    return { title: 'Pre-Spike Alert', body: '', emoji: '🔔', status: '' }
  }
  const status = String(alert.alert_status || '').toUpperCase()
  const emoji = { HOT: '🔥', WATCH: '👀', EARLY: '⏰', ACTIVE: '⚡' }[status] || '🔔'
  const price = alert.price != null ? `$${Number(alert.price).toFixed(2)}` : '—'
  const title = `${emoji} Pre-Spike: ${alert.symbol || ''}`
  const body = `${alert.signal_type || 'WATCH'} · ${alert.setup || ''} · ${price} · ${status}`
  return { title, body, emoji, status }
}

/** Play sound + browser push for a pre-spike watchlist alert. */
export function notifyPreSpikeAlert(alert) {
  if (!alert) return false
  playAlertSound()
  const { title, body } = getPreSpikeAlertDisplay(alert)
  return sendBrowserNotification(title, body, {
    tag: `trade-alert-pre-spike-${alert.symbol || 'sym'}-${alert.version || alert.alert_time || 't'}`,
    requireInteraction: true,
  })
}
