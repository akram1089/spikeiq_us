import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import LoginPage from './auth/LoginPage'
import LandingPage from './pages/LandingPage'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import PreSpikeDashboard from './pages/PreSpikeDashboard'
import InstrumentsCatalog from './pages/InstrumentsCatalog'
import { useWebSocket } from './hooks/useWebSocket'
import { useAlertWebSocket } from './hooks/useAlertWebSocket'
import toast, { Toaster } from 'react-hot-toast'
import { playAlertSound } from './utils/browserNotify'
import { showPreSpikeAlertToast } from './utils/preSpikeAlertUi'
import { X } from 'lucide-react'

export default function App() {
  const { isAuthenticated, token } = useAuth()
  const restUrl =
    import.meta.env.DEV &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:8000/api'
      : '/api'
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', isSidebarCollapsed)
  }, [isSidebarCollapsed])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const handleAlertWebSocketMessage = useCallback((msg) => {
    if (msg.type === 'pre_spike_alert' && msg.data) {
      showPreSpikeAlertToast(msg.data)
    }
  }, [])

  const handleWebSocketMessage = useCallback((msg) => {
    if (msg.type === 'price_spike_alert') {
      const spike = msg.data
      const isBuy = spike.final_signal && spike.final_signal.toLowerCase().includes('buy')
      const sign = spike.pct_change > 0 ? '+' : ''
      const accentColor = isBuy ? 'var(--green)' : 'var(--red)'
      const accentBg = isBuy ? 'var(--green-bg)' : 'var(--red-bg)'

      playAlertSound()

      toast.custom(
        (t) => (
          <div
            className={`custom-toast ${t.visible ? 'animate-enter' : 'animate-leave'}`}
            style={{
              border: `1px solid ${accentColor}`,
              boxShadow: `0 0 15px ${accentBg}, var(--shadow-lg)`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: accentColor }}>{isBuy ? '📈' : '📉'}</span>
                {spike.symbol}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: accentBg,
                    color: accentColor,
                    border: `1px solid ${accentColor}40`,
                  }}
                >
                  {spike.final_signal}
                </span>
                <button className="custom-toast-dismiss" onClick={() => toast.dismiss(t.id)} title="Dismiss alert">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <div>
                Change: <strong style={{ color: accentColor, fontFamily: 'var(--font-mono)' }}>{sign}{Number(spike.pct_change).toFixed(2)}%</strong>
              </div>
              <div>
                Price: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>${Number(spike.close).toFixed(2)}</strong>
              </div>
            </div>
          </div>
        ),
        { duration: 6000 }
      )
    }
  }, [])

  const { isConnected, latestTicks, alerts } = useWebSocket(
    isAuthenticated ? undefined : null,
    handleWebSocketMessage
  )

  useAlertWebSocket(isAuthenticated, handleAlertWebSocketMessage)

  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-right" reverseOrder={false} />
        <Routes>
          <Route path="/" element={<LandingPage theme={theme} setTheme={setTheme} />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<LandingPage theme={theme} setTheme={setTheme} />} />
        </Routes>
      </>
    )
  }

  return (
    <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Toaster position="top-right" reverseOrder={false} />
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />
      <div className="main-content">
        <Navbar
          isConnected={isConnected}
          onMenuClick={() => setIsMobileMenuOpen(true)}
          theme={theme}
          setTheme={setTheme}
        />
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard latestTicks={latestTicks} alerts={alerts} isConnected={isConnected} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pre-spike"
              element={
                <ProtectedRoute>
                  <PreSpikeDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instruments"
              element={
                <ProtectedRoute>
                  <InstrumentsCatalog restUrl={restUrl} token={token} />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
