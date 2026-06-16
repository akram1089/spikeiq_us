import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, TrendingUp, TrendingDown, BarChart3, Bell, Zap,
  Play, Square, RefreshCw, Clock, Search, Trash2, ShieldAlert,
  ChevronUp, ChevronDown, CheckCircle, AlertTriangle, Settings, Plus
} from 'lucide-react'
import {
  getSummary, getOHLCV, getDashboardAnalytics, getInstruments,
} from '../api/endpoints'
import { formatNumber, formatVolume, formatPct } from '../utils/formatters'
import CandlestickChart from '../components/CandlestickChart'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import toast from 'react-hot-toast'

/** Helper to format ISO datetime to "HH:MM:SS" (e.g. 15:29:59) */
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

/** Helper to get badge styling based on final_signal values */
function getSignalBadgeStyle(signal) {
  const sig = String(signal || 'HOLD').toUpperCase().trim()
  switch (sig) {
    case 'STRONG BUY':
    case '5':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(34, 232, 122, 0.2)',
        color: '#10b981',
        border: '1px solid rgba(34, 232, 122, 0.4)',
        boxShadow: '0 0 4px rgba(34, 232, 122, 0.1)'
      }
    case 'BUY':
    case '2':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(34, 232, 122, 0.1)',
        color: 'var(--green)'
      }
    case 'STRONG SELL':
    case '4':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(245, 101, 81, 0.2)',
        color: '#ef4444',
        border: '1px solid rgba(245, 101, 81, 0.4)',
        boxShadow: '0 0 4px rgba(245, 101, 81, 0.1)'
      }
    case 'SELL':
    case '3':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(245, 101, 81, 0.1)',
        color: 'var(--red)'
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

/** Helper to format volume with suffix (e.g. 1.2M, 50K) */
function formatShortVolume(vol) {
  if (!vol) return '0'
  if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M'
  if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K'
  return vol.toString()
}

