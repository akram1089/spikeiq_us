import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { getPreSpikeAlertDisplay, notifyPreSpikeAlert } from './browserNotify'

const STATUS_COLORS = {
  HOT: { accent: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
  WATCH: { accent: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  EARLY: { accent: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  ACTIVE: { accent: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
}

const TOAST_COOLDOWN_MS = 30_000
const lastToastAtByKey = new Map()

function toastDedupeKey(alert) {
  if (!alert?.symbol) return ''
  const t = alert.alert_time ? String(alert.alert_time).slice(0, 19) : ''
  return `${alert.symbol}|${t}|${alert.setup || ''}`
}

export function showPreSpikeAlertToast(alert) {
  if (!alert) return

  if (!alert.test) {
    const key = toastDedupeKey(alert)
    const lastAt = lastToastAtByKey.get(key) || 0
    const now = Date.now()
    if (key && now - lastAt < TOAST_COOLDOWN_MS) return
    if (key) lastToastAtByKey.set(key, now)
  }

  notifyPreSpikeAlert(alert)

  const { emoji, status } = getPreSpikeAlertDisplay(alert)
  const colors = STATUS_COLORS[status] || { accent: 'var(--accent-primary)', bg: 'rgba(99, 102, 241, 0.12)' }
  const price =
    alert.price != null && alert.price !== 0
      ? `$${Number(alert.price).toFixed(2)}`
      : '—'

  toast.custom(
    (t) => (
      <div
        className={`custom-toast ${t.visible ? 'animate-enter' : 'animate-leave'}`}
        style={{
          border: `1px solid ${colors.accent}`,
          boxShadow: `0 0 15px ${colors.bg}, var(--shadow-lg)`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{emoji}</span>
            {alert.symbol}
            {alert.test ? (
              <span style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 600 }}>(TEST)</span>
            ) : null}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '999px',
                background: colors.bg,
                color: colors.accent,
                border: `1px solid ${colors.accent}40`,
              }}
            >
              {status || alert.alert_status}
            </span>
            <button className="custom-toast-dismiss" onClick={() => toast.dismiss(t.id)} title="Dismiss alert">
              <X size={14} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 6 }}>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>{alert.signal_type}</strong>
            {' · '}
            {alert.setup}
          </div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            Price: <strong style={{ color: colors.accent }}>{price}</strong>
          </div>
        </div>
      </div>
    ),
    { duration: 8000 }
  )
}
