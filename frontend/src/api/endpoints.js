import client from './client'

// ── Auth ──
export const register = (username, password) =>
  client.post('/auth/register', { username, password })
export const registerAdmin = (username, password, _admin_key) =>
  client.post('/auth/register', { username, password })
export const login = (username, password) =>
  client.post('/auth/login', { username, password })
export const getMe = () => client.get('/auth/me')

// ── Ticker / navbar status (IB Gateway) ──
export const getTickerStatus = () => client.get('/market/ticker/status')
export const startTicker = () => client.post('/market/ticker/start')
export const stopTicker = () => client.post('/market/ticker/stop')

// ── Market analytics ──
export const getSummary = () => client.get('/market/summary')
export const getDashboardAnalytics = ({
  timeframe = 30,
  symbol = null,
  targetDate = null,
  oppPage = 1,
  oppPageSize = 15,
  oppAction = 'ALL',
  backupOppPage = 1,
  backupOppPageSize = 15,
  backupOppAction = 'ALL',
} = {}) => {
  const params = {
    timeframe,
    opp_page: oppPage,
    opp_page_size: oppPageSize,
    opp_action: oppAction,
    backup_opp_page: backupOppPage,
    backup_opp_page_size: backupOppPageSize,
    backup_opp_action: backupOppAction,
  }
  if (symbol && symbol !== 'ALL') params.symbol = symbol
  if (targetDate) params.target_date = targetDate
  return client.get('/market/dashboard-analytics', { params })
}
export const getPreSpikeDashboard = ({
  timeframe = 'DAY',
  symbol = null,
  symbolType = 'ALL',
  wlPage = 1,
  wlPageSize = 10,
  alertsPage = 1,
  alertsPageSize = 10,
  alertsAction = 'ALL',
} = {}) => {
  const params = {
    timeframe,
    symbol_type: symbolType,
    wl_page: wlPage,
    wl_page_size: wlPageSize,
    alerts_page: alertsPage,
    alerts_page_size: alertsPageSize,
    alerts_action: alertsAction,
  }
  if (symbol && symbol !== 'ALL') params.symbol = symbol
  return client.get('/market/pre-spike', { params })
}

// ── OHLCV (backend main.py) ──
export const getOHLCV = (instrument, from, to, limit = 500) =>
  client.get('/candles', { params: { symbol: instrument, from, to, limit } })

// ── Instruments (US security master) ──
export const getInstruments = () => client.get('/instruments')
export const searchInstruments = (q, exchange = '') =>
  client.get('/instruments/search', { params: { q, exchange } })
