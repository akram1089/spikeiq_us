import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, RefreshCw, Clock, ArrowRight, Flame, Zap, Glasses, Circle, BellRing } from 'lucide-react'
import { getPreSpikeDashboard, getDashboardAnalytics, testPreSpikeAlert, getPreSpikeAlertConfig } from '../api/endpoints'
import { formatNumber, formatPct } from '../utils/formatters'
import toast from 'react-hot-toast'
import { requestPushPermission, isPushActive, setPushEnabled } from '../utils/browserNotify'
import { showPreSpikeAlertToast } from '../utils/preSpikeAlertUi'
// Feature flag: disabled because ClickHouse analytics pipeline (v_pre_spike_alerts_ui view chain)
// currently returns 0 rows and causes unnecessary CPU load (~681 queries, avg 2s, max 8.9s).
// Re-enable in config/featureFlags.js when the view chain is producing data.
import { ENABLE_PRE_SPIKE_ALERTS } from '../config/featureFlags'
import { PRE_SPIKE_ALERT_EVENT, PRE_SPIKE_ALERT_SNAPSHOT_EVENT, ALERT_WS_STATUS_EVENT, PRE_SPIKE_PRICE_EVENT, PRE_SPIKE_PRICE_SNAPSHOT_EVENT, emitAlertWatchSymbols } from '../utils/preSpikeAlertEvents'

// Helper — calendar day in US/Eastern (matches v_pre_spike_alerts_ui alert_time)
function getEtDateKey(ts) {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts))
  } catch {
    return ''
  }
}
function formatSpikeTime(ts) {
  if (!ts) return '---'
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ts
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    return formatter.format(d)
  } catch (e) {
    return ts
  }
}

// Calculate the age elapsed since the second (event time)
function calculateAge(secondStr) {
  if (!secondStr) return '---'
  try {
    const diff = Date.now() - new Date(secondStr).getTime()
    if (diff < 0) return '0s'
    const totalSecs = Math.floor(diff / 1000)
    const mins = Math.floor(totalSecs / 60)
    const secs = totalSecs % 60
    if (mins === 0) return `${secs}s`
    return `${mins}m ${String(secs).padStart(2, '0')}s`
  } catch (e) {
    return '---'
  }
}

// Helper to classify symbol as Futures, Index, or Stock
function getSymbolType(symbol) {
  if (!symbol) return 'STOCK'
  const sym = symbol.toUpperCase().trim()
  if (sym.startsWith('/')) return 'FUTURES'
  if (['SPX', 'NDX', 'DJI', 'INDU', 'VIX', 'RUT'].includes(sym)) return 'INDEX'
  return 'STOCK'
}

// Helper to render alert status with custom icons and inline styling
function renderStatus(status) {
  const stat = String(status || 'INACTIVE').toUpperCase().trim()
  switch (stat) {
    case 'HOT':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#ff4d4d', fontWeight: '800', fontSize: '0.72rem' }}>
          <Flame size={12} fill="#ff4d4d" style={{ display: 'inline-block' }} />
          {stat}
        </span>
      )
    case 'WATCH':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#3b82f6', fontWeight: '800', fontSize: '0.72rem' }}>
          <Zap size={12} fill="#3b82f6" style={{ display: 'inline-block' }} />
          {stat}
        </span>
      )
    case 'EARLY':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: '800', fontSize: '0.72rem' }}>
          <Glasses size={12} style={{ display: 'inline-block' }} />
          {stat}
        </span>
      )
    case 'ACTIVE':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: '800', fontSize: '0.72rem' }}>
          <Zap size={12} fill="#10b981" style={{ display: 'inline-block' }} />
          {stat}
        </span>
      )
    case 'INACTIVE':
    default:
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontWeight: '800', fontSize: '0.72rem' }}>
          <Circle size={12} style={{ display: 'inline-block', opacity: 0.5 }} />
          {stat}
        </span>
      )
  }
}

// Helper to render direction dot next to signal
function renderDirectionIcon(direction) {
  const dir = String(direction || 'HOLD').toUpperCase().trim()
  let color = '#6b7280' // default Gray
  if (dir.includes('BUY')) {
    color = '#10b981' // Green
  } else if (dir.includes('SELL')) {
    color = '#ef4444' // Red
  }
  return (
    <span 
      style={{ 
        width: '8px', 
        height: '8px', 
        borderRadius: '50%', 
        backgroundColor: color, 
        display: 'inline-block',
        flexShrink: 0
      }} 
    />
  )
}

