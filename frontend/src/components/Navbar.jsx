import { Clock, Menu, Play, Square, Settings, Sun, Moon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getTickerStatus, startTicker, stopTicker } from '../api/endpoints'
import toast from 'react-hot-toast'
import { NAVBAR_STATUS_POLL_INTERVAL } from '../config/featureFlags'

export default function Navbar({ isConnected, onMenuClick, theme, setTheme }) {
  const [time, setTime] = useState(new Date())
  const [gatewayConnected, setGatewayConnected] = useState(false)
  const [tickerRunning, setTickerRunning] = useState(false)
  const [wsClients, setWsClients] = useState(0)
  const [todayTicks, setTodayTicks] = useState(0)
  const [isGatewayLoading, setIsGatewayLoading] = useState(false)
  const [isTickerLoading, setIsTickerLoading] = useState(false)

  useEffect(() => {
    const timeInterval = setInterval(() => setTime(new Date()), 1000)

    const checkStatus = () => {
      getTickerStatus()
        .then((res) => {
          const data = res.data || {}
          const connected = Boolean(data.kite_authenticated ?? data.ib_connected)
          setGatewayConnected(connected)
          setTickerRunning(Boolean(data.running))
          setWsClients(data.ws_clients ?? 0)
          setTodayTicks(data.today_ticks ?? 0)
        })
        .catch(() => {
          setGatewayConnected(false)
          setTickerRunning(false)
        })
    }
    checkStatus()
    const statusInterval = setInterval(checkStatus, NAVBAR_STATUS_POLL_INTERVAL)
    return () => {
      clearInterval(timeInterval)
      clearInterval(statusInterval)
    }
  }, [])

  const handleGatewayReconnect = async () => {
    setIsGatewayLoading(true)
    try {
      await startTicker()
      toast.success('IB Gateway stream started')
      setGatewayConnected(true)
      setTickerRunning(true)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'IB Gateway not connected')
    } finally {
      setIsGatewayLoading(false)
    }
  }

  const handleStartTicker = async () => {
    setIsTickerLoading(true)
    try {
      await startTicker()
      toast.success('Ticker stream started!')
      setTickerRunning(true)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to start ticker')
    } finally {
      setIsTickerLoading(false)
    }
  }

  const handleStopTicker = async () => {
    setIsTickerLoading(true)
    try {
      await stopTicker()
      toast.success('Ticker stream stopped')
      setTickerRunning(false)
    } catch (e) {
      toast.error('Failed to stop ticker')
    } finally {
      setIsTickerLoading(false)
    }
  }

  const isMarketOpen = () => {
    const et = new Date(time.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const day = et.getDay()
    if (day === 0 || day === 6) return false
    const totalMin = et.getHours() * 60 + et.getMinutes()
    return totalMin >= 570 && totalMin <= 960
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <header className="navbar">
      <div className="navbar-left">
        <button className="mobile-menu-btn" onClick={onMenuClick} title="Open Menu">
          <Menu size={20} />
        </button>
        <span className="navbar-title">SpikeIQ</span>
        <span className={`status-badge ${isMarketOpen() ? 'online' : 'offline'}`}>
          <span className="status-dot" />
          <span className="badge-text">{isMarketOpen() ? 'Market Open' : 'Market Closed'}</span>
        </span>
      </div>

      <div className="navbar-kpis">
        <div className="kpi-item" title="Live WebSocket connection status">
          <span className="kpi-label">Market Stream</span>
          <span className="kpi-value" style={{ color: isConnected ? 'var(--green)' : 'var(--red)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isConnected ? 'var(--green)' : 'var(--red)', display: 'inline-block' }} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        <div className="kpi-item" title="Interactive Brokers Gateway connection">
          <span className="kpi-label">IB Status</span>
          <span className="kpi-value" style={{ color: gatewayConnected ? 'var(--green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            {gatewayConnected ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                CONNECTED
              </>
            ) : (
              'DISCONNECTED'
            )}
          </span>
        </div>

        <div className="kpi-item" title="IB market data stream control" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="kpi-label">Ticker Control</span>
          <span className="kpi-value" style={{ display: 'flex', alignItems: 'center', marginTop: '1px' }}>
            {gatewayConnected ? (
              tickerRunning ? (
                <button
                  className="btn btn-danger"
                  onClick={handleStopTicker}
                  disabled={isTickerLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '0.65rem', borderRadius: '6px', height: '18px', minHeight: '18px' }}
                >
                  <Square size={8} fill="currentColor" /> Stop
                </button>
              ) : (
                <button
                  className="btn btn-success"
                  onClick={handleStartTicker}
                  disabled={isTickerLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '0.65rem', borderRadius: '6px', height: '18px', minHeight: '18px' }}
                >
                  <Play size={8} fill="currentColor" /> Start
                </button>
              )
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleGatewayReconnect}
                disabled={isGatewayLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '0.65rem', borderRadius: '6px', height: '18px', minHeight: '18px' }}
              >
                <Settings size={8} /> Link IB
              </button>
            )}
          </span>
        </div>

        <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        <div className="kpi-item" title="Today's total ticks captured (ET)">
          <span className="kpi-label">Today Ticks</span>
          <span className="kpi-value" style={{ color: 'var(--green)' }}>
            {Number(todayTicks).toLocaleString('en-US')}
          </span>
        </div>

        <div className="kpi-item" title="Connected WebSocket clients">
          <span className="kpi-label">WS Clients</span>
          <span className="kpi-value" style={{ color: 'var(--accent-primary)' }}>
            {wsClients}
          </span>
        </div>
      </div>

      <div className="navbar-right">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ marginRight: '8px' }}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span className="btn-text" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </span>
        </button>

        <span className="nav-clock" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          <Clock size={14} />
          {time.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true })}
        </span>
      </div>
    </header>
  )
}
