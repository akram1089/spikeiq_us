import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Zap, Bell, BarChart2, Database, LineChart, Search, List, History, Gem, Shield, Clock, Globe, Cpu, Sun, Moon } from 'lucide-react'
import '../styles/landing.css'

const TICKER_DATA = [
  { symbol: 'SPX', price: '5,842.15', change: '+0.84%', up: true },
  { symbol: '/ES', price: '5,841.50', change: '+0.82%', up: true },
  { symbol: '/NQ', price: '20,456.25', change: '+1.12%', up: true },
  { symbol: 'TSLA', price: '342.60', change: '+2.45%', up: true },
  { symbol: 'AAPL', price: '198.25', change: '-0.32%', up: false },
  { symbol: 'NVDA', price: '875.40', change: '+1.56%', up: true },
  { symbol: 'MSFT', price: '412.80', change: '+0.92%', up: true },
  { symbol: 'META', price: '528.15', change: '+0.65%', up: true },
]

const FEATURES = [
  {
    icon: '📊', color: 'var(--accent-primary)', name: 'Live Dashboard',
    desc: 'Real-time WebSocket price feeds for US equities, futures, and indices with sub-5ms latency.',
    benefits: ['Live LTP, OHLC & OI streaming', 'Top 5 bid/ask depth', 'Multi-instrument watchlist'],
    mock: () => (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['SPX', '5,842', '+0.84%', true], ['/ES', '5,841', '+0.82%', true],
          ['TSLA', '342', '-0.32%', false], ['NVDA', '875', '+1.56%', true]].map(([s, p, c, up]) => (
          <div key={s} className={`hero-price-item ${up ? 'up' : 'dn'}`}>
            <div className="hpi-symbol">{s}</div>
            <div className="hpi-price">${p}</div>
            <div className={`hpi-change ${up ? 'up' : 'dn'}`}>{c}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '⚡', color: '#f97316', name: 'Price Spikes',
    desc: 'Detect sudden % moves across all instruments instantly. Get notified before the market reacts.',
    benefits: ['Configurable % threshold triggers', 'Browser push + WhatsApp alerts', 'Multi-timeframe monitoring'],
    mock: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['SPX', '▲ +1.2% spike', 'up'], ['/NQ', '▼ -0.8% dip', 'dn'], ['TSLA', '▲ +2.4% surge', 'up']].map(([s, m, t]) => (
          <div key={s} className={`alert-banner ${t === 'up' ? 'rally' : 'crash'}`} style={{ margin: 0, padding: '10px 14px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{s}</span>
            <span style={{ flex: 1, fontSize: '0.78rem', marginLeft: 8 }}>{m}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '🔍', color: 'var(--accent-primary)', name: 'Instruments',
    desc: 'Search and manage US equities, ETFs, indices, and futures by symbol with instant results.',
    benefits: ['Symbol & name-based search', 'One-click watchlist add/remove', 'Exchange filter (NASDAQ/NYSE/CBOE/CME)'],
    mock: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', borderRadius: 10, padding: '8px 12px', border: '1px solid var(--border-color)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Search instruments...</span>
        </div>
        {[['AAPL', 'NASDAQ', 'blue'], ['SPX', 'CBOE', 'purple'], ['/ES', 'CME', 'blue']].map(([n, e, c]) => (
          <div key={n} className="mock-row"><span className="mock-val">{n}</span><span className={`mock-tag ${c}`}>{e}</span></div>
        ))}
      </div>
    ),
  },
  {
    icon: '🔔', color: '#06b6d4', name: 'Smart Alerts',
    desc: 'Build rule-based alerts with custom conditions. Delivered instantly via browser push and WhatsApp.',
    benefits: ['Drag-and-drop alert builder', 'Price/volume/% conditions', 'WhatsApp & push delivery'],
    mock: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['SPX > 5800', 'Active', 'up'], ['TSLA % > 2', 'Triggered', 'dn'], ['/ES < 5850', 'Active', 'up']].map(([c, s, t]) => (
          <div key={c} className="mock-row">
            <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{c}</span>
            <span className={`mock-tag ${t === 'up' ? 'up' : 'dn'}`}>{s}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '⚡⚡', color: '#ef4444', name: 'HF Alerts',
    desc: 'Millisecond-level high-frequency spike detection on raw tick data. Built for scalpers and institutions.',
    benefits: ['Sub-second trigger latency', 'Tick-level precision', 'Parallel multi-instrument scanning'],
    mock: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[['09:30:01.342', 'TSLA', '+0.82%'], ['09:30:00.198', 'SPX', '+0.54%'], ['09:29:58.901', '/NQ', '-0.42%']].map(([t, s, c]) => (
          <div key={t} className="mock-row">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t}</span>
            <span className="mock-val">{s}</span>
            <span className={`mock-tag ${c.startsWith('+') ? 'up' : 'dn'}`}>{c}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '📋', color: '#10b981', name: 'Live History',
    desc: 'Full tick-by-tick streaming audit trail. Watch trades unfold in real time for any instrument.',
    benefits: ['Real-time tick streaming', 'Full OHLCV per tick', 'Instant instrument switching'],
    mock: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="mock-row" style={{ background: 'var(--bg-primary)' }}>
          {['Time', 'Price', 'Volume', 'Change'].map(h => <span key={h} style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</span>)}
        </div>
        {[['09:30:01', '5,842', '1.2M', '+0.12%'], ['09:30:00', '5,835', '890K', '-0.04%'], ['09:29:59', '5,838', '720K', '+0.08%']].map(([t, p, v, c]) => (
          <div key={t} className="mock-row">
            <span className="mock-label">{t}</span>
            <span className="mock-val">{p}</span>
            <span className="mock-label">{v}</span>
            <span className={`mock-tag ${c.startsWith('+') ? 'up' : 'dn'}`}>{c}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '📈', color: 'var(--accent-primary)', name: 'Historical Data',
    desc: 'Query up to 10 years of OHLCV candlestick data with ClickHouse powering instant results on 500M+ rows.',
    benefits: ['1min to monthly intervals', 'Interactive candlestick charts', 'Technical indicator overlays'],
    mock: () => (
      <div style={{ padding: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          {['1m','5m','15m','1H','1D'].map(i => (
            <span key={i} style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: i === '1D' ? 'rgba(59,130,246,0.2)' : 'var(--bg-card)', color: i === '1D' ? 'var(--accent-primary)' : 'var(--text-muted)', cursor: 'pointer' }}>{i}</span>
          ))}
        </div>
        <svg viewBox="0 0 220 80" style={{ width: '100%', height: 80 }}>
          <polyline points="0,70 40,55 80,60 120,35 160,40 200,20 220,25" fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
          <polygon points="0,70 40,55 80,60 120,35 160,40 200,20 220,25 220,80 0,80" fill="rgba(59,130,246,0.08)" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {['O: 5,810', 'H: 5,850', 'L: 5,805', 'C: 5,842'].map(v => (
            <span key={v} style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{v}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: '🎯', color: '#8b5cf6', name: 'Pre-Spike Alerts',
    desc: 'Early warning system that flags instruments building momentum before a spike — powered by ClickHouse analytics.',
    benefits: ['Pre-spike candidate scoring', 'Multi-timeframe watchlist', 'Actionable buy/sell signals'],
    mock: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['TSLA', 'Building', 'up'], ['NVDA', 'Watch', 'up'], ['/ES', 'Cooling', 'dn']].map(([s, st, t]) => (
          <div key={s} className="mock-row">
            <span className="mock-val">{s}</span>
            <span className={`mock-tag ${t === 'up' ? 'up' : 'dn'}`}>{st}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '🗄️', color: '#f97316', name: 'Tick Pipeline',
    desc: 'High-throughput tick ingestion from Interactive Brokers into ClickHouse with Kafka buffering and deduplication.',
    benefits: ['Sub-second tick capture', 'ET timezone partitioning', 'Live progress monitoring'],
    mock: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[['SPX — Today', 92, 'var(--accent-primary)'], ['AAPL — Today', 78, 'var(--accent-primary)'], ['/ES — Today', 100, '#10b981']].map(([n, p, c]) => (
          <div key={n}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{n}</span>
              <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: p === 100 ? 'var(--green)' : 'var(--text-primary)' }}>{p}%</span>
            </div>
            <div className="mock-bar-wrap"><div className="mock-bar" style={{ width: `${p}%`, background: c }} /></div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: '🏅', color: '#eab308', name: 'US Futures',
    desc: 'Real-time CME futures tracking: /ES, /NQ, /YM, /CL and more with full analytics and spike detection.',
    benefits: ['Live futures price streaming', 'Full OHLC + volume', 'Futures spike alerts'],
    mock: () => (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[['/ES', '5,841', '+0.82%', true], ['/NQ', '20,456', '+1.12%', true], ['/CL', '78.42', '+1.45%', true], ['/YM', '42,180', '-0.32%', false]].map(([s, p, c, up]) => (
          <div key={s} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 4 }}>{s}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.95rem' }}>${p}</div>
            <div className={`mock-tag ${up ? 'up' : 'dn'}`} style={{ marginTop: 4, display: 'inline-block' }}>{c}</div>
          </div>
        ))}
      </div>
    ),
  },
]

const WHY = [
  { icon: <Zap size={24} />, color: '#f97316', title: 'Lightning Fast', desc: 'Sub-5ms WebSocket tick delivery powered by Interactive Brokers and ClickHouse time-series DB.' },
  { icon: <Shield size={24} />, color: 'var(--accent-primary)', title: 'Enterprise Secure', desc: 'JWT auth, Docker isolation, encrypted credentials and role-based admin access.' },
  { icon: <BarChart2 size={24} />, color: 'var(--accent-primary)', title: 'Professional Grade', desc: 'Institutional-level spike analytics, pre-spike scoring, and multi-timeframe dashboards — beyond retail terminals.' },
  { icon: <Globe size={24} />, color: '#06b6d4', title: 'All Markets', desc: 'US equities, ETFs, indices, and CME futures — one unified terminal.' },
]

const TECH = [
  { label: 'Interactive Brokers', icon: '🔗' }, { label: 'ClickHouse', icon: '🗄️' },
  { label: 'FastAPI', icon: '⚡' }, { label: 'WebSocket', icon: '🔄' },
  { label: 'React + Vite', icon: '⚛️' }, { label: 'Docker', icon: '🐳' },
  { label: 'WhatsApp API', icon: '💬' }, { label: 'OpenRouter AI', icon: '🤖' },
]

export default function LandingPage({ theme, setTheme }) {
  const tickerItems = [...TICKER_DATA, ...TICKER_DATA]

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh', overflowX: 'hidden' }}>
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <a href="/" className="landing-nav-logo" style={{ textDecoration: 'none' }}>
          <div className="landing-nav-logo-icon"><Activity size={20} color="white" /></div>
          SpikeIQ
        </a>
        <ul className="landing-nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#why">Why SpikeIQ</a></li>
          <li><a href="#tech">Technology</a></li>
        </ul>
        <div className="landing-nav-actions">
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
          <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
          <Link to="/login" className="btn btn-primary btn-sm">Get Started</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="hero-inner">
          <div>
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              Live Market Intelligence Platform
            </div>
            <h1 className="hero-title">
              Institutional-Grade<br />
              <span className="hero-title-gradient">Market Intelligence</span><br />
              for US Markets
            </h1>
            <p className="hero-sub">
              Real-time spike detection for US equities, futures, and indices — all in one powerful terminal built for speed.
            </p>
            <div className="hero-actions">
              <Link to="/login" className="btn btn-primary btn-lg">
                Get Started Free <ArrowRight size={18} />
              </Link>
              <a href="#features" className="btn btn-ghost btn-lg">Explore Features</a>
            </div>
            <div className="hero-stats">
              {[['10K+', 'Instruments'], ['<5ms', 'Tick Latency'], ['500M+', 'Ticks/Day'], ['99.9%', 'Uptime']].map(([v, l]) => (
                <div key={l} className="hero-stat">
                  <span className="hero-stat-value">{v}</span>
                  <span className="hero-stat-label">{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-card-mock">
              <div className="hero-card-header">
                <span className="hero-card-title">Live Market Feed</span>
                <span className="status-badge online"><span className="status-dot" />Live</span>
              </div>
              <div className="hero-price-grid">
                {[['SPX', '5,842', '+0.84%', true], ['/ES', '5,841', '+0.82%', true],
                  ['TSLA', '342', '-0.32%', false], ['NVDA', '875', '+1.56%', true]].map(([s, p, c, up]) => (
                  <div key={s} className={`hero-price-item ${up ? 'up' : 'dn'}`}>
                    <div className="hpi-symbol">{s}</div>
                    <div className="hpi-price">${p}</div>
                    <div className={`hpi-change ${up ? 'up' : 'dn'}`}>{c}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--green-bg)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--green)', fontWeight: 600 }}>⚡ TSLA spike +2.4% detected in 1.8s</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker Bar ── */}
      <div className="ticker-bar">
        <div className="ticker-track">
          {tickerItems.map((t, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-symbol">{t.symbol}</span>
              <span className="ticker-price">${t.price}</span>
              <span className={`ticker-change ${t.up ? 'up' : 'dn'}`}>{t.change}</span>
              <span className="ticker-sep">|</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section id="features" style={{ padding: '100px 5%' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="section-label"><Zap size={14} /> Platform Features</div>
          <h2 className="section-title">Everything You Need to<br /><span className="hero-title-gradient">Trade Smarter</span></h2>
          <p className="section-sub">9 powerful modules covering live US equities, futures, alerts, and historical research — all in one terminal.</p>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div key={f.name} className="feature-card">
                <div className="feature-mock">{f.mock()}</div>
                <div className="feature-info">
                  <div className="feature-icon" style={{ background: `${f.color}20`, color: f.color }}>{f.icon}</div>
                  <div className="feature-name">{f.name}</div>
                  <p className="feature-desc">{f.desc}</p>
                  <ul className="feature-benefits">
                    {f.benefits.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats Banner ── */}
      <div className="stats-banner">
        <div className="stats-banner-inner">
          {[['10,000+', 'Instruments Tracked'], ['< 5ms', 'Average Tick Latency'], ['500M+', 'Ticks Processed Daily'], ['99.9%', 'Platform Uptime']].map(([n, d]) => (
            <div key={d}>
              <div className="stat-number">{n}</div>
              <div className="stat-desc">{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Why SpikeIQ ── */}
      <section id="why" style={{ padding: '100px 5%' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="section-label"><Shield size={14} /> Why SpikeIQ</div>
          <h2 className="section-title">Built for Professionals,<br /><span className="hero-title-gradient">Trusted by Traders</span></h2>
          <p className="section-sub">We built the terminal we always wanted — fast, deep, and reliable. No compromises.</p>
          <div className="why-grid">
            {WHY.map((w) => (
              <div key={w.title} className="why-card">
                <div className="why-icon" style={{ background: `${w.color}20`, color: w.color }}>{w.icon}</div>
                <div className="why-title">{w.title}</div>
                <p className="why-desc">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Section ── */}
      <section id="tech" style={{ padding: '80px 5%', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="section-label"><Cpu size={14} /> Technology Stack</div>
          <h2 className="section-title" style={{ fontSize: '2rem' }}>Enterprise-Grade Infrastructure</h2>
          <p className="section-sub">Built on battle-tested open-source technology and industry-leading market data APIs.</p>
          <div className="tech-badges">
            {TECH.map((t) => (
              <div key={t.label} className="tech-badge">
                <span>{t.icon}</span> {t.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section">
        <div className="cta-inner">
          <h2 className="cta-title">Start Trading Smarter Today</h2>
          <p className="cta-sub">Join traders who rely on SpikeIQ for institutional-grade market intelligence.</p>
          <div className="cta-actions">
            <Link to="/login" className="btn btn-primary btn-lg">
              Get Started Free <ArrowRight size={18} />
            </Link>
            <a href="#features" className="btn btn-ghost btn-lg">View All Features</a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <a href="/" className="landing-nav-logo" style={{ textDecoration: 'none', marginBottom: 12, display: 'inline-flex' }}>
                <div className="landing-nav-logo-icon"><Activity size={18} color="white" /></div>
                SpikeIQ
              </a>
              <p>Institutional-grade market intelligence terminal for US equities, ETFs, indices, and CME futures. Real-time data, professional analytics.</p>
            </div>
            <div>
              <div className="footer-col-title">Platform</div>
              <ul className="footer-links">
                {[['Dashboard', '/login'], ['Pre-Spike', '/login'], ['Instruments', '/login'], ['Price Spikes', '/login']].map(([l, h]) => (
                  <li key={l}><Link to={h}>{l}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Features</div>
              <ul className="footer-links">
                {['Live Dashboard', 'Price Spikes', 'Pre-Spike', 'Instruments', 'US Futures', 'Historical Data'].map((f) => (
                  <li key={f}><a href="#features">{f}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              <ul className="footer-links">
                {['About', 'Contact', 'Privacy Policy', 'Terms of Service'].map((f) => (
                  <li key={f}><a href="#">{f}</a></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-copy">© {new Date().getFullYear()} SpikeIQ. All rights reserved.</span>
            <div className="footer-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