// Helper to format strength percentile safely
function formatStrength(val) {
  if (val === undefined || val === null || String(val).trim() === '') return '---'
  const strVal = String(val).trim()
  if (strVal.endsWith('%')) {
    const num = parseFloat(strVal.replace(/%/g, ''))
    if (!isNaN(num)) {
      return `${num}%`
    }
    return strVal
  }
  const num = parseFloat(strVal)
  if (!isNaN(num)) {
    return `${num}%`
  }
  return strVal
}

export default function PreSpikeDashboard() {
  const navigate = useNavigate()

  // State for filters
  const [timeframe, setTimeframe] = useState('DAY')
  const [selectedSymbol, setSelectedSymbol] = useState('ALL')
  const [selectedType, setSelectedType] = useState('ALL')

  // Tab filters
  const [spikeAlertsTab, setSpikeAlertsTab] = useState('ALL')
  const [testingAlert, setTestingAlert] = useState(false)
  const [telegramConfigured, setTelegramConfigured] = useState(false)
  const [pushEnabled, setPushEnabledState] = useState(() => isPushActive())

  // Data State
  const [preSpikeData, setPreSpikeData] = useState({
    kpis: { futures_leads: 0, index_watches: 0, stock_watches: 0, active_spikes: 0 },
    watchlist: []
  })

  const [spikeAlerts, setSpikeAlerts] = useState([])
  
  // Decoupled loading states for each table
  const [watchlistLoading, setWatchlistLoading] = useState(true)
  const [alertsLoading, setAlertsLoading] = useState(true)
  const loading = watchlistLoading || alertsLoading
  
  const [lastRefresh, setLastRefresh] = useState(null)
  const [alertWsLive, setAlertWsLive] = useState(false)

  // State to force age column updates every second
  const [, setAgeTick] = useState(0)

  // Recalculate Ages every second
  useEffect(() => {
    const interval = setInterval(() => {
      setAgeTick(t => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Pagination State
  const [watchlistPage, setWatchlistPage] = useState(1)
  const [watchlistPageSize, setWatchlistPageSize] = useState(10)
  const [alertsPage, setAlertsPage] = useState(1)
  const [alertsPageSize, setAlertsPageSize] = useState(10)

  // Reset page numbers on filters change
  useEffect(() => {
    setWatchlistPage(1)
  }, [timeframe, selectedSymbol, selectedType])

  useEffect(() => {
    setAlertsPage(1)
  }, [spikeAlertsTab, selectedSymbol, selectedType])

  // Reset selectedSymbol if its type doesn't match the new selectedType
  useEffect(() => {
    if (selectedSymbol !== 'ALL' && selectedType !== 'ALL') {
      if (getSymbolType(selectedSymbol) !== selectedType) {
        setSelectedSymbol('ALL')
      }
    }
  }, [selectedType, selectedSymbol])

  // Handlers to set specific loading states
  const handleTimeframeChange = (val) => {
    setWatchlistLoading(true)
    setAlertsLoading(true)
    setTimeframe(val)
  }

  const handleSelectedSymbolChange = (val) => {
    setWatchlistLoading(true)
    setAlertsLoading(true)
    setSelectedSymbol(val)
  }

  const handleSelectedTypeChange = (val) => {
    setWatchlistLoading(true)
    setAlertsLoading(true)
    setSelectedType(val)
  }

  const handleWatchlistPageChange = (newPage) => {
    setWatchlistLoading(true)
    setWatchlistPage(newPage)
  }

  const handleWatchlistPageSizeChange = (newSize) => {
    setWatchlistLoading(true)
    setWatchlistPageSize(newSize)
    setWatchlistPage(1)
  }

  const handleAlertsPageChange = (newPage) => {
    setAlertsLoading(true)
    setAlertsPage(newPage)
  }

  const handleAlertsPageSizeChange = (newSize) => {
    setAlertsLoading(true)
    setAlertsPageSize(newSize)
    setAlertsPage(1)
  }

  const handleSpikeAlertsTabChange = (newTab) => {
    setAlertsLoading(true)
    setSpikeAlertsTab(newTab)
  }

  // Fetch Pre-Spike list, KPIs and daily alerts
  // Disabled: ClickHouse v_pre_spike_alerts_ui view chain returns 0 rows and causes
  // unnecessary CPU load. No API calls are made when ENABLE_PRE_SPIKE_ALERTS is false.
  const loadPreSpikeData = useCallback(async () => {
    if (!ENABLE_PRE_SPIKE_ALERTS) {
      // Feature flag is OFF — return empty data without calling the API.
      // This prevents any queries reaching v_pre_spike_alerts_ui.
      setWatchlistLoading(false)
      setAlertsLoading(false)
      return
    }
    try {
      const res = await getPreSpikeDashboard({
        timeframe,
        symbol: selectedSymbol === 'ALL' ? null : selectedSymbol,
        symbolType: selectedType,
        wlPage: watchlistPage,
        wlPageSize: watchlistPageSize,
        alertsPage,
        alertsPageSize,
        alertsAction: spikeAlertsTab
      })
      const data = res.data || {
        kpis: { futures_leads: 0, index_watches: 0, stock_watches: 0, active_spikes: 0 },
        watchlist: [],
        watchlist_total: 0,
        alerts: [],
        alerts_total: 0,
        symbols: []
      }
      setPreSpikeData(data)
      setSpikeAlerts(data.alerts || [])
    } catch (e) {
      console.error('Failed to load pre-spike dashboard data:', e)
    } finally {
      setWatchlistLoading(false)
      setAlertsLoading(false)
    }
  }, [
    timeframe,
    selectedSymbol,
    selectedType,
    watchlistPage,
    watchlistPageSize,
    alertsPage,
    alertsPageSize,
    spikeAlertsTab
  ])

  // Initial load for KPIs, spike panel, and symbol list (filter/pagination changes only — no polling).
  useEffect(() => {
    if (!ENABLE_PRE_SPIKE_ALERTS) {
      setWatchlistLoading(false)
      setAlertsLoading(false)
      return
    }
    loadPreSpikeData()
    setLastRefresh(new Date())
  }, [loadPreSpikeData])

  const alertMatchesFilters = useCallback((row) => {
    if (!row?.symbol) return false
    if (selectedSymbol !== 'ALL' && row.symbol !== selectedSymbol) return false
    const symType = getSymbolType(row.symbol)
    if (selectedType !== 'ALL' && symType !== selectedType) return false
    if (timeframe === 'ALL') return true
    if (timeframe === 'DAY') {
      return getEtDateKey(row.alert_time) === getEtDateKey(Date.now())
    }
    const alertMs = new Date(row.alert_time).getTime()
    if (Number.isNaN(alertMs)) return true
    const ageMs = Date.now() - alertMs
    const windows = {
      '15M': 15 * 60 * 1000,
      '30M': 30 * 60 * 1000,
      '45M': 45 * 60 * 1000,
      '60M': 60 * 60 * 1000,
    }
    if (windows[timeframe]) return ageMs <= windows[timeframe]
    return true
  }, [selectedSymbol, selectedType, timeframe])

  const bumpKpisForAlert = useCallback((kpis, row) => {
    const st = String(row.signal_type || '').toUpperCase()
    const next = { ...kpis }
    if (st.includes('FUTURES') || st.includes('LEAD')) {
      next.futures_leads = (next.futures_leads || 0) + 1
    } else if (st.includes('INDEX')) {
      next.index_watches = (next.index_watches || 0) + 1
    } else if (st.includes('STOCK')) {
      next.stock_watches = (next.stock_watches || 0) + 1
    }
    return next
  }, [])

  const applyLivePrices = useCallback((priceRows) => {
    if (!Array.isArray(priceRows) || priceRows.length === 0) return
    const bySymbol = {}
    for (const row of priceRows) {
      const sym = String(row?.symbol || '').toUpperCase()
      const price = Number(row?.price)
      if (sym && Number.isFinite(price) && price > 0) {
        bySymbol[sym] = price
      }
    }
    if (!Object.keys(bySymbol).length) return

    setPreSpikeData((prev) => ({
      ...prev,
      watchlist: (prev.watchlist || []).map((item) => {
        const sym = String(item.symbol || '').toUpperCase()
        return bySymbol[sym] != null ? { ...item, price: bySymbol[sym] } : item
      }),
    }))
    setSpikeAlerts((prev) =>
      (prev || []).map((item) => {
        const sym = String(item.symbol || '').toUpperCase()
        return bySymbol[sym] != null ? { ...item, price: bySymbol[sym] } : item
      })
    )
  }, [])

  useEffect(() => {
    const symbols = [
      ...(preSpikeData.watchlist || []).map((r) => r.symbol),
      ...(spikeAlerts || []).map((r) => r.symbol),
    ]
    if (symbols.length) {
      emitAlertWatchSymbols(symbols)
    }
  }, [preSpikeData.watchlist, spikeAlerts])

  useEffect(() => {
    const onLiveAlert = (event) => {
      const row = event.detail
      if (!row || !alertMatchesFilters(row)) return
      setPreSpikeData((prev) => ({
        ...prev,
        kpis: bumpKpisForAlert(prev.kpis || {}, row),
        watchlist: [row, ...(prev.watchlist || [])].slice(0, watchlistPageSize),
        watchlist_total: (prev.watchlist_total || 0) + 1,
      }))
      setLastRefresh(new Date())
    }
    const onSnapshot = (event) => {
      const rows = Array.isArray(event.detail) ? event.detail : []
      const filtered = rows.filter(alertMatchesFilters)
      setPreSpikeData((prev) => ({
        ...prev,
        watchlist: filtered.slice(0, watchlistPageSize),
        watchlist_total: filtered.length,
        kpis: filtered.reduce((kpis, row) => bumpKpisForAlert(kpis, row), {
          futures_leads: 0,
          index_watches: 0,
          stock_watches: 0,
          active_spikes: prev.kpis?.active_spikes || 0,
        }),
      }))
      setWatchlistLoading(false)
      setLastRefresh(new Date())
    }
    const onWsStatus = (event) => {
      setAlertWsLive(Boolean(event.detail?.connected))
    }
    const onLivePrice = (event) => {
      const row = event.detail
      if (row?.symbol) applyLivePrices([row])
    }
    const onPriceSnapshot = (event) => {
      applyLivePrices(event.detail)
    }
    window.addEventListener(PRE_SPIKE_ALERT_EVENT, onLiveAlert)
    window.addEventListener(PRE_SPIKE_ALERT_SNAPSHOT_EVENT, onSnapshot)
    window.addEventListener(ALERT_WS_STATUS_EVENT, onWsStatus)
    window.addEventListener(PRE_SPIKE_PRICE_EVENT, onLivePrice)
    window.addEventListener(PRE_SPIKE_PRICE_SNAPSHOT_EVENT, onPriceSnapshot)
    return () => {
      window.removeEventListener(PRE_SPIKE_ALERT_EVENT, onLiveAlert)
      window.removeEventListener(PRE_SPIKE_ALERT_SNAPSHOT_EVENT, onSnapshot)
      window.removeEventListener(ALERT_WS_STATUS_EVENT, onWsStatus)
      window.removeEventListener(PRE_SPIKE_PRICE_EVENT, onLivePrice)
      window.removeEventListener(PRE_SPIKE_PRICE_SNAPSHOT_EVENT, onPriceSnapshot)
    }
  }, [alertMatchesFilters, bumpKpisForAlert, watchlistPageSize, applyLivePrices])

  useEffect(() => {
    getPreSpikeAlertConfig()
      .then((res) => setTelegramConfigured(Boolean(res.data?.telegram_configured)))
      .catch(() => setTelegramConfigured(false))
  }, [])

  const handleTestAlert = async () => {
    setTestingAlert(true)
    try {
      const res = await testPreSpikeAlert()
      const data = res.data || {}
      // Always show toast + beep locally (WS may be offline or already echoed the alert).
      if (data.alert) {
        showPreSpikeAlertToast(data.alert)
      }
      const tg = data.telegram_sent
        ? 'Telegram sent'
        : data.telegram_queued
          ? 'Telegram queued'
          : data.telegram_configured
            ? 'Telegram failed'
            : 'Telegram not configured'
      const ws = data.ws_clients != null ? `${data.ws_clients} browser client(s)` : 'WebSocket dispatched'
      toast.success(`Test alert fired · ${ws} · ${tg}`)
    } catch (e) {
      console.error('Test pre-spike alert failed:', e)
      toast.error(e.response?.data?.detail || 'Failed to send test alert')
    } finally {
      setTestingAlert(false)
    }
  }

  const handleTogglePush = async () => {
    if (pushEnabled) {
      setPushEnabled(false)
      setPushEnabledState(false)
      toast('Browser push disabled', { icon: '🔕' })
      return
    }
    const granted = await requestPushPermission()
    if (granted) {
      setPushEnabled(true)
      setPushEnabledState(true)
      toast.success('Browser push enabled')
    } else {
      toast.error('Browser notification permission denied')
    }
  }


  // Get unique symbols for dropdown select (returned by backend)
  const uniqueSymbols = preSpikeData.symbols || []

  // Paginated Watchlist and Spike Alerts from API
  const paginatedWatchlist = preSpikeData.watchlist || []
  const paginatedSpikeAlerts = spikeAlerts || []

  const totalWatchlistPages = Math.ceil((preSpikeData.watchlist_total || 0) / watchlistPageSize) || 1
  const safeWatchlistPage = Math.min(watchlistPage, totalWatchlistPages)

  const totalAlertsPages = Math.ceil((preSpikeData.alerts_total || 0) / alertsPageSize) || 1
  const safeAlertsPage = Math.min(alertsPage, totalAlertsPages)

  // 4. Get KPIs directly from backend response
  const futuresLeadsCount = preSpikeData.kpis?.futures_leads || 0
  const indexWatchesCount = preSpikeData.kpis?.index_watches || 0
  const stockWatchesCount = preSpikeData.kpis?.stock_watches || 0
  const activeSpikesCount = preSpikeData.kpis?.active_spikes || 0

  // Badge styles
  const getWatchLevelBadgeStyle = (level) => {
    const lvl = String(level).toUpperCase().trim()
    switch (lvl) {
      case 'FUTURES LEAD':
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(34, 232, 122, 0.1)',
          color: '#10b981',
          border: '1px solid rgba(34, 232, 122, 0.3)'
        }
      case 'INDEX WATCH':
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(59, 130, 246, 0.1)',
          color: '#3b82f6',
          border: '1px solid rgba(59, 130, 246, 0.3)'
        }
      case 'STOCK WATCH':
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(245, 158, 11, 0.1)',
          color: '#f59e0b',
          border: '1px solid rgba(245, 158, 11, 0.3)'
        }
      default:
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(255, 255, 255, 0.05)',
          color: 'var(--text-secondary)'
        }
    }
  }

  const getSignalBadgeStyle = (signal) => {
    const sig = String(signal).toUpperCase().trim()
    switch (sig) {
      case 'STRONG BUY':
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(34, 232, 122, 0.2)',
          color: '#10b981',
          border: '1px solid rgba(34, 232, 122, 0.4)',
          boxShadow: '0 0 4px rgba(34, 232, 122, 0.1)'
        }
      case 'BUY':
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(34, 232, 122, 0.1)',
          color: '#10b981'
        }
      case 'STRONG SELL':
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(245, 101, 81, 0.2)',
          color: '#ef4444',
          border: '1px solid rgba(245, 101, 81, 0.4)',
          boxShadow: '0 0 4px rgba(245, 101, 81, 0.1)'
        }
      case 'SELL':
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(245, 101, 81, 0.1)',
          color: '#ef4444'
        }
      case 'HOLD':
      default:
        return {
          fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
          background: 'rgba(255, 255, 255, 0.05)',
          color: 'var(--text-secondary)'
        }
    }
  }

  const getSpikeStrengthBadgeStyle = (score) => {
    if (score >= 7) {
      return { color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }
    } else if (score >= 4) {
      return { color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }
    } else {
      return { color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }
    }
  }

  const getSpikeStrengthText = (score) => {
    if (score >= 7) return 'HIGH'
    if (score >= 4) return 'MEDIUM'
    return 'LOW'
  }

  const handleRefreshClick = () => {
    setWatchlistLoading(true)
    setAlertsLoading(true)
    loadPreSpikeData()
    setLastRefresh(new Date())
    toast.success('Dashboard data refreshed')
  }

  // ── Feature flag guard: render disabled banner instead of live dashboard ──
  if (!ENABLE_PRE_SPIKE_ALERTS) {
    return (
      <div className="page-container dashboard-page">
        <div className="dashboard-header" style={{ marginBottom: '20px' }}>
          <h1 className="page-title" style={{ margin: 0, fontSize: '1.25rem' }}>PRE-SPIKE WATCHLIST DASHBOARD</h1>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '340px',
          gap: '18px',
          textAlign: 'center',
          padding: '40px 20px'
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#f59e0b',
            fontWeight: 800,
            fontSize: '0.9rem',
            letterSpacing: '0.04em',
            padding: '8px 18px',
            borderRadius: '8px'
          }}>
            ⚠️ Pre-Spike Alerts Temporarily Disabled
          </span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '560px', lineHeight: 1.7, margin: 0 }}>
            This feature has been temporarily paused to reduce ClickHouse CPU load.<br />
            The analytics pipeline (<code style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>v_pre_spike_alerts_ui</code>) is currently
            returning <strong>0 rows</strong> while generating <strong>~681 queries at 2–8.9s each</strong>.<br />
            No API requests are being made. All polling is suspended.<br />
            To re-enable, set <code style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>ENABLE_PRE_SPIKE_ALERTS = true</code> in{' '}
            <code style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>src/config/featureFlags.js</code>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container dashboard-page">
      {/* Upper Control Bar */}
      <div className="dashboard-header" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: '1.25rem', whiteSpace: 'nowrap' }}>PRE-SPIKE WATCHLIST DASHBOARD</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <span
            title={alertWsLive ? 'Real-time alert stream connected' : 'Waiting for alert WebSocket'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              padding: '4px 10px',
              borderRadius: '999px',
              border: `1px solid ${alertWsLive ? 'rgba(16, 185, 129, 0.45)' : 'rgba(148, 163, 184, 0.35)'}`,
              color: alertWsLive ? '#10b981' : 'var(--text-secondary)',
              background: alertWsLive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(148, 163, 184, 0.08)',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: alertWsLive ? '#10b981' : '#94a3b8',
                boxShadow: alertWsLive ? '0 0 8px rgba(16, 185, 129, 0.8)' : 'none',
              }}
            />
            {alertWsLive ? 'LIVE ALERTS' : 'ALERTS OFFLINE'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Symbol:</span>
            <select
              value={selectedSymbol}
              onChange={(e) => handleSelectedSymbolChange(e.target.value)}
              style={{
                padding: '4px 24px 4px 8px',
                fontSize: '0.78rem',
                borderRadius: '6px',
                height: '28px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.03)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="ALL">All Symbols</option>
              {uniqueSymbols.map(sym => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Type:</span>
            <div className="timeframe-selector" style={{ padding: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              {[
                { val: 'ALL', label: 'ALL' },
                { val: 'FUTURES', label: 'FUTURES' },
                { val: 'INDEX', label: 'INDEX' },
                { val: 'STOCK', label: 'STOCK' }
              ].map(({ val, label }) => (
                <button
                  key={val}
                  className={`timeframe-btn ${selectedType === val ? 'active' : ''}`}
                  onClick={() => handleSelectedTypeChange(val)}
                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                  data-all={val === 'ALL' ? 'true' : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="timeframe-selector" style={{ padding: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            {[
              { val: '15M', label: '15m' },
              { val: '30M', label: '30m' },
              { val: '45M', label: '45m' },
              { val: '60M', label: '60m' },
              { val: 'DAY', label: 'Day' },
              { val: 'ALL', label: 'All' }
            ].map(({ val, label }) => (
              <button
                key={val}
                className={`timeframe-btn ${timeframe === val ? 'active' : ''}`}
                onClick={() => handleTimeframeChange(val)}
                style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                data-all={val === 'ALL' ? 'true' : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={handleTogglePush}
            className="btn btn-ghost"
            title={pushEnabled ? 'Browser push on' : 'Enable browser push'}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: pushEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              fontSize: '0.72rem',
              color: pushEnabled ? 'var(--green)' : 'var(--text-secondary)',
            }}
          >
            {pushEnabled ? '🔔 Push On' : '🔕 Push Off'}
          </button>

          <button
            onClick={handleTestAlert}
            className="btn btn-ghost"
            disabled={testingAlert}
            title={telegramConfigured ? 'Test browser + Telegram alert' : 'Test browser alert (add Telegram env for mobile)'}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              background: 'rgba(239, 68, 68, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#f87171',
            }}
          >
            <BellRing size={13} className={testingAlert ? 'spin-animation' : ''} />
            {testingAlert ? 'Testing…' : 'Test Alert'}
          </button>

          <button
            onClick={handleRefreshClick}
            className="btn btn-ghost"
            disabled={loading}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '28px',
              width: '28px'
            }}
          >
            <RefreshCw size={13} className={loading ? 'spin-animation' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid - Hidden as requested */}
      {/*
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
        <div className="stat-card-premium" style={{ borderLeft: '4px solid #10b981', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(0, 0, 0, 0.2) 100%)' }}>
          <div className="stat-label">FUTURES LEADS</div>
          <div className="stat-value" style={{ color: '#10b981' }}>
            {futuresLeadsCount}
          </div>
          <div className="stat-desc">Active potential breakout futures</div>
        </div>

        <div className="stat-card-premium" style={{ borderLeft: '4px solid #3b82f6', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(0, 0, 0, 0.2) 100%)' }}>
          <div className="stat-label">INDEX WATCHES</div>
          <div className="stat-value" style={{ color: '#3b82f6' }}>
            {indexWatchesCount}
          </div>
          <div className="stat-desc">Key index level shifts</div>
        </div>

        <div className="stat-card-premium" style={{ borderLeft: '4px solid #f59e0b', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(0, 0, 0, 0.2) 100%)' }}>
          <div className="stat-label">STOCK WATCHES</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>
            {stockWatchesCount}
          </div>
          <div className="stat-desc">Impending breakouts detected</div>
        </div>

        <div className="stat-card-premium" style={{ borderLeft: '4px solid #a78bfa', background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.05) 0%, rgba(0, 0, 0, 0.2) 100%)' }}>
          <div className="stat-label">⚡ ACTIVE SPIKES</div>
          <div className="stat-value" style={{ color: '#a78bfa' }}>
            {activeSpikesCount}
          </div>
          <div className="stat-desc">Spikes with &gt;10% moves today</div>
        </div>
      </div>
      */}

      {/* Side-by-Side Tables Grid */}
      <div className="tables-layout-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Table 1: Pre-Spike Watch List (LEFT) */}
        <div className="card" style={{ padding: '20px', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 className="card-title" style={{ fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
              PRE-SPIKE WATCH LIST
            </h2>
          </div>

            <div className="table-wrapper" style={{ flex: 1, overflow: 'auto', maxHeight: '480px' }}>
            <table className="data-table" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Time</th>
                  <th>Symbol</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th>Signal Type</th>
                  <th>Setup</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {watchlistLoading ? (
                  Array.from({ length: watchlistPageSize }).map((_, i) => (
                    <tr key={`sk-wl-${i}`} className="skeleton-row">
                      <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 45 }} /></td>
                      <td><span className="skeleton-cell" style={{ width: 85 }} /></td>
                      <td style={{ textAlign: 'right' }}><span className="skeleton-cell" style={{ width: 70 }} /></td>
                      <td><span className="skeleton-cell" style={{ width: 90 }} /></td>
                      <td><span className="skeleton-cell" style={{ width: 120 }} /></td>
                      <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 60 }} /></td>
                    </tr>
                  ))
                ) : paginatedWatchlist.length > 0 ? (
                  paginatedWatchlist.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 'bold' }}>
                        {formatSpikeTime(item.alert_time)}
                      </td>
                      <td style={{ fontWeight: '800' }}>{item.symbol}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {item.price !== undefined && item.price !== null && item.price !== 0
                          ? `$${formatNumber(item.price, 2)}`
                          : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>---</span>}
                      </td>
                      <td>
                        <span style={getWatchLevelBadgeStyle(item.signal_type)}>
                          {item.signal_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{item.setup}</td>
                      <td style={{ textAlign: 'center' }}>
                        {renderStatus(item.alert_status)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      No pre-spike alerts detected for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {(preSpikeData.watchlist_total || 0) > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 4px 4px 4px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              marginTop: 8,
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>Rows:</span>
                <select
                  value={watchlistPageSize}
                  onChange={(e) => handleWatchlistPageSizeChange(Number(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    fontSize: '0.78rem'
                  }}
                >
                  {[5, 10, 15, 25, 50].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span className="text-muted" style={{ fontSize: '0.72rem', marginLeft: 4 }}>
                  {preSpikeData.watchlist_total || 0} rows
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleWatchlistPageChange(watchlistPage - 1)}
                  disabled={safeWatchlistPage === 1}
                  style={{ padding: '4px 8px' }}
                >
                  Previous
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {safeWatchlistPage} / {totalWatchlistPages}
                </span>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleWatchlistPageChange(watchlistPage + 1)}
                  disabled={safeWatchlistPage === totalWatchlistPages}
                  style={{ padding: '4px 8px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table 2: Price Spike Alerts - Today (RIGHT) */}
        <div className="card" style={{ padding: '20px', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 className="card-title" style={{ fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
              PRICE SPIKE ALERTS
            </h2>
            {/* Filter tabs */}
            <div className="table-tabs" style={{ display: 'flex', gap: '4px' }}>
              {[
                { id: 'ALL', label: 'ALL' },
                { id: 'BUY', label: 'BUY', className: 'buy-tab' },
                { id: 'STRONG BUY', label: 'STRONG BUY', className: 'strong-buy-tab' },
                { id: 'SELL', label: 'SELL', className: 'sell-tab' },
                { id: 'STRONG SELL', label: 'STRONG SELL', className: 'strong-sell-tab' },
                { id: 'HOLD', label: 'HOLD', className: 'hold-tab' }
              ].map(tab => (
                <button
                  key={tab.id}
                  className={`table-tab-btn ${tab.className || ''} ${spikeAlertsTab === tab.id ? 'active' : ''}`}
                  onClick={() => handleSpikeAlertsTabChange(tab.id)}
                  style={{ padding: '3px 8px', fontSize: '0.68rem' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="table-wrapper" style={{ flex: 1, overflow: 'auto', maxHeight: '480px' }}>
            <table className="data-table" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Time</th>
                  <th>Symbol</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th>Action</th>
                  <th style={{ textAlign: 'center' }}>Quality</th>
                  <th>Setup</th>
                </tr>
              </thead>
              <tbody>
                {alertsLoading ? (
                  // Skeleton rows while data is being fetched
                  Array.from({ length: alertsPageSize }).map((_, i) => (
                    <tr key={`sk-sa-${i}`} className="skeleton-row">
                      <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 52 }} /></td>
                      <td><span className="skeleton-cell" style={{ width: 85 }} /></td>
                      <td style={{ textAlign: 'right' }}><span className="skeleton-cell" style={{ width: 70 }} /></td>
                      <td><span className="skeleton-cell" style={{ width: 60 }} /></td>
                      <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 45 }} /></td>
                      <td><span className="skeleton-cell" style={{ width: 120 }} /></td>
                    </tr>
                  ))
                ) : paginatedSpikeAlerts.length > 0 ? (
                  paginatedSpikeAlerts.map((item, idx) => {
                    const action = String(item.action || 'HOLD').toUpperCase().trim()
                    const actionStyle = action === 'STRONG BUY' ? { color: '#10b981', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)' } :
                                       action === 'BUY'         ? { color: '#10b981', background: 'rgba(16,185,129,0.08)' } :
                                       action === 'STRONG SELL' ? { color: '#ef4444', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)' } :
                                       action === 'SELL'        ? { color: '#ef4444', background: 'rgba(239,68,68,0.08)' } :
                                                                  { color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)' }
                    const qualityStyle = item.quality === 'A+' ? { color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' } :
                                        item.quality === 'A'   ? { color: '#10b981', background: 'rgba(16,185,129,0.10)' } :
                                        item.quality === 'B'   ? { color: '#3b82f6', background: 'rgba(59,130,246,0.10)' } :
                                                                 { color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)' }
                    return (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 'bold' }}>
                          {item.event_start ? formatSpikeTime(item.event_start) : '---'}
                        </td>
                        <td style={{ fontWeight: '800' }}>{item.symbol}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {item.price !== undefined && item.price !== null && item.price !== 0
                            ? `$${formatNumber(item.price, 2)}`
                            : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>---</span>}
                        </td>
                        <td>
                          <span style={{ ...actionStyle, fontWeight: 800, fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px' }}>
                            {action}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ ...qualityStyle, fontWeight: 800, fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px' }}>
                            {item.quality || '---'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{item.setup || '---'}</td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      No spike alerts found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {(preSpikeData.alerts_total || 0) > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 4px 4px 4px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              marginTop: 8,
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="text-muted" style={{ fontSize: '0.78rem' }}>Rows:</span>
                <select
                  value={alertsPageSize}
                  onChange={(e) => handleAlertsPageSizeChange(Number(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    fontSize: '0.78rem'
                  }}
                >
                  {[5, 10, 15, 25, 50].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <span className="text-muted" style={{ fontSize: '0.72rem', marginLeft: 4 }}>
                  {preSpikeData.alerts_total || 0} rows
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleAlertsPageChange(alertsPage - 1)}
                  disabled={safeAlertsPage === 1}
                  style={{ padding: '4px 8px' }}
                >
                  Previous
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {safeAlertsPage} / {totalAlertsPages}
                </span>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => handleAlertsPageChange(alertsPage + 1)}
                  disabled={safeAlertsPage === totalAlertsPages}
                  style={{ padding: '4px 8px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
