import React from 'react';
import {
  LayoutDashboard, Search, Bell, Zap, List, History, LineChart, Settings, Shield, LogOut, Activity, Database, BarChart2, Gem, X, Bot,
  ChevronLeft, ChevronRight, Sliders
} from 'lucide-react';

const navItems = (isAdmin) => [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'pre-spike', icon: Activity, label: 'Pre-Spike' },
  { id: 'predefined-alerts', icon: List, label: 'Price Spikes' },
  { id: 'instruments', icon: Search, label: 'Instruments' },
  { id: 'alerts', icon: Bell, label: 'Alerts' },
  { id: 'hf-alerts', icon: Zap, label: 'HF Alerts' },
  { id: 'history', icon: History, label: 'Live History' },
  { id: 'historical', icon: LineChart, label: 'Historical' },
  ...(isAdmin ? [{ id: 'etl', icon: Database, label: 'Data ETL' }] : []),
  { id: 'option-chain', icon: BarChart2, label: 'Option Chain' },
  { id: 'option-simulator', icon: Sliders, label: 'Option Simulator' },
  { id: 'commodity', icon: Gem, label: 'Commodity' },
  ...(isAdmin ? [{ id: 'ai-chat', icon: Bot, label: 'AI Assistant' }] : []),
  ...(isAdmin ? [{ id: 'settings', icon: Settings, label: 'Settings' }] : []),
  ...(isAdmin ? [{ id: 'admin', icon: Shield, label: 'Admin' }] : []),
]

export default function Sidebar({ 
  isAdmin = false, 
  isMobileOpen, 
  setIsMobileOpen, 
  isCollapsed, 
  setIsCollapsed,
  currentPage,
  setCurrentPage,
  userProfile,
  onLogout
}) {
  const effectiveIsAdmin = isAdmin || userProfile?.isAdmin || false;

  return (
    <>
      {/* ── Overlay for Mobile ── */}
      {isMobileOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setIsMobileOpen(false)} />
      )}

      {/* ── Sidebar (Desktop + Mobile Slide Panel) ── */}
      <aside className={`sidebar ${isMobileOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        
        {/* Desktop floating toggle button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Activity size={20} />
          </div>
          <span className="sidebar-brand">SpikeIQ</span>
          <button className="mobile-close-btn" onClick={() => setIsMobileOpen(false)} title="Close Menu" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: isMobileOpen ? 'block' : 'none', marginLeft: 'auto' }}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems(effectiveIsAdmin).map(({ id, icon: Icon, label }) => (
            <div
              key={id}
              onClick={() => {
                setCurrentPage(id);
                setIsMobileOpen(false);
              }}
              className={`nav-item ${currentPage === id ? 'active' : ''}`}
              title={isCollapsed ? label : undefined}
            >
              <Icon size={18} className="icon" />
              <span className="nav-label">{label}</span>
              {/* Optional: Add badge logic here if needed */}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            Logged in as <strong>{userProfile?.traderName || 'user'}</strong>
          </div>
          <button className="logout-btn" onClick={onLogout} title={isCollapsed ? "Logout" : undefined}>
            <LogOut size={18} />
            <span className="logout-text">Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}
