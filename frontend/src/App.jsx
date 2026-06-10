import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import {
  Activity,
  TrendingUp,
  DollarSign,
  Layers,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowUpDown,
  User,
  Zap,
  Globe,
  LayoutDashboard,
  SlidersHorizontal,
  Plus,
  Trash2,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Settings,
  Flame,
  Glasses,
  Circle,
  Bell,
  List,
  History,
  LineChart,
  Shield,
  LogOut,
  Database,
  BarChart2,
  Gem,
  Bot,
  Sliders
} from 'lucide-react';

const DEFAULT_SUBSCRIBED = [
  { symbol: 'SPX', name: 'S&P 500 Index', secType: 'IND', exchange: 'CBOE', conId: 3182352 },
  { symbol: 'DJI', name: 'Dow Jones Industrial Average', secType: 'IND', exchange: 'CBOE', conId: 18053702 },
  { symbol: 'AAPL', name: 'Apple Inc.', secType: 'STK', exchange: 'SMART', conId: 265598 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', secType: 'STK', exchange: 'SMART', conId: 4815758 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', secType: 'STK', exchange: 'SMART', conId: 272093 },
  { symbol: 'META', name: 'Meta Platforms, Inc.', secType: 'STK', exchange: 'SMART', conId: 107113386 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', secType: 'STK', exchange: 'SMART', conId: 208781907 },
  { symbol: 'TSLA', name: 'Tesla, Inc.', secType: 'STK', exchange: 'SMART', conId: 76792991 },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', secType: 'STK', exchange: 'SMART', conId: 3691937 },
  { symbol: 'NFLX', name: 'Netflix, Inc.', secType: 'STK', exchange: 'SMART', conId: 8272386 },
  { symbol: 'COIN', name: 'Coinbase Global, Inc.', secType: 'STK', exchange: 'SMART', conId: 479361661 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', secType: 'STK', exchange: 'SMART', conId: 651636257 },
  { symbol: 'CVNA', name: 'Carvana Co.', secType: 'STK', exchange: 'SMART', conId: 274102927 },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', secType: 'STK', exchange: 'SMART', conId: 443831637 },
  { symbol: 'MSTR', name: 'MicroStrategy Incorporated', secType: 'STK', exchange: 'SMART', conId: 423610 },
  { symbol: 'BTCUSD', name: 'Bitcoin / USD', secType: 'CASH', exchange: 'PAXOS', conId: 474756186 },
  { symbol: 'SNOW', name: 'Snowflake Inc.', secType: 'STK', exchange: 'SMART', conId: 442526569 },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings, Inc.', secType: 'STK', exchange: 'SMART', conId: 369234857 },
  { symbol: 'ORCL', name: 'Oracle Corporation', secType: 'STK', exchange: 'SMART', conId: 273036 },
  { symbol: 'BABA', name: 'Alibaba Group Holding Limited', secType: 'STK', exchange: 'SMART', conId: 166090175 }
];

const INITIAL_PRICES = {
  SPX: { price: 7424.48, changePct: 0.55, direction: 'up', change: 40.75 },
  DJI: { price: 50821.83, changePct: -0.09, direction: 'down', change: -44.96 },
  AAPL: { price: 305.13, changePct: -0.72, direction: 'down', change: -2.21 },
  NVDA: { price: 208.94, changePct: 1.87, direction: 'up', change: 3.84 },
  MSFT: { price: 412.40, changePct: -1.02, direction: 'down', change: -4.27 },
  META: { price: 587.49, changePct: -0.93, direction: 'down', change: -5.51 },
  GOOGL: { price: 363.72, changePct: -1.31, direction: 'down', change: -4.81 },
  TSLA: { price: 410.70, changePct: 5.04, direction: 'up', change: 19.70 },
  AMZN: { price: 243.99, changePct: -0.83, direction: 'down', change: -2.04 },
  NFLX: { price: 82.47, changePct: 0.35, direction: 'up', change: 0.29 },
  COIN: { price: 163.45, changePct: 7.25, direction: 'up', change: 11.05 },
  AVGO: { price: 394.53, changePct: 2.28, direction: 'up', change: 8.80 },
  CVNA: { price: 69.61, changePct: 4.66, direction: 'up', change: 3.10 },
  PLTR: { price: 136.14, changePct: 0.45, direction: 'up', change: 0.61 },
  MSTR: { price: 127.88, changePct: 6.18, direction: 'up', change: 7.44 },
  BTCUSD: { price: 63484.98, changePct: 0.24, direction: 'up', change: 151.97 },
  SNOW: { price: 241.95, changePct: 1.55, direction: 'up', change: 3.69 },
  CRWD: { price: 659.03, changePct: -1.79, direction: 'down', change: -11.99 },
  ORCL: { price: 213.12, changePct: -0.26, direction: 'down', change: -0.56 },
  BABA: { price: 120.25, changePct: -0.67, direction: 'down', change: -0.81 }
};

const getSymbolType = (symbol) => {
  if (!symbol) return 'STOCK';
  const sym = symbol.toUpperCase();
  if (sym.startsWith('/')) return 'FUT';
  if (sym === 'SPX' || sym === 'NDX' || sym === 'COMP' || sym === 'DJI') return 'IND';
  if (sym.endsWith('JPY') || sym.length === 6) return 'CASH';
  return 'STOCK';
};

const formatSpikeTime = (dateObj) => {
  if (!dateObj) return '---';
  try {
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return String(dateObj);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    return formatter.format(d);
  } catch (e) {
    return '---';
  }
};

const getWatchLevelBadgeStyle = (level) => {
  const lvl = String(level).toUpperCase().trim();
  switch (lvl) {
    case 'FUTURES LEAD':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'var(--green-bg)',
        color: 'var(--green)',
        border: '1px solid rgba(34, 232, 122, 0.3)',
        fontFamily: 'var(--font-heading)'
      };
    case 'INDEX WATCH':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'var(--blue-bg)',
        color: 'var(--blue)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        fontFamily: 'var(--font-heading)'
      };
    case 'STOCK WATCH':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'var(--orange-bg)',
        color: 'var(--orange)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        fontFamily: 'var(--font-heading)'
      };
    default:
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(255, 255, 255, 0.05)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-heading)'
      };
  }
};

const getActionBadgeStyle = (action) => {
  const act = String(action).toUpperCase().trim();
  switch (act) {
    case 'STRONG BUY':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'var(--green-bg)',
        color: 'var(--green)',
        border: '1px solid rgba(34, 232, 122, 0.35)',
        fontFamily: 'var(--font-heading)'
      };
    case 'BUY':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(34, 232, 122, 0.08)',
        color: 'var(--green)',
        fontFamily: 'var(--font-heading)'
      };
    case 'STRONG SELL':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'var(--red-bg)',
        color: 'var(--red)',
        border: '1px solid rgba(245, 101, 81, 0.35)',
        fontFamily: 'var(--font-heading)'
      };
    case 'SELL':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(245, 101, 81, 0.08)',
        color: 'var(--red)',
        fontFamily: 'var(--font-heading)'
      };
    default:
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(255, 255, 255, 0.05)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-heading)'
      };
  }
};

const getQualityBadgeStyle = (quality) => {
  const q = String(quality).toUpperCase().trim();
  switch (q) {
    case 'A+':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(245, 158, 11, 0.12)',
        color: '#f59e42',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        fontFamily: 'var(--font-heading)'
      };
    case 'A':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(16, 185, 129, 0.10)',
        color: 'var(--green)',
        fontFamily: 'var(--font-heading)'
      };
    case 'B':
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(59, 130, 246, 0.10)',
        color: 'var(--blue)',
        fontFamily: 'var(--font-heading)'
      };
    default:
      return {
        fontWeight: 800, fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
        background: 'rgba(255, 255, 255, 0.04)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-heading)'
      };
  }
};

const renderStatus = (status) => {
  const stat = String(status || 'WATCH').toUpperCase().trim();
  switch (stat) {
    case 'HOT':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--red)', fontWeight: '800', fontSize: '0.72rem', fontFamily: 'var(--font-heading)' }}>
          <Flame size={12} fill="var(--red)" style={{ display: 'inline-block' }} />
          {stat}
        </span>
      );
    case 'WATCH':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--blue)', fontWeight: '800', fontSize: '0.72rem', fontFamily: 'var(--font-heading)' }}>
          <Zap size={12} fill="var(--blue)" style={{ display: 'inline-block' }} />
          {stat}
        </span>
      );
    case 'EARLY':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--orange)', fontWeight: '800', fontSize: '0.72rem', fontFamily: 'var(--font-heading)' }}>
          <Glasses size={12} style={{ display: 'inline-block' }} />
          {stat}
        </span>
      );
    default:
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontWeight: '800', fontSize: '0.72rem', fontFamily: 'var(--font-heading)' }}>
          <Circle size={12} style={{ display: 'inline-block', opacity: 0.5 }} />
          {stat}
        </span>
      );
  }
};

