import { Clock, Menu, Sun, Moon } from 'lucide-react'
import { useState, useEffect } from 'react'
import client from '../api/client'

export default function Navbar({ isConnected, onMenuClick, theme, setTheme }) {
  const [time, setTime] = useState(new Date())
  const [todayTicks, setTodayTicks] = useState(0)

  useEffect(() => {
    const timeInterval = setInterval(() => setTime(new Date()), 1000)

    const fetchTicks = () => {
      client.get('/stats/today-ticks')
        .then((res) => setTodayTicks(res.data?.count ?? 0))
        .catch(() => {})
    }
    fetchTicks()
    const ticksInterval = setInterval(fetchTicks, 30000)

    return () => {
      clearInterval(timeInterval)
      clearInterval(ticksInterval)
    }
  }, [])

  const isMarketOpen = () => {
    const et = new Date(time.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const day = et.getDay()
    if (day === 0 || day === 6) return false
    const totalMin = et.getHours() * 60 + et.getMinutes()
    return totalMin >= 570 && totalMin <= 960 // 9:30 AM - 4:00 PM ET
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
        <span className="navbar-title">SpikeIQ US</span>
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
        <div className="kpi-item" title="Today's total ticks captured">
          <span className="kpi-label">Today Ticks</span>
          <span className="kpi-value" style={{ color: 'var(--green)' }}>
            {Number(todayTicks).toLocaleString('en-US')}
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
