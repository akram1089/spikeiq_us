import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  LayoutDashboard, Search, LogOut, Activity, X,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pre-spike', icon: Activity, label: 'Pre-Spike' },
  { to: '/instruments', icon: Search, label: 'Instruments' },
]

export default function Sidebar({ isMobileOpen, setIsMobileOpen, isCollapsed, setIsCollapsed }) {
  const { user, logout } = useAuth()

  return (
    <>
      {isMobileOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setIsMobileOpen(false)} />
      )}

      <aside className={`sidebar ${isMobileOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <button
          className="sidebar-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Activity size={20} />
          </div>
          <span className="sidebar-brand">SpikeIQ</span>
          <button
            className="mobile-close-btn"
            onClick={() => setIsMobileOpen(false)}
            title="Close Menu"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: isMobileOpen ? 'block' : 'none', marginLeft: 'auto' }}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              onClick={() => setIsMobileOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={isCollapsed ? label : undefined}
            >
              <Icon size={18} className="icon" />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            Logged in as <strong>{user?.username || 'user'}</strong>
          </div>
          <button className="logout-btn" onClick={logout} title={isCollapsed ? 'Logout' : undefined}>
            <LogOut size={18} />
            <span className="logout-text">Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}