export default function App() {
  // Authentication states
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
  const [authUsername, setAuthUsername] = useState(() => localStorage.getItem('auth_username') || '');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [activeSymbol, setActiveSymbol] = useState('SPX');
  const [timeframe, setTimeframe] = useState('1s');

  // Pre-Spike Watchlist & Alerts dashboard states
  const [selectedSymbolFilter, setSelectedSymbolFilter] = useState('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');
  const [watchlistTimeframe, setWatchlistTimeframe] = useState('DAY');
  const [spikeAlertsTab, setSpikeAlertsTab] = useState('ALL');

  const [preSpikeWatchlist, setPreSpikeWatchlist] = useState([]);
  const [priceSpikeAlerts, setPriceSpikeAlerts] = useState([]);

  const [watchlistPage, setWatchlistPage] = useState(1);
  const [watchlistPageSize, setWatchlistPageSize] = useState(10);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsPageSize, setAlertsPageSize] = useState(10);


  const handleNewAlert = (symbol, price) => {
    const secType = getSymbolType(symbol);
    const timestamp = new Date();

    const roll = Math.random();
    if (roll < 0.08) {
      // Add to Pre-Spike Watchlist
      const signalType = secType === 'FUT' ? 'FUTURES LEAD' : secType === 'IND' ? 'INDEX WATCH' : 'STOCK WATCH';
      const setups = [
        'Bullish Order Flow', 'Volume Surge', 'VWAP Support Bounce',
        'EMA Crossover', 'Resistance Breakout', 'Accumulation Block'
      ];
      const statuses = ['HOT', 'WATCH', 'EARLY'];

      const newEntry = {
        timestamp,
        symbol,
        price,
        signalType,
        setup: setups[Math.floor(Math.random() * setups.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        secType
      };

      setPreSpikeWatchlist(prev => [newEntry, ...prev].slice(0, 100));
    } else if (roll > 0.92) {
      // Add to Price Spike Alerts
      const actions = ['STRONG BUY', 'BUY', 'STRONG SELL', 'SELL', 'HOLD'];
      const qualities = ['A+', 'A', 'B', 'C'];
      const setups = [
        '1.5M Vol Spike', 'Channel Breakout', 'VWAP Breakdown',
        'Momentum Bounce', 'Squeeze Fire', 'Liquidity Sweep'
      ];

      const newEntry = {
        timestamp,
        symbol,
        price,
        action: actions[Math.floor(Math.random() * actions.length)],
        quality: qualities[Math.floor(Math.random() * qualities.length)],
        setup: setups[Math.floor(Math.random() * setups.length)],
        secType
      };

      setPriceSpikeAlerts(prev => [newEntry, ...prev].slice(0, 100));
    }
  };

  // Theme and UI layout state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme_mode');
    return saved ? saved === 'dark' : true;
  });
  const [tickStreamActive, setTickStreamActive] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Persist sidebar collapse preference
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  // Global today's tick count (shared across all users, fetched from ClickHouse)
  const [totalTicksCount, setTotalTicksCount] = useState(0);

  const [digitalClockTime, setDigitalClockTime] = useState('');

  // Subscriptions persisted in localStorage
  const [subscribedInstruments, setSubscribedInstruments] = useState(() => {
    const saved = localStorage.getItem('subscribed_instruments');
    return saved ? JSON.parse(saved) : DEFAULT_SUBSCRIBED;
  });

  const [gatewayStatus, setGatewayStatus] = useState({ connected: false, host: '', port: null });
  const [account, setAccount] = useState({ netLiquidation: 0, cashBalance: 0, buyingPower: 0, currency: 'USD' });
  const [userProfile, setUserProfile] = useState({
    traderName: localStorage.getItem('auth_username') || 'Gkmadhav007',
    accountId: 'DUQ450322',
    accountType: 'INDIVIDUAL',
    tradingMode: 'PAPER',
    clientId: 1
  });

  // Real-time tick data initialized to match existing screenshot values
  const [livePrices, setLivePrices] = useState(INITIAL_PRICES);

  // Active symbol tick details & logs
  const [liveTick, setLiveTick] = useState({ last: null, bid: null, ask: null, spread: null, time: null, prevBid: null });
  const [recentTicks, setRecentTicks] = useState([]);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [isChartReady, setIsChartReady] = useState(false);
  const [chartError, setChartError] = useState(null);

  // Latency & Market Info
  const [marketHours, setMarketHours] = useState(null);
  const [tickLatency, setTickLatency] = useState(45); // default mock latency matching screenshot

  // Search States
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchSecType, setSearchSecType] = useState('STK');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchSuccess, setSearchSuccess] = useState(null);
  const [instrumentFilter, setInstrumentFilter] = useState('ALL');

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);

  const tickWsRef = useRef(null);
  const barWsRef = useRef(null);
  const currentBarRef = useRef(null);

  // Direct DOM refs for zero-latency live price displays (bypass React re-render)
  const livePriceRef = useRef(null);
  const liveChangeRef = useRef(null);
  const livePctRef = useRef(null);
  const liveTimeRef = useRef(null);
  const liveLatRef = useRef(null);
  const prevPriceRef = useRef(null);
  const openPriceRef = useRef(null);

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const isLocalDev = import.meta.env.DEV &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const restUrl = isLocalDev ? 'http://localhost:8000/api' : '/api';
  const wsUrl = isLocalDev
    ? 'ws://localhost:8000/api/ws'
    : `${wsProtocol}//${window.location.host}/api/ws`;

  // Persist subscriptions to localStorage
  useEffect(() => {
    localStorage.setItem('subscribed_instruments', JSON.stringify(subscribedInstruments));
  }, [subscribedInstruments]);

  // Persist sidebar collapsed status
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed ? 'true' : 'false');
  }, [sidebarCollapsed]);

  // Pre-Spike pagination resets on filter updates
  useEffect(() => {
    setWatchlistPage(1);
  }, [selectedSymbolFilter, selectedTypeFilter, watchlistTimeframe]);

  useEffect(() => {
    setAlertsPage(1);
  }, [selectedSymbolFilter, selectedTypeFilter, spikeAlertsTab]);

  // Pre-populate initial mock data for tables
  useEffect(() => {
    const initialWatchlist = [];
    const initialAlerts = [];
    const symbols = ['AAPL', 'TSLA', 'MSFT', 'NVDA', 'SPY', 'SPX', '/ES', '/NQ'];

    // Watchlist
    for (let i = 0; i < 25; i++) {
      const sym = symbols[Math.floor(Math.random() * symbols.length)];
      const secType = getSymbolType(sym);
      const price = INITIAL_PRICES[sym]?.price || (secType === 'FUT' ? 5410.50 : 250.75);
      const signalType = secType === 'FUT' ? 'FUTURES LEAD' : secType === 'IND' ? 'INDEX WATCH' : 'STOCK WATCH';
      const setups = ['Bullish Order Flow', 'Volume Surge', 'VWAP Support Bounce', 'EMA Crossover', 'Resistance Breakout', 'Accumulation Block'];
      const statuses = ['HOT', 'WATCH', 'EARLY'];
      const ageSecs = i * 180 + Math.floor(Math.random() * 60);
      const timestamp = new Date(Date.now() - ageSecs * 1000);

      initialWatchlist.push({
        timestamp,
        symbol: sym,
        price,
        signalType,
        setup: setups[Math.floor(Math.random() * setups.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        secType
      });
    }

    // Alerts
    for (let i = 0; i < 25; i++) {
      const sym = symbols[Math.floor(Math.random() * symbols.length)];
      const secType = getSymbolType(sym);
      const price = INITIAL_PRICES[sym]?.price || (secType === 'FUT' ? 5410.50 : 250.75);
      const actions = ['STRONG BUY', 'BUY', 'STRONG SELL', 'SELL', 'HOLD'];
      const qualities = ['A+', 'A', 'B', 'C'];
      const setups = ['1.5M Vol Spike', 'Channel Breakout', 'VWAP Breakdown', 'Momentum Bounce', 'Squeeze Fire', 'Liquidity Sweep'];
      const ageSecs = i * 220 + Math.floor(Math.random() * 90);
      const timestamp = new Date(Date.now() - ageSecs * 1000);

      initialAlerts.push({
        timestamp,
        symbol: sym,
        price,
        action: actions[Math.floor(Math.random() * actions.length)],
        quality: qualities[Math.floor(Math.random() * qualities.length)],
        setup: setups[Math.floor(Math.random() * setups.length)],
        secType
      });
    }

    setPreSpikeWatchlist(initialWatchlist);
    setPriceSpikeAlerts(initialAlerts);
  }, []);

  // Poll global today-ticks count from backend (same for every user)
  useEffect(() => {
    const fetchTodayTicks = async () => {
      try {
        const res = await fetch(`${restUrl}/stats/today-ticks`);
        if (res.ok) {
          const data = await res.json();
          setTotalTicksCount(data.count ?? 0);
        }
      } catch {
        // keep last known count on transient errors
      }
    };
    fetchTodayTicks();
    const interval = setInterval(fetchTodayTicks, 3000);
    return () => clearInterval(interval);
  }, [restUrl]);

  // Apply light/dark theme class and adjust chart theme options
  useEffect(() => {
    localStorage.setItem('theme_mode', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }

    if (chartRef.current) {
      chartRef.current.applyOptions({
        layout: {
          background: { color: isDarkMode ? '#090d1f' : '#ffffff' },
          textColor: isDarkMode ? '#94a3b8' : '#475569',
        },
        grid: {
          vertLines: { color: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.04)' },
          horzLines: { color: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.04)' },
        }
      });
    }
  }, [isDarkMode]);

  // Update Clock — Eastern Time (ET)
  useEffect(() => {
    const updateClock = () => {
      const timeStr = new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).toLowerCase();
      setDigitalClockTime(timeStr + ' ET');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Global error logger
  useEffect(() => {
    const handleGlobalError = (event) => {
      fetch(`${restUrl}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: event.message || String(event), stack: event.error?.stack || '' })
      }).catch(err => console.error('Failed to log to server:', err));
    };
    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, []);

  // 1. Poll Gateway Status and Account Summary
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${restUrl}/status`);
        const data = await res.json();
        setGatewayStatus(data);
      } catch (err) {
        setGatewayStatus({ connected: false, host: '', port: null });
      }
    };

    const fetchAccount = async () => {
      try {
        const res = await fetch(`${restUrl}/account`);
        const data = await res.json();
        if (data && !data.error) {
          setAccount({
            netLiquidation: parseFloat(data.NetLiquidation || 0),
            cashBalance: parseFloat(data.TotalCashValue || 0),
            buyingPower: parseFloat(data.BuyingPower || 0),
            currency: data.Currency || 'USD'
          });
        }
      } catch (err) {
        console.error('Failed to fetch account info:', err);
      }
    };

    fetchStatus();
    fetchAccount();
    setLoading(false);

    const interval = setInterval(() => {
      fetchStatus();
      fetchAccount();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Poll Market Hours
  useEffect(() => {
    const fetchMarketHours = async () => {
      try {
        const res = await fetch(`${restUrl}/market-hours`);
        const data = await res.json();
        setMarketHours(data);
      } catch (err) {
        console.error('Failed to fetch market hours:', err);
      }
    };
    fetchMarketHours();
    const mhInterval = setInterval(fetchMarketHours, 10000);
    return () => clearInterval(mhInterval);
  }, []);

  // 2. Initialize Lightweight Chart
  useEffect(() => {
    if (loading || currentPage !== 'chart' || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: isDarkMode ? '#090d1f' : '#ffffff' },
        textColor: isDarkMode ? '#94a3b8' : '#475569',
        fontSize: 11,
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.04)' },
        horzLines: { color: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.04)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#c8b89a', width: 1, style: 3 },
        horzLine: { color: '#c8b89a', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.08)',
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    setIsChartReady(true);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      setIsChartReady(false);
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [loading, currentPage]);

  // 3. Load Historical Data and Stream WebSockets on Symbol / Timeframe Change
  useEffect(() => {
    if (!isChartReady || !candleSeriesRef.current || currentPage !== 'chart') return;

    const loadDataAndStream = async () => {
      setChartLoading(true);

      // Close active bar connection
      if (barWsRef.current) barWsRef.current.close();

      // Reset live tick states
      setLiveTick({ last: null, bid: null, ask: null, spread: null, time: null, prevBid: null });
      setRecentTicks([]);
      currentBarRef.current = null;
      prevPriceRef.current = null;

      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData([]);
      }

      setChartError(null);

      // Fetch historical candles
      try {
        const res = await fetch(`${restUrl}/candles?symbol=${activeSymbol}&timeframe=${timeframe}`);
        const historicalData = await res.json();

        if (historicalData && historicalData.error) {
          setChartError(historicalData.error);
        } else if (Array.isArray(historicalData)) {
          if (historicalData.length > 0) {
            candleSeriesRef.current.setData(historicalData);
            const lastBar = historicalData[historicalData.length - 1];
            currentBarRef.current = {
              time: lastBar.time,
              open: lastBar.open,
              high: lastBar.high,
              low: lastBar.low,
              close: lastBar.close
            };
            openPriceRef.current = lastBar.close;
          } else {
            setChartError("No historical data returned. Ensure the symbol is correct.");
          }
        }
      } catch (err) {
        console.error('Failed to load historical candles:', err);
        setChartError("Network error: Failed to connect to the backend server.");
      }

      // Start Bar stream
      startBarStream(activeSymbol);
      setChartLoading(false);
    };

    loadDataAndStream();

    return () => {
      if (barWsRef.current) barWsRef.current.close();
    };
  }, [activeSymbol, timeframe, isChartReady, currentPage]);

  // 4. WebSocket Tick Stream for ALL Subscribed Instruments
  useEffect(() => {
    if (loading) return;
    if (!tickStreamActive) {
      if (tickWsRef.current) {
        tickWsRef.current.close();
        tickWsRef.current = null;
      }
      return;
    }

    const symbolsCsv = subscribedInstruments.map(inst => inst.symbol).join(',');
    if (!symbolsCsv) return;

    const connectTickStream = () => {
      if (tickWsRef.current) tickWsRef.current.close();

      const ws = new WebSocket(`${wsUrl}/ticks?symbols=${symbolsCsv}`);
      tickWsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error || !data.symbol) return;

        const sym = data.symbol;
        const bid = parseFloat(data.bid);
        const ask = parseFloat(data.ask);
        const last = parseFloat(data.last);
        const close = parseFloat(data.close);

        const hasBidAsk = !isNaN(bid) && !isNaN(ask);
        const hasLast = !isNaN(last);
        const price = hasLast && last > 0 ? last : hasBidAsk ? (bid + ask) / 2 : null;

        if (price !== null) {
          // Trigger mock live alerts
          handleNewAlert(sym, price);

          // Update livePrices mapping
          setLivePrices(prev => {
            const prevData = prev[sym] || {};
            const prevPrice = prevData.price;
            const direction = prevPrice != null ? (price > prevPrice ? 'up' : price < prevPrice ? 'down' : prevData.direction) : '';
            const refPrice = close > 0 ? close : (prevData.referencePrice || price);
            const change = price - refPrice;
            const changePct = refPrice > 0 ? (change / refPrice) * 100 : 0;

            return {
              ...prev,
              [sym]: {
                price,
                prevPrice,
                change,
                changePct,
                direction,
                bid: hasBidAsk ? bid : prevData.bid,
                ask: hasBidAsk ? ask : prevData.ask,
                volume: data.volume || prevData.volume,
                time: new Date().toLocaleTimeString(),
                referencePrice: refPrice
              }
            };
          });
        }

        // Zero-latency updates for active symbol
        if (sym === activeSymbol && price !== null) {
          if (livePriceRef.current) {
            const prev = prevPriceRef.current;
            const ref = close > 0 ? close : (openPriceRef.current || price);
            const isFx = sym.length === 6;
            const decimals = isFx ? (sym.endsWith('JPY') ? 3 : 5) : 2;
            const priceStr = price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

            const dir = prev != null ? (price > prev ? 'up' : price < prev ? 'down' : '') : '';
            if (dir) {
              livePriceRef.current.classList.remove('price-flash-up', 'price-flash-down');
              void livePriceRef.current.offsetWidth; // Force Reflow
              livePriceRef.current.classList.add(dir === 'up' ? 'price-flash-up' : 'price-flash-down');
            }
            livePriceRef.current.textContent = priceStr;
            prevPriceRef.current = price;

            if (ref && liveChangeRef.current && livePctRef.current) {
              const chg = price - ref;
              const chgPct = (chg / ref) * 100;
              const color = chg >= 0 ? 'var(--green)' : 'var(--red)';
              const sign = chg >= 0 ? '+' : '';
              liveChangeRef.current.textContent = `${sign}${chg.toFixed(decimals)}`;
              liveChangeRef.current.style.color = color;
              livePctRef.current.textContent = `${sign}${chgPct.toFixed(2)}%`;
              livePctRef.current.style.color = color;
            }

            if (liveTimeRef.current) {
              const hm = new Date().toLocaleTimeString('en-US', {
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              });
              liveTimeRef.current.textContent = `As of today at ${hm} ET`;
            }

            if (data.timestamp && liveLatRef.current) {
              const latMs = Date.now() - new Date(data.timestamp).getTime();
              if (latMs >= 0 && latMs < 60000) {
                liveLatRef.current.textContent = `${latMs}ms`;
                liveLatRef.current.style.color = latMs < 500 ? 'var(--green)' : latMs < 2000 ? 'var(--orange)' : 'var(--red)';
                setTickLatency(latMs);
              }
            }
          }

          if (hasBidAsk || hasLast) {
            let spreadStr = '---';
            if (hasBidAsk) {
              const diff = ask - bid;
              spreadStr = sym.length === 6
                ? `${(diff / (sym.endsWith('JPY') ? 0.01 : 0.0001)).toFixed(1)} pips`
                : `${diff.toFixed(2)} pts`;
            }
            setLiveTick(prev => ({
              bid: hasBidAsk ? bid : prev.bid,
              ask: hasBidAsk ? ask : prev.ask,
              last: hasLast ? last : prev.last,
              spread: spreadStr,
              time: new Date().toLocaleTimeString(),
              prevBid: prev.bid
            }));
            setRecentTicks(prev => {
              const direction = prev.length > 0 && price > (prev[0].last || prev[0].bid || 0) ? 'up' : 'down';
              return [{ time: new Date().toLocaleTimeString(), bid: hasBidAsk ? bid : null, ask: hasBidAsk ? ask : null, last: hasLast ? last : null, spread: spreadStr, direction }, ...prev.slice(0, 9)];
            });
          }
        }

        // Push price update into the local bars
        if (sym === activeSymbol && price !== null && candleSeriesRef.current) {
          const unixTime = Math.floor(Date.now() / 1000);
          let divisor = 60;
          if (timeframe === '1s') divisor = 1;
          else if (timeframe === '5s') divisor = 5;
          else if (timeframe === '5m') divisor = 300;
          else if (timeframe === '1d') divisor = 86400;
          const timestamp = Math.floor(unixTime / divisor) * divisor;
          if (currentBarRef.current) {
            if (timestamp === currentBarRef.current.time) {
              currentBarRef.current.high = Math.max(currentBarRef.current.high, price);
              currentBarRef.current.low = Math.min(currentBarRef.current.low, price);
              currentBarRef.current.close = price;
            } else if (timestamp > currentBarRef.current.time) {
              currentBarRef.current = { time: timestamp, open: price, high: price, low: price, close: price };
            }
          } else {
            currentBarRef.current = { time: timestamp, open: price, high: price, low: price, close: price };
          }
          candleSeriesRef.current.update(currentBarRef.current);
        }
      };

      ws.onclose = () => {
        console.log(`Ticks WS stream closed`);
        setTimeout(() => {
          if (tickWsRef.current === ws && tickStreamActive) connectTickStream();
        }, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connectTickStream();

    return () => {
      if (tickWsRef.current) {
        tickWsRef.current.close();
        tickWsRef.current = null;
      }
    };
  }, [subscribedInstruments, loading, activeSymbol, tickStreamActive]);

  // WebSocket Live 5-Second Bar Stream
  const startBarStream = (symbol) => {
    const ws = new WebSocket(`${wsUrl}/bars?symbol=${symbol}`);
    barWsRef.current = ws;

    ws.onmessage = (event) => {
      const bar = JSON.parse(event.data);
      if (bar.error || !candleSeriesRef.current) return;

      const unixTime = Date.parse(bar.time) / 1000;
      let divisor = 60;
      if (timeframe === '1s') divisor = 1;
      else if (timeframe === '5s') divisor = 5;
      else if (timeframe === '1m') divisor = 60;
      else if (timeframe === '5m') divisor = 300;
      else if (timeframe === '1d') divisor = 86400;

      const timestamp = Math.floor(unixTime / divisor) * divisor;

      if (currentBarRef.current) {
        if (timestamp === currentBarRef.current.time) {
          currentBarRef.current.high = Math.max(currentBarRef.current.high, bar.high);
          currentBarRef.current.low = Math.min(currentBarRef.current.low, bar.low);
          currentBarRef.current.close = bar.close;
        } else if (timestamp > currentBarRef.current.time) {
          currentBarRef.current = {
            time: timestamp,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close
          };
        }
        candleSeriesRef.current.update(currentBarRef.current);
      } else {
        currentBarRef.current = {
          time: timestamp,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close
        };
        candleSeriesRef.current.update(currentBarRef.current);
      }
    };

    ws.onclose = () => console.log(`Bar WS closed`);
    ws.onerror = () => ws.close();
  };

  // Submit registration/login payload to backend Auth Router
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Username and password are required.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");

    const endpoint = authMode === 'login' ? 'login' : 'register';
    try {
      const res = await fetch(`${restUrl}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.detail || "Authentication failed.");
      } else {
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('auth_username', data.username);
        setToken(data.access_token);
        setUserProfile(prev => ({ ...prev, traderName: data.username }));
        setAuthPassword('');
        setAuthError('');
      }
    } catch (err) {
      setAuthError("Server connection failed. Make sure backend is running.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Instruments Page: Search & Add
  const handleAddInstrument = async (e) => {
    e.preventDefault();
    if (!searchSymbol.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchSuccess(null);

    const querySymbol = searchSymbol.trim().toUpperCase();

    try {
      // 1. Get instrument specs via Gateway search
      const res = await fetch(`${restUrl}/instruments/search?symbol=${querySymbol}&sec_type=${searchSecType}`);
      const data = await res.json();

      if (data.error) {
        setSearchError(data.error);
      } else {
        const exists = subscribedInstruments.some(inst => inst.symbol === data.symbol);
        if (exists) {
          setSearchError(`Symbol ${data.symbol} is already subscribed.`);
        } else {
          // 2. Publish to backend Auth/Subscription Pipeline via Kafka
          const subRes = await fetch(`${restUrl}/market/subscribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              con_id: data.conId,
              symbol: data.symbol
            })
          });

          if (!subRes.ok) {
            const errData = await subRes.json();
            throw new Error(errData.detail || "Pipeline subscription failed");
          }

          setSubscribedInstruments(prev => [...prev, data]);
          setSearchSuccess(`Successfully subscribed to ${data.symbol} (${data.name}).`);
          setSearchSymbol('');
        }
      }
    } catch (err) {
      setSearchError(err.message || "Failed to communicate with IB API Gateway.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRemoveInstrument = async (symbolToRemove) => {
    if (activeSymbol === symbolToRemove) {
      setActiveSymbol('SPX');
    }

    const inst = subscribedInstruments.find(i => i.symbol === symbolToRemove);
    if (inst) {
      try {
        await fetch(`${restUrl}/market/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            con_id: inst.conId,
            symbol: inst.symbol
          })
        });
      } catch (err) {
        console.error('Failed to notify backend of unsubscription:', err);
      }
    }

    setSubscribedInstruments(prev => prev.filter(inst => inst.symbol !== symbolToRemove));
  };

  const formatQuote = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '---';
    if (activeSymbol.length === 6) {
      return activeSymbol.endsWith('JPY') ? val.toFixed(3) : val.toFixed(5);
    }
    return val.toFixed(2);
  };

  const formatTilePrice = (symbol, val) => {
    if (val === null || val === undefined || isNaN(val)) return '---';
    if (symbol.length === 6) {
      return symbol.endsWith('JPY') ? val.toFixed(3) : val.toFixed(5);
    }
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getBadgeClass = (secType) => {
    switch (secType?.toUpperCase()) {
      case 'STK': return 'badge badge-stk';
      case 'IND': return 'badge badge-ind';
      case 'FUT': return 'badge badge-fut';
      case 'CASH': return 'badge badge-cash';
      default: return 'badge';
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  if (!token) {
    return (
      <div className="auth-container">
        <div className="noise-film" />

        {/* Decorative glass glow shapes */}
        <div style={{
          position: 'absolute',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200, 184, 154, 0.08) 0%, transparent 70%)',
          top: '20%',
          left: '15%',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)',
          bottom: '10%',
          right: '10%',
          pointerEvents: 'none'
        }} />

        <div className="auth-card">
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
            <Activity style={{ color: 'var(--accent-primary)', width: '36px', height: '36px' }} />
            <div style={{ textAlign: 'left' }}>
              <span style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', letterSpacing: '0.5px', display: 'block', lineHeight: 1 }}>
                SpikeIQ
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '1px', display: 'block', marginTop: '2px' }}>
                US ANALYTICS
              </span>
            </div>
          </div>

          <h2 className="auth-title">
            {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="auth-subtitle">
            {authMode === 'login'
              ? 'Sign in to access your high-frequency analytics terminal'
              : 'Register to start tracking NYSE, NASDAQ and CBOE market ticks'}
          </p>

          {authError && (
            <div className="auth-error">
              <AlertCircle style={{ color: 'var(--red)', width: '16px', height: '16px', display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
              <span style={{ verticalAlign: 'middle' }}>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit}>
            <div className="auth-input-group">
              <label className="auth-label">Username</label>
              <input
                type="text"
                className="auth-input"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                placeholder="Enter trader name"
                required
              />
            </div>

            <div className="auth-input-group" style={{ marginBottom: '32px' }}>
              <label className="auth-label">Password</label>
              <input
                type="password"
                className="auth-input"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" className="auth-btn" disabled={authLoading}>
              {authLoading ? (
                <RefreshCw style={{ animation: 'spin 1.5s linear infinite', width: '18px', height: '18px', margin: '0 auto' }} />
              ) : (
                authMode === 'login' ? 'Connect Terminal' : 'Register & Connect'
              )}
            </button>
          </form>

          <p className="auth-toggle-text">
            {authMode === 'login' ? "Don't have an account? " : "Already registered? "}
            <span
              className="auth-toggle-link"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setAuthError('');
              }}
            >
              {authMode === 'login' ? 'Register here' : 'Sign in here'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-scene)' }}>
        <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-primary)', width: '32px', height: '32px' }} />
      </div>
    );
  }


  // Filtered Instruments list
  const filteredInstruments = subscribedInstruments.filter(inst => {
    if (instrumentFilter === 'ALL') return true;
    if (instrumentFilter === 'STOCKS') return inst.secType === 'STK';
    if (instrumentFilter === 'INDICES') return inst.secType === 'IND';
    if (instrumentFilter === 'FUTURES') return inst.secType === 'FUT';
    if (instrumentFilter === 'FOREX') return inst.secType === 'CASH';
    return true;
  });

  const filteredWatchlist = preSpikeWatchlist.filter(item => {
    if (selectedSymbolFilter !== 'ALL' && item.symbol !== selectedSymbolFilter) return false;

    const secType = getSymbolType(item.symbol);
    if (selectedTypeFilter !== 'ALL') {
      if (selectedTypeFilter === 'FUTURES' && secType !== 'FUT') return false;
      if (selectedTypeFilter === 'INDEX' && secType !== 'IND') return false;
      if (selectedTypeFilter === 'STOCK' && secType !== 'STOCK') return false;
    }
    return true;
  });

  const filteredAlerts = priceSpikeAlerts.filter(item => {
    if (selectedSymbolFilter !== 'ALL' && item.symbol !== selectedSymbolFilter) return false;

    const secType = getSymbolType(item.symbol);
    if (selectedTypeFilter !== 'ALL') {
      if (selectedTypeFilter === 'FUTURES' && secType !== 'FUT') return false;
      if (selectedTypeFilter === 'INDEX' && secType !== 'IND') return false;
      if (selectedTypeFilter === 'STOCK' && secType !== 'STOCK') return false;
    }

    if (spikeAlertsTab !== 'ALL') {
      if (item.action !== spikeAlertsTab) return false;
    }
    return true;
  });

  const paginatedWatchlist = filteredWatchlist.slice(
    (watchlistPage - 1) * watchlistPageSize,
    watchlistPage * watchlistPageSize
  );

  const paginatedAlerts = filteredAlerts.slice(
    (alertsPage - 1) * alertsPageSize,
    alertsPage * alertsPageSize
  );

  const totalWatchlistPages = Math.max(1, Math.ceil(filteredWatchlist.length / watchlistPageSize));
  const totalAlertsPages = Math.max(1, Math.ceil(filteredAlerts.length / alertsPageSize));

  const futuresLeadsCount = preSpikeWatchlist.filter(item => getSymbolType(item.symbol) === 'FUT').length;
  const indexWatchesCount = preSpikeWatchlist.filter(item => getSymbolType(item.symbol) === 'IND').length;
  const stockWatchesCount = preSpikeWatchlist.filter(item => getSymbolType(item.symbol) === 'STOCK').length;
  const activeSpikesCount = priceSpikeAlerts.filter(item => item.action.includes('BUY') || item.action.includes('SELL')).length;

  // Fallback defaults to match screenshot
  const netLiquidationVal = account.netLiquidation > 0 ? account.netLiquidation : 1000943.90;
  const buyingPowerVal = account.buyingPower > 0 ? account.buyingPower : 4002402.40;

  return (
    <div className="app-layout">
      {/* Texture Layer */}
      <div className="noise-film" />

      {/* LEFT SIDEBAR NAVIGATION */}
      <Sidebar
        isAdmin={false}
        isMobileOpen={mobileSidebarOpen}
        setIsMobileOpen={setMobileSidebarOpen}
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        userProfile={userProfile}
        onLogout={() => {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_username');
          setToken(null);
        }}
      />

      {/* MAIN CONTENT AREA */}
      <div className="main-content">

        {/* NEW ALWAYS-VISIBLE STATUS BAR (Matching reference image header) */}
        <header className="top-status-bar">

          <div className="status-bar-left">
            {/* Sidebar toggle button - shows LayoutGrid icon to reopen when collapsed */}
            <button
              className="mobile-menu-toggle sidebar-open-btn"
              onClick={() => {
                if (window.innerWidth <= 768) {
                  setMobileSidebarOpen(!mobileSidebarOpen);
                } else if (sidebarCollapsed) {
                  setSidebarCollapsed(false);
                } else {
                  setSidebarCollapsed(true);
                }
              }}
              title="Toggle Sidebar"
            >
              <Menu size={20} />
            </button>

            {/* Dynamic Market status badge */}
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '3px 10px',
              borderRadius: '9999px',
              fontFamily: 'var(--font-heading)',
              background: marketHours?.isOpen ? 'rgba(34, 232, 122, 0.08)' : 'rgba(245, 101, 81, 0.08)',
              color: marketHours?.isOpen ? 'var(--green)' : 'var(--red)',
              border: marketHours?.isOpen ? '1px solid rgba(34, 232, 122, 0.2)' : '1px solid rgba(245, 101, 81, 0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: marketHours?.isOpen ? 'var(--green)' : 'var(--red)',
                display: 'inline-block'
              }} className="pulsing-indicator" />
              {marketHours?.isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </span>
          </div>

          {/* Status chips and controls */}
          <div className="status-bar-center">
            {/* STREAM Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>STREAM:</span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--green)', display: 'inline-block' }} className="pulsing-indicator" />
                LIVE
              </span>
            </div>

            {/* GATEWAY Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>GATEWAY:</span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: gatewayStatus.connected ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: gatewayStatus.connected ? 'var(--green)' : 'var(--red)', display: 'inline-block' }} />
                {gatewayStatus.connected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            {/* TODAY TICKS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>TODAY TICKS:</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)', fontFamily: 'monospace' }}>
                {totalTicksCount.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Ticker stream switch */}
            <button
              onClick={() => setTickStreamActive(!tickStreamActive)}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${tickStreamActive ? 'rgba(34, 232, 122, 0.2)' : 'rgba(245, 101, 81, 0.2)'}`,
                color: tickStreamActive ? 'var(--green)' : 'var(--red)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <span style={{ fontSize: '8px' }}>{tickStreamActive ? '■' : '▶'}</span>
              {tickStreamActive ? 'Stop Tickers' : 'Start Tickers'}
            </button>
          </div>

          {/* Right side buttons & clock */}
          <div className="status-bar-right">
            {/* Theme switcher */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '3px 10px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                transition: 'var(--transition)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              {isDarkMode ? '☀ Light' : '☾ Dark'}
            </button>

            {/* Clock */}
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock style={{ width: '11px', height: '11px', color: 'var(--text-muted)' }} />
              <span>{digitalClockTime}</span>
            </div>
          </div>

        </header>

        {/* MAIN VIEWPORT CONTAINER */}
        <div className="main-viewport" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
          {currentPage === 'dashboard' && (
            <>
              {/* Controls Header Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    PRE-SPIKE WATCHLIST DASHBOARD
                  </h2>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Real-time market scanning and early alert triggers for US equities, indices, and futures
                  </p>
                </div>

                {/* Filters control block */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

                  {/* Symbol Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Symbol</span>
                    <select
                      value={selectedSymbolFilter}
                      onChange={(e) => setSelectedSymbolFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="ALL">ALL SYMBOLS</option>
                      {subscribedInstruments.map(inst => (
                        <option key={inst.symbol} value={inst.symbol}>{inst.symbol}</option>
                      ))}
                    </select>
                  </div>

                  {/* Type Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</span>
                    <select
                      value={selectedTypeFilter}
                      onChange={(e) => setSelectedTypeFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="ALL">ALL TYPES</option>
                      <option value="STOCK">STOCK</option>
                      <option value="FUTURES">FUTURES</option>
                      <option value="INDEX">INDEX</option>
                    </select>
                  </div>

                  {/* Timeframe Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Timeframe</span>
                    <select
                      value={watchlistTimeframe}
                      onChange={(e) => setWatchlistTimeframe(e.target.value)}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="15M">15m</option>
                      <option value="30M">30m</option>
                      <option value="45M">45m</option>
                      <option value="60M">60m</option>
                      <option value="DAY">Day</option>
                      <option value="ALL">All</option>
                    </select>
                  </div>

                  {/* Manual Refresh Trigger */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignSelf: 'flex-end' }}>
                    <button
                      onClick={() => {
                        setLoading(true);
                        setTimeout(() => setLoading(false), 300);
                      }}
                      className="btn-tab"
                      style={{
                        padding: '7px 12px',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255, 255, 255, 0.02)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                      Refresh Scan
                    </button>
                  </div>

                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>

                <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--green)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>FUTURES LEADS</span>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-heading)' }}>{futuresLeadsCount}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Potential breakout futures</span>
                </div>

                <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--blue)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>INDEX WATCHES</span>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--blue)', fontFamily: 'var(--font-heading)' }}>{indexWatchesCount}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Key index level shifts</span>
                </div>

                <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>STOCK WATCHES</span>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--orange)', fontFamily: 'var(--font-heading)' }}>{stockWatchesCount}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Impending breakouts detected</span>
                </div>

                <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid var(--accent-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>⚡ ACTIVE SPIKES</span>
                  <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-heading)' }}>{activeSpikesCount}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Spikes with volume surge</span>
                </div>

              </div>

              {/* Tables Grid */}
              <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', minHeight: '520px', marginBottom: '24px' }}>

                {/* LEFT TABLE: PRE-SPIKE WATCHLIST */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="pulsing-indicator online" style={{ width: '8px', height: '8px', borderRadius: '50%' }}></span>
                      PRE-SPIKE WATCH LIST
                    </h3>
                  </div>

                  <div style={{ flex: 1, overflowX: 'auto' }} className="table-responsive-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', height: '32px' }}>
                          <th style={{ textAlign: 'center', width: '75px' }}>Time</th>
                          <th>Symbol</th>
                          <th style={{ textAlign: 'right', width: '90px' }}>Price</th>
                          <th>Signal Type</th>
                          <th>Setup</th>
                          <th style={{ textAlign: 'center', width: '80px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedWatchlist.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No watch items match filters.</td>
                          </tr>
                        ) : (
                          paginatedWatchlist.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', height: '40px' }}>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                {formatSpikeTime(item.timestamp)}
                              </td>
                              <td style={{ fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-heading)' }}>{item.symbol}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                                ${item.price.toFixed(2)}
                              </td>
                              <td>
                                <span style={getWatchLevelBadgeStyle(item.signalType)}>
                                  {item.signalType}
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{item.setup}</td>
                              <td style={{ textAlign: 'center' }}>
                                {renderStatus(item.status)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {filteredWatchlist.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Rows:</span>
                        <select
                          value={watchlistPageSize}
                          onChange={(e) => {
                            setWatchlistPageSize(Number(e.target.value));
                            setWatchlistPage(1);
                          }}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          {[5, 10, 15, 25].map(size => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{filteredWatchlist.length} items</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          onClick={() => setWatchlistPage(p => Math.max(1, p - 1))}
                          disabled={watchlistPage === 1}
                          className="btn-tab"
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                        >
                          Prev
                        </button>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{watchlistPage} / {totalWatchlistPages}</span>
                        <button
                          onClick={() => setWatchlistPage(p => Math.min(totalWatchlistPages, p + 1))}
                          disabled={watchlistPage === totalWatchlistPages}
                          className="btn-tab"
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                </div>

                {/* RIGHT TABLE: PRICE SPIKE ALERTS */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="pulsing-indicator online" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--blue)', boxShadow: '0 0 6px var(--blue)' }}></span>
                      PRICE SPIKE ALERTS
                    </h3>

                    {/* Filter tabs */}
                    <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.02)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      {['ALL', 'BUY', 'STRONG BUY', 'SELL', 'STRONG SELL', 'HOLD'].map(tab => (
                        <button
                          key={tab}
                          className={`btn-tab ${spikeAlertsTab === tab ? 'active' : ''}`}
                          onClick={() => setSpikeAlertsTab(tab)}
                          style={{ fontSize: '9px', padding: '4px 8px' }}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowX: 'auto' }} className="table-responsive-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', height: '32px' }}>
                          <th style={{ textAlign: 'center', width: '75px' }}>Time</th>
                          <th>Symbol</th>
                          <th style={{ textAlign: 'right', width: '90px' }}>Price</th>
                          <th>Action</th>
                          <th style={{ textAlign: 'center', width: '60px' }}>Quality</th>
                          <th>Setup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedAlerts.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No alerts match filters.</td>
                          </tr>
                        ) : (
                          paginatedAlerts.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', height: '40px' }}>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                {formatSpikeTime(item.timestamp)}
                              </td>
                              <td style={{ fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-heading)' }}>{item.symbol}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                                ${item.price.toFixed(2)}
                              </td>
                              <td>
                                <span style={getActionBadgeStyle(item.action)}>
                                  {item.action}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span style={getQualityBadgeStyle(item.quality)}>
                                  {item.quality}
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{item.setup}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {filteredAlerts.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Rows:</span>
                        <select
                          value={alertsPageSize}
                          onChange={(e) => {
                            setAlertsPageSize(Number(e.target.value));
                            setAlertsPage(1);
                          }}
                          style={{
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          {[5, 10, 15, 25].map(size => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{filteredAlerts.length} items</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          onClick={() => setAlertsPage(p => Math.max(1, p - 1))}
                          disabled={alertsPage === 1}
                          className="btn-tab"
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                        >
                          Prev
                        </button>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{alertsPage} / {totalAlertsPages}</span>
                        <button
                          onClick={() => setAlertsPage(p => Math.min(totalAlertsPages, p + 1))}
                          disabled={alertsPage === totalAlertsPages}
                          className="btn-tab"
                          style={{ padding: '3px 8px', fontSize: '10px' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                </div>

              </div>
            </>
          )}

          {/* ================= PAGE VIEW: CHART TERMINAL ================= */}
          {currentPage === 'chart' && (
            <>
              {/* 1. SUBSCRIBED TILES - GLOWING BORDERS */}
              <div>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '12px', textTransform: 'uppercase' }}>
                  SUBSCRIBED TICKERS (LIVE STREAMING)
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                  {subscribedInstruments.map((inst) => {
                    const data = livePrices[inst.symbol] || {};
                    const price = data.price;
                    const pct = data.changePct || 0;
                    const isUp = pct >= 0;
                    const isActive = activeSymbol === inst.symbol;

                    return (
                      <div
                        key={inst.symbol}
                        onClick={() => setActiveSymbol(inst.symbol)}
                        className={`instrument-tile ${isActive ? 'active' : ''}`}
                      >
                        {/* Tile Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
                                {inst.symbol}
                              </span>
                              {isActive && <span className="pulsing-indicator online" style={{ width: '5px', height: '5px', borderRadius: '50%' }} />}
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px', display: 'block', marginTop: '1px' }}>
                              {inst.name || 'Stock'}
                            </span>
                          </div>
                          <span className={getBadgeClass(inst.secType)}>
                            {inst.secType}
                          </span>
                        </div>

                        {/* Tile Price */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' }}>
                          <span style={{
                            fontSize: '18px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-heading)',
                            color: 'var(--text-primary)'
                          }}>
                            {price != null ? `$${formatTilePrice(inst.symbol, price)}` : '$---'}
                          </span>

                          {price != null ? (
                            <span style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: isUp ? 'var(--green)' : 'var(--red)',
                              display: 'flex',
                              alignItems: 'center',
                              fontFamily: 'var(--font-heading)'
                            }}>
                              {isUp ? '↗' : '↘'} {isUp ? '+' : ''}{pct.toFixed(2)}%
                            </span>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>--.--%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. TECHNICAL CHART & TICKET LOG SPLIT */}
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.2fr', gap: '24px', minHeight: '500px' }}>

                {/* CHART PANEL */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        TECHNICAL CHART - <span style={{ color: 'var(--accent-primary)' }}>{activeSymbol}</span>
                      </h3>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {timeframe === '1s' && '1-Second'}
                        {timeframe === '5s' && '5-Second'}
                        {timeframe === '1m' && '1-Minute'}
                        {timeframe === '5m' && '5-Minute'}
                        {timeframe === '1d' && 'Daily'} Midpoint Candles [Real-time update]
                      </p>
                    </div>

                    {/* Timeframes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.02)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      {['1s', '5s', '1m', '5m', '1d'].map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setTimeframe(tf)}
                          className={`btn-tab ${timeframe === tf ? 'active' : ''}`}
                        >
                          {tf.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ position: 'relative', flex: 1, minHeight: '360px' }}>
                    {chartError && (
                      <div style={{
                        position: 'absolute', top: 12, left: 12, right: 12, zIndex: 20,
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                        padding: '12px 16px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px'
                      }}>
                        <AlertCircle style={{ color: 'var(--red)', flexShrink: 0, width: '16px', height: '16px' }} />
                        <span style={{ fontSize: '13px', color: '#fca5a5', fontWeight: 500 }}>{chartError}</span>
                      </div>
                    )}
                    {chartLoading && (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
                        background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px'
                      }}>
                        <RefreshCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--accent-primary)' }} />
                      </div>
                    )}
                    <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }}></div>
                  </div>
                </div>

                {/* RIGHT LIVE QUOTE & LOGS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                  {/* QUOTE CARD */}
                  <div className="glass-panel" style={{ padding: '20px', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--accent-primary)' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <p style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {activeSymbol} &nbsp;·&nbsp; LIVE PRICE
                      </p>

                      {/* Latency badge matching screenshot */}
                      <span style={{
                        fontSize: '10px',
                        color: 'var(--green)',
                        background: 'var(--green-bg)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        ● <span ref={liveLatRef}>{tickLatency}ms</span>
                      </span>
                    </div>

                    {/* Price display with DOM ref updates */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span
                        ref={livePriceRef}
                        style={{
                          fontSize: '34px',
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 800,
                          color: 'var(--text-primary)',
                          letterSpacing: '-0.5px'
                        }}
                      >
                        {formatTilePrice(activeSymbol, livePrices[activeSymbol]?.price || 0)}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700 }}>USD</span>
                    </div>

                    {/* Daily Changes */}
                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px', gap: '1px' }}>
                      <span ref={liveChangeRef} style={{ fontSize: '15px', fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-heading)' }}>
                        +{livePrices[activeSymbol]?.change?.toFixed(2) || '0.00'}
                      </span>
                      <span ref={livePctRef} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-heading)' }}>
                        +{livePrices[activeSymbol]?.changePct?.toFixed(2) || '0.00'}%
                      </span>
                    </div>

                    <p ref={liveTimeRef} style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      As of today at --:--
                    </p>

                    {/* Bid/Ask Boxes */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                      <div style={{ background: 'var(--red-bg)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                        <p style={{ fontSize: '9px', color: 'var(--red)', fontWeight: 700, letterSpacing: '0.5px' }}>BID</p>
                        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          {formatQuote(liveTick.bid)}
                        </p>
                      </div>
                      <div style={{ background: 'var(--green-bg)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                        <p style={{ fontSize: '9px', color: 'var(--green)', fontWeight: 700, letterSpacing: '0.5px' }}>ASK</p>
                        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          {formatQuote(liveTick.ask)}
                        </p>
                      </div>
                    </div>

                    {/* Spread Details */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <ArrowUpDown style={{ width: '11px', height: '11px', color: 'var(--accent-primary)' }} />
                        Spread
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)' }}>{liveTick.spread || '---'}</span>
                    </div>
                  </div>

                  {/* RECENT TICK LOGS - ALIGNING LAYOUT */}
                  <div className="glass-panel" style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      RECENT TICK LOGS
                    </h3>

                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: '184px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', height: '24px', textAlign: 'left' }}>
                            <th>Time</th>
                            <th>Last/Mid</th>
                            <th>Bid</th>
                            <th>Ask</th>
                            <th style={{ textAlign: 'right' }}>Spread</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentTicks.length === 0 ? (
                            <tr>
                              <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Waiting for tick stream...</td>
                            </tr>
                          ) : (
                            recentTicks.map((tick, idx) => (
                              <tr
                                key={idx}
                                style={{
                                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                                  height: '26px',
                                  color: tick.direction === 'up' ? 'var(--green)' : 'var(--red)'
                                }}
                              >
                                <td style={{ color: 'var(--text-secondary)' }}>{tick.time}</td>
                                <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                                  {tick.last != null ? formatQuote(tick.last) : (tick.bid != null && tick.ask != null ? formatQuote((tick.bid + tick.ask) / 2) : '---')}
                                </td>
                                <td>{formatQuote(tick.bid)}</td>
                                <td>{formatQuote(tick.ask)}</td>
                                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{tick.spread}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}

          {/* ================= PAGE VIEW: INSTRUMENTS ================= */}
          {currentPage === 'instruments' && (
            <main style={{ display: 'flex', flexDirection: 'column', gap: '28px', flex: 1 }}>

              {/* HEADER ROW */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '10px' }}>
                    <Search style={{ color: 'var(--text-primary)', width: '24px', height: '24px' }} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Instruments Manager
                    </h2>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Manage active stock, index, and future tickers subscribed in the streaming dashboard
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSubscribedInstruments(DEFAULT_SUBSCRIBED);
                    setSearchSuccess("Reset to default subscriptions.");
                  }}
                  className="btn-tab"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: 'var(--bg-card)'
                  }}
                >
                  <RefreshCw style={{ width: '13px', height: '13px' }} />
                  Reset Defaults
                </button>
              </div>

              {/* SEARCH & ADD INSTRUMENT FORM */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.8px', marginBottom: '16px', textTransform: 'uppercase' }}>
                  SEARCH & ADD INSTRUMENTS
                </p>

                <form onSubmit={handleAddInstrument} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        value={searchSymbol}
                        onChange={(e) => setSearchSymbol(e.target.value)}
                        placeholder="Search for AAPL, SPX, /ES, EURUSD..."
                        style={{
                          width: '100%',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-color)',
                          padding: '10px 12px 10px 38px',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          fontWeight: 600,
                          outline: 'none',
                          transition: 'border-color 0.2s'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ width: '130px' }}>
                    <select
                      value={searchSecType}
                      onChange={(e) => setSearchSecType(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--sidebar-bg)',
                        border: '1px solid var(--border-color)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="STK">NYSE/NQ</option>
                      <option value="IND">CBOE</option>
                      <option value="FUT">CME FUT</option>
                      <option value="CASH">FOREX</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={searchLoading}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '10px 24px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      minWidth: '120px',
                      justifyContent: 'center',
                      transition: 'var(--transition)'
                    }}
                  >
                    {searchLoading ? (
                      <RefreshCw style={{ animation: 'spin 1.5s linear infinite', width: '16px', height: '16px' }} />
                    ) : (
                      <>
                        <Search style={{ width: '15px', height: '15px' }} />
                        Search
                      </>
                    )}
                  </button>
                </form>

                {searchError && (
                  <div style={{
                    marginTop: '16px', padding: '12px 16px', background: 'var(--red-bg)',
                    border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', gap: '10px', color: '#fca5a5', fontSize: '13px'
                  }}>
                    <AlertCircle style={{ color: 'var(--red)', width: '16px', height: '16px' }} />
                    <span>{searchError}</span>
                  </div>
                )}

                {searchSuccess && (
                  <div style={{
                    marginTop: '16px', padding: '12px 16px', background: 'var(--green-bg)',
                    border: '1px solid rgba(34, 232, 122, 0.2)', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', gap: '10px', color: '#a7f3d0', fontSize: '13px'
                  }}>
                    <CheckCircle style={{ color: 'var(--green)', width: '16px', height: '16px' }} />
                    <span>{searchSuccess}</span>
                  </div>
                )}
              </div>

              {/* SUBSCRIBED INSTRUMENTS TABLE */}
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                    ACTIVE INSTRUMENTS ({subscribedInstruments.length})
                  </p>

                  <div style={{ display: 'flex', gap: '6px', background: 'rgba(255, 255, 255, 0.02)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    {['ALL', 'STOCKS', 'INDICES', 'FUTURES', 'FOREX'].map((filter) => {
                      const count = subscribedInstruments.filter(inst => {
                        if (filter === 'ALL') return true;
                        if (filter === 'STOCKS') return inst.secType === 'STK';
                        if (filter === 'INDICES') return inst.secType === 'IND';
                        if (filter === 'FUTURES') return inst.secType === 'FUT';
                        if (filter === 'FOREX') return inst.secType === 'CASH';
                        return false;
                      }).length;

                      return (
                        <button
                          key={filter}
                          onClick={() => setInstrumentFilter(filter)}
                          className={`btn-tab ${instrumentFilter === filter ? 'active' : ''}`}
                          style={{ fontSize: '10px', padding: '6px 12px' }}
                        >
                          {filter.charAt(0) + filter.slice(1).toLowerCase()} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', height: '40px' }}>
                        <th style={{ paddingLeft: '12px' }}>Symbol</th>
                        <th>Long Name / Description</th>
                        <th>Primary Exchange</th>
                        <th>Type</th>
                        <th>Contract ID (conId)</th>
                        <th style={{ textAlign: 'right', paddingRight: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInstruments.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
                            No instruments match this filter. Subscribe to symbols above.
                          </td>
                        </tr>
                      ) : (
                        filteredInstruments.map((inst) => (
                          <tr
                            key={inst.symbol}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                              height: '52px',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ paddingLeft: '12px', fontWeight: 800, color: 'var(--accent-primary)' }}>
                              {inst.symbol}
                            </td>
                            <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                              {inst.name || inst.symbol}
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {inst.exchange || 'SMART'}
                            </td>
                            <td>
                              <span className={getBadgeClass(inst.secType)}>
                                {inst.secType === 'STK' && 'Stock'}
                                {inst.secType === 'IND' && 'Index'}
                                {inst.secType === 'FUT' && 'Future'}
                                {inst.secType === 'CASH' && 'Forex'}
                              </span>
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              {inst.conId}
                            </td>
                            <td style={{ textAlign: 'right', paddingRight: '12px' }}>
                              <button
                                onClick={() => handleRemoveInstrument(inst.symbol)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--red)',
                                  cursor: 'pointer',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  transition: 'background 0.2s',
                                  outline: 'none'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--red-bg)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                title="Unsubscribe Asset"
                              >
                                <Trash2 style={{ width: '15px', height: '15px' }} />
                                <span style={{ fontSize: '11px', fontWeight: 600 }}>Remove</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </main>
          )}

          {/* ================= PLACEHOLDER PAGES ================= */}
          {(() => {
            const placeholderPages = {
              'pre-spike': {
                icon: <Activity size={28} />,
                label: 'Coming Soon',
                title: 'Pre-Spike Scanner',
                desc: 'Advanced pre-movement detection using order flow imbalance, volume acceleration, and multi-timeframe momentum signals to surface breakout candidates before they move.',
                pills: ['Order Flow Analysis', 'Volume Surge Detection', 'VWAP Proximity Alerts', 'Multi-TF Momentum', 'Breakout Probability'],
              },
              'predefined-alerts': {
                icon: <List size={28} />,
                label: 'Coming Soon',
                title: 'Price Spike Alerts',
                desc: 'Configurable rule-based alert engine that fires on rapid price dislocations, large spread widenings, and volume-weighted abnormal tick activity across all subscribed instruments.',
                pills: ['Custom Threshold Rules', 'Spread Monitor', 'Volume Spike Rules', 'Multi-Asset Alerts', 'Alert History'],
              },
              'alerts': {
                icon: <Bell size={28} />,
                label: 'Coming Soon',
                title: 'Alerts Centre',
                desc: 'Centralized notification hub for all system-generated market events, gateway status changes, and custom watchlist triggers with delivery via browser push, email, or webhook.',
                pills: ['Push Notifications', 'Email Delivery', 'Webhook Integration', 'Alert Log', 'Priority Levels'],
              },
              'hf-alerts': {
                icon: <Zap size={28} />,
                label: 'Coming Soon',
                title: 'HF Alerts',
                desc: 'High-frequency alert stream operating at tick-level resolution, capturing sub-second price dislocations and order flow events invisible to standard alert systems.',
                pills: ['Sub-second Resolution', 'Tick-level Events', 'HF Volume Analysis', 'Order Imbalance', 'Latency Monitor'],
              },
              'history': {
                icon: <History size={28} />,
                label: 'Coming Soon',
                title: 'Live History',
                desc: 'Real-time rolling audit log of all market events, tick streams, alert fires, and instrument status changes captured during the current trading session.',
                pills: ['Session Replay', 'Event Timeline', 'Tick Log Export', 'Filter by Symbol', 'Alert Replay'],
              },
              'historical': {
                icon: <LineChart size={28} />,
                label: 'Coming Soon',
                title: 'Historical Analytics',
                desc: 'Deep-dive into past spike events, replay historical tick data, and compare intraday price behavior across sessions with interactive charting and statistical overlays.',
                pills: ['Multi-session Comparison', 'Spike Event Replay', 'Statistical Overlays', 'CSV Export', 'Pattern Library'],
              },
              'option-chain': {
                icon: <BarChart2 size={28} />,
                label: 'Coming Soon',
                title: 'Option Chain',
                desc: 'Real-time options chain viewer with Greeks, open interest, IV surface, and unusual activity scanner powered by live IB Gateway data for US equity and index options.',
                pills: ['Live Greeks', 'IV Surface', 'Open Interest', 'Unusual Activity', 'Strike Heatmap'],
              },
              'option-simulator': {
                icon: <Sliders size={28} />,
                label: 'Coming Soon',
                title: 'Option Simulator',
                desc: 'Strategy P&L simulation tool for building, back-testing, and stress-testing multi-leg option strategies with real-time IV and underlying price scenario modeling.',
                pills: ['P&L Visualizer', 'Scenario Modelling', 'Multi-leg Builder', 'IV Stress Test', 'Risk Profile Chart'],
              },
              'commodity': {
                icon: <Gem size={28} />,
                label: 'Coming Soon',
                title: 'Commodity Tracker',
                desc: 'Live price monitoring and spike alerting for US-traded commodity futures including crude oil, natural gas, gold, silver, and agricultural contracts via CME data.',
                pills: ['Crude Oil & NatGas', 'Precious Metals', 'Agricultural Futures', 'Seasonal Patterns', 'CoT Data'],
              },
            };

            const page = placeholderPages[currentPage];
            if (!page) return null;

            return (
              <div className="coming-soon-page">
                <div className="coming-soon-card">
                  <div className="coming-soon-icon">{page.icon}</div>
                  <p className="coming-soon-label">{page.label}</p>
                  <h2 className="coming-soon-title">{page.title}</h2>
                  <p className="coming-soon-desc">{page.desc}</p>
                  <div className="coming-soon-pills">
                    {page.pills.map(pill => (
                      <span key={pill} className="coming-soon-pill">{pill}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