export default function Dashboard({ latestTicks, alerts: wsAlerts, isConnected }) {
  const navigate = useNavigate()
  const [timeframe, setTimeframe] = useState('DAY')
  const [analytics, setAnalytics] = useState({
    summary: {
      active_signals: 0, buy_signals: 0, strong_buy_signals: 0, sell_signals: 0, strong_sell_signals: 0, hold_signals: 0, spikes_count: 0,
      market_breadth: { adv: 0, dec: 0, unch: 0 }
    },
    opportunities: [],
    opportunities_total: 0,
    backup_opportunities: [],
    backup_opportunities_total: 0,
    trends: [],
    symbols: []
  })

  const [summary, setSummary] = useState(null)
  const [watchlist, setWatchlist] = useState([])
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)
  const [chartData, setChartData] = useState([])
  const [opportunitiesTab, setOpportunitiesTab] = useState('ALL')
  const [backupOpportunitiesTab, setBackupOpportunitiesTab] = useState('ALL')
  const [symbolFilter, setSymbolFilter] = useState('ALL')
  // Server-side pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [backupCurrentPage, setBackupCurrentPage] = useState(1)
  const [backupPageSize, setBackupPageSize] = useState(15)
  const [loading, setLoading] = useState(true)
  const [oppsLoading, setOppsLoading] = useState(true)
  const [backupOppsLoading, setBackupOppsLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [localTime, setLocalTime] = useState('')
  const [dismissedAlerts, setDismissedAlerts] = useState([])
  const [recentAlerts, setRecentAlerts] = useState([])

  // Track previous prices to trigger flash animations
  const prevPricesRef = useRef({})
  const [priceFlashes, setPriceFlashes] = useState({})

  // Update IST clock every second
  useEffect(() => {
    const updateTime = () => {
      const options = {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }
      setLocalTime(new Date().toLocaleTimeString('en-US', options))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Load static watchlist instruments from DB
  const loadWatchlist = useCallback(async () => {
    try {
      const res = await getInstruments()
      setWatchlist(res.data?.items || res.data || [])
    } catch (e) {
      console.error('Failed to load watchlist instruments:', e)
    }
  }, [])

  // Fetch all dashboard analytics from ClickHouse (server-side pagination)
  const loadAnalytics = useCallback(async () => {
    try {
      const res = await getDashboardAnalytics({
        timeframe,
        symbol: symbolFilter !== 'ALL' ? symbolFilter : null,
        oppPage: currentPage,
        oppPageSize: pageSize,
        oppAction: opportunitiesTab,
        backupOppPage: backupCurrentPage,
        backupOppPageSize: backupPageSize,
        backupOppAction: backupOpportunitiesTab
      })
      setAnalytics(res.data || {
        summary: {
          active_signals: 0, buy_signals: 0, strong_buy_signals: 0, sell_signals: 0, strong_sell_signals: 0, hold_signals: 0, spikes_count: 0,
          market_breadth: { adv: 0, dec: 0, unch: 0 }
        },
        opportunities: [],
        opportunities_total: 0,
        backup_opportunities: [],
        backup_opportunities_total: 0,
        trends: [],
        symbols: []
      })
    } catch (e) {
      console.error('Failed to load dashboard analytics:', e)
    } finally {
      setOppsLoading(false)
      setBackupOppsLoading(false)
    }
  }, [timeframe, symbolFilter, currentPage, pageSize, opportunitiesTab, backupCurrentPage, backupPageSize, backupOpportunitiesTab])

  // Core background polling logic
  const loadData = useCallback(async () => {
    try {
      const sumRes = await getSummary().catch(() => ({ data: {} }))
      setSummary(sumRes.data)
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Dashboard loadData error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    loadData()
    loadWatchlist()
    loadAnalytics()

    const interval = setInterval(() => {
      loadData()
      loadAnalytics()
    }, 5000)
    return () => clearInterval(interval)
  }, [loadData, loadWatchlist, loadAnalytics])

  // Handle live alert logs from WS
  useEffect(() => {
    if (wsAlerts && wsAlerts.length > 0) {
      // De-duplicate and merge alerts
      setRecentAlerts(prev => {
        const merged = [...wsAlerts, ...prev]
        const unique = {}
        const filtered = []
        for (const item of merged) {
          const key = item.id || `${item.symbol}-${item.ts}`
          if (!unique[key]) {
            unique[key] = true
            filtered.push(item)
          }
        }
        return filtered.slice(0, 50)
      })
    }
  }, [wsAlerts])

  // Seed / merge real-time ticks
  const seededTicks = summary?.live_instruments ? {} : {}
  if (summary?.live_instruments) {
    for (const tick of summary.live_instruments) {
      seededTicks[tick.instrument_token] = tick
    }
  }

  // Merge WebSocket ticks (which win) over seeded database ticks
  const mergedTicks = { ...seededTicks, ...latestTicks }
  const ticksList = Object.values(mergedTicks)

  // Track price flash animations on new WebSocket ticks
  useEffect(() => {
    const flashes = {}
    let updated = false

    for (const tick of ticksList) {
      const token = tick.instrument_token
      const price = tick.ltp
      const prevPrice = prevPricesRef.current[token]

      if (prevPrice !== undefined && price !== prevPrice) {
        flashes[token] = price > prevPrice ? 'up' : 'down'
        updated = true
      }
      prevPricesRef.current[token] = price
    }

    if (updated) {
      setPriceFlashes(prev => ({ ...prev, ...flashes }))
      // Clear flash after 1s
      const timer = setTimeout(() => {
        setPriceFlashes({})
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [latestTicks, ticksList])

  // Load Candlestick chart
  const loadChart = async (token) => {
    try {
      const res = await getOHLCV(token, null, null, 300)
      setChartData(res.data.candles || [])
    } catch (e) {
      console.error('Candles fetch error:', e)
    }
  }

  useEffect(() => {
    if (selectedOpportunity) {
      loadChart(selectedOpportunity.instrument_token)
    }
  }, [selectedOpportunity, timeframe])

  // Synchronize selected opportunity when symbolFilter changes to a specific symbol
  useEffect(() => {
    if (symbolFilter && symbolFilter !== 'ALL') {
      const match = analytics.opportunities.find(o => o.symbol === symbolFilter) ||
        watchlist.find(w => w.tradingsymbol === symbolFilter)
      if (match) {
        setSelectedOpportunity({
          symbol: match.symbol || match.tradingsymbol,
          instrument_token: match.instrument_token
        })
      }
    }
  }, [symbolFilter, analytics.opportunities, watchlist])

  // Get index metrics (SPX, NDX, DJI)
  const getIndexData = (symbolName, defaultToken) => {
    const tick = ticksList.find(
      t => t.symbol?.toUpperCase() === symbolName.toUpperCase() ||
        t.tradingsymbol?.toUpperCase() === symbolName.toUpperCase() ||
        t.instrument_token === defaultToken
    )
    if (!tick) return { name: symbolName, price: '---', change: 0, isRealtime: false }

    const change = tick.close && tick.close > 0
      ? ((tick.ltp - tick.close) / tick.close) * 100
      : tick.change || 0

    return {
      name: tick.symbol || tick.tradingsymbol || symbolName,
      price: tick.ltp,
      change,
      isRealtime: !!latestTicks[tick.instrument_token]
    }
  }

  const indexes = [
    getIndexData('SPX', 3182352),
    getIndexData('NDX', 416843),
    getIndexData('DJI', 18053702)
  ]

  // Known index symbol names (from the index bar tokens)
  const isIndexSymbol = (sym) => {
    if (!sym) return false
    const u = sym.toUpperCase()
    return u === 'SPX' || u === 'NDX' || u === 'DJI' || u === 'VIX' || u.startsWith('/')
  }

  // Get unique symbols from backend response (already filtered by timeframe)
  const backendSymbols = analytics.symbols || []
  const allSymbols = Array.from(
    new Set([
      ...backendSymbols,
      ...watchlist.map(item => item.tradingsymbol)
    ].filter(Boolean))
  ).sort()
  const indexSymbols = allSymbols.filter(isIndexSymbol).sort()
  const stockSymbols = allSymbols.filter(sym => !isIndexSymbol(sym)).sort()

  // Paginated data comes directly from server — no client-side filtering/slicing needed
  const paginatedOpportunities = analytics.opportunities || []
  const paginatedBackupOpportunities = analytics.backup_opportunities || []

  const totalPages = Math.max(1, Math.ceil((analytics.opportunities_total || 0) / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const totalBackupPages = Math.max(1, Math.ceil((analytics.backup_opportunities_total || 0) / backupPageSize))
  const safeBackupCurrentPage = Math.min(backupCurrentPage, totalBackupPages)

  // Reset to page 1 whenever the active tab, symbol, or timeframe changes.
  useEffect(() => {
    setCurrentPage(1)
  }, [opportunitiesTab, symbolFilter, timeframe])

  useEffect(() => {
    setBackupCurrentPage(1)
  }, [backupOpportunitiesTab, symbolFilter, timeframe])

  // Trigger analytics reload whenever pagination/filter state changes
  useEffect(() => {
    setOppsLoading(true)
    setBackupOppsLoading(true)
    loadAnalytics()
  }, [loadAnalytics])

  // Get stats from backend summary for correct raw event metrics
  const buySignals = analytics.summary?.buy_signals || 0
  const strongBuySignals = analytics.summary?.strong_buy_signals || 0
  const sellSignals = analytics.summary?.sell_signals || 0
  const strongSellSignals = analytics.summary?.strong_sell_signals || 0
  const holdSignals = analytics.summary?.hold_signals || 0
  const activeSignals = analytics.summary?.active_signals || 0
  const spikesCount = analytics.summary?.spikes_count || 0

  const adv = analytics.summary?.market_breadth?.adv || 0
  const dec = analytics.summary?.market_breadth?.dec || 0
  const unch = analytics.summary?.market_breadth?.unch || 0
  const totalBreadth = adv + dec + unch
  const bullishPct = totalBreadth > 0 ? Math.round((adv / totalBreadth) * 100) : 50

  // Signal distribution for custom donut
  const totalSignals = spikesCount
  const neutralSignals = holdSignals

  // Donut SVG constants
  const donutRadius = 40
  const donutCircumference = 2 * Math.PI * donutRadius

  const buyPercent = totalSignals > 0 ? buySignals / totalSignals : 0
  const sellPercent = totalSignals > 0 ? sellSignals / totalSignals : 0
  const neutralPercent = totalSignals > 0 ? neutralSignals / totalSignals : 1

  const buyStrokeDash = donutCircumference * buyPercent
  const sellStrokeDash = donutCircumference * sellPercent
  const neutralStrokeDash = donutCircumference * neutralPercent

  const buyOffset = 0
  const sellOffset = -buyStrokeDash
  const neutralOffset = -(buyStrokeDash + sellStrokeDash)

  // Dismiss alert
  const dismissAlert = (alertId) => {
    setDismissedAlerts(prev => [...prev, alertId])
  }

  // Active banner alerts (excl. dismissed)
  const activeAlertsList = recentAlerts.filter(a => {
    const key = a.id || `${a.symbol}-${a.ts}`
    return !dismissedAlerts.includes(key)
  })

  return (
    <div className="dashboard-grid fade-in">

      {/* ── HEADER ROW ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            SPIKE TRADING DASHBOARD
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Institutional-grade high frequency market analytics terminal.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Alert Signal Timeframe Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Timeframe
            </span>
            <div className="timeframe-selector" style={{ padding: '2px' }}>
              {[
                { val: '15', label: '15m' },
                { val: '30', label: '30m' },
                { val: '45', label: '45m' },
                { val: '60', label: '60m' },
                { val: 'DAY', label: 'Day' },
                { val: 'ALL', label: 'All' }
              ].map(({ val, label }) => (
                <button
                  key={val}
                  className={`timeframe-btn ${timeframe === val ? 'active' : ''}`}
                  onClick={() => setTimeframe(val)}
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  data-all={val === 'ALL' ? 'true' : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Force Refresh Button */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { loadData(); loadAnalytics(); }}
            title="Force refresh metrics"
            style={{ padding: 8, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── INDEX QUICK WATCH ── */}
      <div className="dashboard-index-bar">
        {indexes.map((idx, i) => {
          const isPos = idx.change >= 0
          return (
            <div key={i} className="index-ticker-card">
              <span className="index-name">
                {idx.name}
                <span style={{
                  fontSize: '0.6rem', padding: '1px 5px', borderRadius: '4px',
                  background: idx.isRealtime ? 'rgba(34,232,122,0.1)' : 'rgba(255,255,255,0.05)',
                  color: idx.isRealtime ? 'var(--green)' : 'var(--text-muted)'
                }}>
                  {idx.isRealtime ? 'LIVE' : 'DELAYED'}
                </span>
              </span>
              <span className="index-price">
                ${idx.price !== '---' ? formatNumber(idx.price) : '---'}
                <span className={`index-change ${isPos ? 'positive' : 'negative'}`}>
                  {isPos ? <ChevronUp size={12} style={{ display: 'inline' }} /> : <ChevronDown size={12} style={{ display: 'inline' }} />}
                  {formatPct(idx.change)}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      {/* ── FIRST ROW: STAT CARDS ── */}
      <div className="dashboard-stats-grid">

        <div className="stat-card-premium active-signals">
          <span className="stat-title">Active</span>
          <span className="stat-number">
            {activeSignals}
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
              / {timeframe === 'ALL'
                ? (analytics.summary?.is_today ? 'Today' : (analytics.summary?.target_date || 'Day'))
                : timeframe === 'DAY'
                  ? 'Day'
                  : `${timeframe}m`}
            </span>
          </span>
          <span className="stat-trend neutral">
            <Clock size={11} /> Real-time active
          </span>
        </div>

        <div className="stat-card-premium strong-buy-signals">
          <span className="stat-title">Strong Buy</span>
          <span className="stat-number">{strongBuySignals}</span>
          <span className="stat-trend" style={{ color: '#10b981' }}>
            <ChevronUp size={13} /> Strong Bullish
          </span>
        </div>

        <div className="stat-card-premium buy-signals">
          <span className="stat-title">Buy</span>
          <span className="stat-number">{buySignals}</span>
          <span className="stat-trend positive">
            <ChevronUp size={13} /> Bullish spikes
          </span>
        </div>

        <div className="stat-card-premium strong-sell-signals">
          <span className="stat-title">Strong Sell</span>
          <span className="stat-number">{strongSellSignals}</span>
          <span className="stat-trend" style={{ color: '#ef4444' }}>
            <ChevronDown size={13} /> Strong Bearish
          </span>
        </div>

        <div className="stat-card-premium sell-signals">
          <span className="stat-title">Sell</span>
          <span className="stat-number">{sellSignals}</span>
          <span className="stat-trend negative">
            <ChevronDown size={13} /> Bearish spikes
          </span>
        </div>

        <div className="stat-card-premium hold-signals">
          <span className="stat-title">Hold</span>
          <span className="stat-number">{holdSignals}</span>
          <span className="stat-trend" style={{ color: '#818cf8' }}>
            <Activity size={12} /> Neutral / Hold
          </span>
        </div>

        <div className="stat-card-premium spikes-count">
          <span className="stat-title">Total Spikes</span>
          <span className="stat-number">{spikesCount}</span>
          <span className="stat-trend" style={{ color: '#3b82f6' }}>
            <Activity size={12} /> Today spikes
          </span>
        </div>

        {/* Circular Market Breadth */}
        <div className="stat-card-premium market-breadth-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span className="stat-title">Breadth</span>
          <div className="breadth-progress-wrapper" style={{ margin: 0 }}>
            <div className="breadth-gauge-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="breadth-gauge-circle" style={{ width: '36px', height: '36px', position: 'relative', flexShrink: 0 }}>
                <svg className="breadth-gauge-svg" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                  <circle className="breadth-gauge-bg" cx="18" cy="18" r="15" style={{ fill: 'none', stroke: 'rgba(255,255,255,0.05)', strokeWidth: 3 }} />
                  <circle
                    className="breadth-gauge-fill"
                    cx="18" cy="18" r="15"
                    style={{
                      fill: 'none',
                      stroke: 'var(--green)',
                      strokeWidth: 3,
                      strokeLinecap: 'round',
                      transition: 'stroke-dashoffset 0.6s ease'
                    }}
                    strokeDasharray={2 * Math.PI * 15}
                    strokeDashoffset={2 * Math.PI * 15 * (1 - bullishPct / 100)}
                  />
                </svg>
                <div className="breadth-gauge-value" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{bullishPct}%</div>
              </div>
              <div className="breadth-stats-compact" style={{ display: 'flex', flexDirection: 'column', gap: '1px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', lineHeight: 1.1 }}>
                <span className="adv" style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '2px' }}>▲ {adv}</span>
                <span className="dec" style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '2px' }}>▼ {dec}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── SECOND ROW: SPLIT LAYOUT ── */}
      <div className="dashboard-content-split">

        {/* LEFT COLUMN: OPPORTUNITIES */}
        <div className="dashboard-split-left">

          <div className="card opportunities-table-card">
            <div className="card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 14, marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={18} className="text-secondary" />
                  Priority Opportunities
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Ranked by opportunity rank (Abs event score * Abs price move)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* Symbol Filter Dropdown — grouped by Index / Stock */}
                <select
                  value={symbolFilter}
                  onChange={(e) => setSymbolFilter(e.target.value)}
                  style={{
                    padding: '6px 32px 6px 12px',
                    fontSize: '0.78rem',
                    borderRadius: '8px',
                    height: '32px',
                    backgroundPosition: 'right 10px center',
                    backgroundSize: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                  title="Filter opportunities by symbol"
                >
                  <option value="ALL">All Symbols</option>

                  {indexSymbols.length > 0 && (
                    <optgroup label="── Indices">
                      {indexSymbols.map(sym => (
                        <option key={sym} value={sym}>{sym}</option>
                      ))}
                    </optgroup>
                  )}

                  {stockSymbols.length > 0 && (
                    <optgroup label="── Stocks">
                      {stockSymbols.map(sym => (
                        <option key={sym} value={sym}>{sym}</option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <div className="table-tabs">
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'BUY', label: 'Buy', className: 'buy-tab' },
                    { id: 'STRONG BUY', label: 'Strong Buy', className: 'strong-buy-tab' },
                    { id: 'SELL', label: 'Sell', className: 'sell-tab' },
                    { id: 'STRONG SELL', label: 'Strong Sell', className: 'strong-sell-tab' },
                    { id: 'HOLD', label: 'Hold', className: 'hold-tab' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      className={`table-tab-btn ${tab.className || ''} ${opportunitiesTab === tab.id ? 'active' : ''}`}
                      onClick={() => setOpportunitiesTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

              <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>Time</th>
                    <th>Symbol</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th>Action</th>
                    <th style={{ textAlign: 'center' }}>Quality</th>
                    <th>Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {oppsLoading ? (
                    Array.from({ length: pageSize }).map((_, i) => (
                      <tr key={`sk-opp-${i}`} className="skeleton-row">
                        <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 48 }} /></td>
                        <td><span className="skeleton-cell" style={{ width: 80 }} /></td>
                        <td style={{ textAlign: 'right' }}><span className="skeleton-cell" style={{ width: 65 }} /></td>
                        <td><span className="skeleton-cell" style={{ width: 55 }} /></td>
                        <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 45 }} /></td>
                        <td><span className="skeleton-cell" style={{ width: 90 }} /></td>
                      </tr>
                    ))
                  ) : paginatedOpportunities.length > 0 ? (
                    paginatedOpportunities.map((item, idx) => {
                      const token = item.instrument_token
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
                        <tr
                          key={idx}
                          onClick={() => setSelectedOpportunity(item)}
                          className={selectedOpportunity?.instrument_token === token ? 'selected-row' : ''}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 'bold' }}>
                            {item.event_start ? formatSpikeTime(item.event_start) : '---'}
                          </td>
                          <td style={{ fontWeight: '800' }}>{item.symbol}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {item.entry_price !== undefined && item.entry_price !== null && item.entry_price !== 0
                              ? `$${formatNumber(item.entry_price, 2)}`
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
                          <td style={{ fontSize: '0.82rem' }}>{item.opportunity || '---'}</td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="empty-table" style={{ textAlign: 'center', padding: '32px 0' }}>
                        <Activity size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          No opportunity signals found in this timeframe.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Pagination footer (mirrors Price Spikes page) ── */}
            {(analytics.opportunities_total || 0) > 0 && (
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
                  <span className="text-muted" style={{ fontSize: '0.78rem' }}>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-hover)',
                      color: 'var(--text)',
                      outline: 'none',
                      fontSize: '0.78rem'
                    }}
                  >
                    {[10, 15, 25, 50, 100].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                  <span className="text-muted" style={{ fontSize: '0.72rem', marginLeft: 4 }}>
                    {analytics.opportunities_total || 0} row{(analytics.opportunities_total || 0) === 1 ? '' : 's'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={safeCurrentPage === 1}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={safeCurrentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* ── Intraday Spike Trend (embedded below the table) ── */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <BarChart3 size={14} className="text-secondary" />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intraday Spike Trend</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 4 }}>15-min intervals</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--green)' }}>▲ Up</span>
                  <span style={{ color: 'var(--red)' }}>▼ Down</span>
                </span>
              </div>
              <div style={{ width: '100%', height: 160 }}>
                {analytics.trends && analytics.trends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.trends} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorUp2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--green)" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorDown2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--red)" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="var(--red)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="rgba(255,255,255,0.12)" fontSize={9} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.12)" fontSize={9} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: '#12131a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: 'var(--text-muted)', fontWeight: 700 }}
                      />
                      <Area type="monotone" dataKey="up_spikes" name="Up Spikes" stroke="var(--green)" strokeWidth={1.5} fillOpacity={1} fill="url(#colorUp2)" />
                      <Area type="monotone" dataKey="down_spikes" name="Down Spikes" stroke="var(--red)" strokeWidth={1.5} fillOpacity={1} fill="url(#colorDown2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Waiting for trading metrics to build spike trends...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── THIRD ROW: CANDLE CHART (shown on row select) ── */}

      {/* Intraday Candlestick Chart (Active on Opportunity Select) */}
      {selectedOpportunity && (
        <div className="chart-container slide-up" style={{ marginTop: 10 }}>
          <div className="card-header">
            <span className="card-title">
              <BarChart3 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              1-Min Candles — {selectedOpportunity.symbol}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => loadChart(selectedOpportunity.instrument_token)}
                title="Refresh chart"
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setSelectedOpportunity(null); setChartData([]); }}
                title="Close chart"
              >
                ✕
              </button>
            </div>
          </div>

          {chartData.length > 0 ? (
            <CandlestickChart
              data={chartData}
              height={460}
              symbol={selectedOpportunity.symbol}
              latestTick={latestTicks?.[selectedOpportunity.instrument_token]}
            />
          ) : (
            <div className="empty-state">
              <BarChart3 size={40} />
              <h3>No Chart Data</h3>
              <p>Data will appear once ticks are recorded for this instrument.</p>
            </div>
          )}
        </div>
      )}

      {/* ── FOURTH ROW: BACKUP OPPORTUNITIES TABLE ── */}
      <div className="card opportunities-table-card" style={{ marginTop: 24 }}>
        <div className="card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 14, marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={18} className="text-muted" />
              Top Trading Opportunities
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              All raw price spike events from backup database view
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="table-tabs">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'BUY', label: 'Buy', className: 'buy-tab' },
                { id: 'STRONG BUY', label: 'Strong Buy', className: 'strong-buy-tab' },
                { id: 'SELL', label: 'Sell', className: 'sell-tab' },
                { id: 'STRONG SELL', label: 'Strong Sell', className: 'strong-sell-tab' },
                { id: 'HOLD', label: 'Hold', className: 'hold-tab' }
              ].map(tab => (
                <button
                  key={tab.id}
                  className={`table-tab-btn ${tab.className || ''} ${backupOpportunitiesTab === tab.id ? 'active' : ''}`}
                  onClick={() => setBackupOpportunitiesTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center', width: '50px' }}>Chart</th>
                <th style={{ textAlign: 'center' }}>Time</th>
                <th>Symbol</th>
                <th>Signal</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Price Diff</th>
                <th style={{ textAlign: 'right' }}>% Change</th>
                <th style={{ textAlign: 'center' }}>RSI (14)</th>
                <th>RSI Signal</th>
                <th style={{ textAlign: 'center' }}>Ticks</th>
                <th style={{ textAlign: 'center' }}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {backupOppsLoading ? (
                Array.from({ length: backupPageSize }).map((_, i) => (
                  <tr key={`sk-bk-${i}`} className="skeleton-row">
                    <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 30 }} /></td>
                    <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 52 }} /></td>
                    <td><span className="skeleton-cell" style={{ width: 85 }} /></td>
                    <td><span className="skeleton-cell" style={{ width: 65 }} /></td>
                    <td style={{ textAlign: 'right' }}><span className="skeleton-cell" style={{ width: 70 }} /></td>
                    <td style={{ textAlign: 'right' }}><span className="skeleton-cell" style={{ width: 55 }} /></td>
                    <td style={{ textAlign: 'right' }}><span className="skeleton-cell" style={{ width: 50 }} /></td>
                    <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 45 }} /></td>
                    <td><span className="skeleton-cell" style={{ width: 60 }} /></td>
                    <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 35 }} /></td>
                    <td style={{ textAlign: 'center' }}><span className="skeleton-cell" style={{ width: 40 }} /></td>
                  </tr>
                ))
              ) : paginatedBackupOpportunities.length > 0 ? (
                paginatedBackupOpportunities.map((item, idx) => {
                  const token = item.instrument_token
                  const currentPrice = item.close
                  const diff = item.price_diff
                  const changePct = (item.pct_change || 0) * 100 // ClickHouse stores pct_change as fractional (e.g. 0.02)
                  const isPos = changePct >= 0
                  const rawSignal = item.event_signal || 'HOLD'
                  const signalType = String(rawSignal).toUpperCase().trim()
                  const displaySignal = (signalType === 'STRONG BUY' || signalType === '5') ? 'STRONG BUY' :
                                        (signalType === 'BUY' || signalType === '2') ? 'BUY' :
                                        (signalType === 'STRONG SELL' || signalType === '4') ? 'STRONG SELL' :
                                        (signalType === 'SELL' || signalType === '3') ? 'SELL' : 'HOLD';

                  // Retrieve confidence score from DB
                  const confidenceVal = item.confidence_score !== undefined ? item.confidence_score : 0
                  const confidencePct = Math.round(((confidenceVal + 6) / 12) * 80 + 10) // normalized percentage [10%, 90%] for aesthetics
                  const confidenceClass = confidenceVal >= 4 ? 'high' : (confidenceVal >= -1 ? 'medium' : 'low')

                  return (
                    <tr
                      key={idx}
                      onClick={() => setSelectedOpportunity(item)}
                      className={selectedOpportunity?.instrument_token === token ? 'selected-row' : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/history?token=${token}`)
                          }}
                          title={`View ${item.symbol} Live History Chart`}
                          style={{
                            padding: '4px 6px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '4px',
                            color: 'var(--accent-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <BarChart3 size={13} />
                        </button>
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 'bold' }}>
                        {item.event_start ? formatSpikeTime(item.event_start) : '---'}
                      </td>
                      <td style={{ fontWeight: '800' }}>
                        {item.symbol}
                      </td>
                      <td>
                        <span style={getSignalBadgeStyle(signalType)}>
                          {displaySignal}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>
                        ${formatNumber(currentPrice)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: isPos ? 'var(--green)' : 'var(--red)' }}>
                        {isPos ? '+' : ''}{formatNumber(diff)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700', fontFamily: 'var(--font-mono)', color: isPos ? 'var(--green)' : 'var(--red)' }}>
                        {formatPct(changePct)}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                        {formatNumber(item.rsi || 0, 1)}
                      </td>
                      <td style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                        {item.rsi_signal || (item.rsi_slope > 0 ? '▲ Rising' : (item.rsi_slope < 0 ? '▼ Falling' : '◼ Flat'))}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                        {item.ticks}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.78rem',
                            fontWeight: 'bold',
                            minWidth: '22px',
                            textAlign: 'right',
                            color: confidenceVal > 0 ? 'var(--green)' : (confidenceVal < 0 ? 'var(--red)' : 'var(--text-secondary)')
                          }}>
                            {confidenceVal > 0 ? `+${confidenceVal}` : confidenceVal}
                          </span>
                          <div className="confidence-bar" title={`Confidence Score: ${confidenceVal}`} style={{ margin: 0 }}>
                            <div
                              className={`confidence-progress ${confidenceClass}`}
                              style={{ width: `${confidencePct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="11" className="empty-table" style={{ textAlign: 'center', padding: '32px 0' }}>
                    <Activity size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No backup opportunity signals found in this timeframe.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer for backup table ── */}
        {(analytics.backup_opportunities_total || 0) > 0 && (
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
              <span className="text-muted" style={{ fontSize: '0.78rem' }}>Rows per page:</span>
              <select
                value={backupPageSize}
                onChange={(e) => {
                  setBackupPageSize(Number(e.target.value))
                  setBackupCurrentPage(1)
                }}
                style={{
                  padding: '4px 24px 4px 8px',
                  fontSize: '0.72rem',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                {[15, 30, 50, 100].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <span className="text-muted" style={{ fontSize: '0.72rem', marginLeft: 8 }}>
                Showing {((safeBackupCurrentPage - 1) * backupPageSize) + 1} - {Math.min(safeBackupCurrentPage * backupPageSize, analytics.backup_opportunities_total || 0)} of {analytics.backup_opportunities_total || 0} rows
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setBackupCurrentPage(1)}
                disabled={safeBackupCurrentPage === 1}
                style={{ opacity: safeBackupCurrentPage === 1 ? 0.35 : 1, padding: '4px 8px' }}
              >
                « First
              </button>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setBackupCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={safeBackupCurrentPage === 1}
                style={{ opacity: safeBackupCurrentPage === 1 ? 0.35 : 1, padding: '4px 8px' }}
              >
                ‹ Prev
              </button>
              <span style={{ fontSize: '0.72rem', padding: '0 8px', color: 'var(--text-muted)' }}>
                Page <strong style={{ color: 'var(--text-primary)' }}>{safeBackupCurrentPage}</strong> of {totalBackupPages}
              </span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setBackupCurrentPage(prev => Math.min(totalBackupPages, prev + 1))}
                disabled={safeBackupCurrentPage === totalBackupPages}
                style={{ opacity: safeBackupCurrentPage === totalBackupPages ? 0.35 : 1, padding: '4px 8px' }}
              >
                Next ›
              </button>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setBackupCurrentPage(totalBackupPages)}
                disabled={safeBackupCurrentPage === totalBackupPages}
                style={{ opacity: safeBackupCurrentPage === totalBackupPages ? 0.35 : 1, padding: '4px 8px' }}
              >
                Last »
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
