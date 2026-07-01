---
name: US Migration Spec MD
overview: Create `US_MARKET_MIGRATION.md` for the US fork — copy the entire India SpikeIQ UI (landing page, light/dark theme, glassmorphism shell, Dashboard, Pre-Spike, Admin/Backup) and wire to existing `trade_analytics_us` ClickHouse. No Kafka/broker work.
todos:
  - id: draft-md-structure
    content: Write US_MARKET_MIGRATION.md — agent prompt, full UI copy list, scope
    status: pending
  - id: ui-theme-shell
    content: Document exact copy of index.css, landing.css, theme system, App shell, Navbar, Sidebar
    status: pending
  - id: pages-copy-guide
    content: Document all pages to copy (Landing, Login, Dashboard, PreSpike, Admin, Settings, Backup, Instruments keep)
    status: pending
  - id: backend-copy-guide
    content: Backend API files to copy + CLICKHOUSE_DB fixes only
    status: pending
  - id: verification-checklist
    content: Visual parity checklist (dark/light mode, grid background, landing page) + API smoke tests
    status: pending
isProject: false
---

# US Market Migration Spec Document

## Goal

Produce **`US_MARKET_MIGRATION.md`** — a Cursor agent instruction file for the **US fork** (`trade_analytics-us`).

**Already done (do NOT rebuild):**
- Kafka → ClickHouse `trade_analytics_us` pipeline
- Same tables/views as India
- Instruments page working

**What is needed:** Copy the **entire India UI** — same look, same light/dark mode, same glassmorphism backgrounds, same landing/home page, same dashboard pages — pointed at `trade_analytics_us`.

Reference source: [trade-analytics India repo](c:\Users\tufai\OneDrive\Desktop\trade-analytics)

---

## Full scope

### 1. Entire UI shell (exact visual parity)

Copy the complete design system from India — **do not redesign**:

| Asset | India file | What it provides |
|---|---|---|
| Global styles + dark theme | `frontend/src/index.css` (~4250 lines) | CSS variables, glassmorphism, grid overlay, noise film, ambient orbs, all component styles |
| Light mode overrides | `frontend/src/index.css` (`:root[data-theme='light']` block, line ~3853+) | Exact light background gradient, card glass, sidebar/navbar light styles |
| Landing page styles | `frontend/src/styles/landing.css` | Hero, ticker strip, feature cards, CTA sections |
| Alert page styles | `frontend/src/styles/alerts.css` | Alert builder light/dark overrides |
| Ticker interval styles | `frontend/src/styles/ticker-interval.css` | Interval selector light/dark |
| HTML shell | `frontend/index.html` | Theme flash-prevention script, fonts, favicons, `data-theme` on `<html>` |
| App layout + theme state | `frontend/src/App.jsx` | `theme` / `setTheme` in localStorage, `document.documentElement.setAttribute('data-theme', theme)`, Sidebar + Navbar layout |
| Navbar + theme toggle | `frontend/src/components/Navbar.jsx` | Sun/Moon toggle button |
| Sidebar | `frontend/src/components/Sidebar.jsx` | Collapsible nav, glass panel |
| Auth context | `frontend/src/auth/AuthContext.jsx`, `ProtectedRoute.jsx` | Login flow |
| API client | `frontend/src/api/client.js`, `endpoints.js` | REST wrappers |
| WebSocket hook | `frontend/src/hooks/useWebSocket.js` | Live alerts |
| Browser notify | `frontend/src/utils/browserNotify.js` | Toast sounds |
| Main entry | `frontend/src/main.jsx` | React bootstrap |
| Public assets | `frontend/public/` | favicon.svg, site.webmanifest, apple-touch-icon |

**Theme system (must copy exactly):**

```javascript
// App.jsx — theme persisted in localStorage
const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}, [theme])
```

```html
<!-- index.html — prevents flash of wrong theme on load -->
<script>
  (function() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
```

**Background layers (dark mode — must match India exactly):**
- `--bg-scene`: `radial-gradient(ellipse 80% 60% at 30% 70%, #1a0a00, #0a0a0a, #000510)`
- `body::before`: amber + slate blue ambient orbs
- `body::after`: 60px trading-floor grid (`--grid-line-color: rgba(255,255,255,0.025)`)
- `#root::after`: noise film overlay at 4% opacity

**Background layers (light mode — must match India exactly):**
- `--bg-scene`: `radial-gradient(ellipse 80% 60% at 30% 70%, #ffffff, #f7f9fc, #eff3f9)`
- Warmer orb tints on `body::before`
- Grid lines switch to `rgba(0,0,0,0.025)`

### 2. Pages to copy

| Page | Route | India file |
|---|---|---|
| **Home / Landing** | `/` (unauthenticated) | `frontend/src/pages/LandingPage.jsx` |
| **Login** | `/login` | `frontend/src/auth/LoginPage.jsx` |
| **Dashboard** | `/dashboard` | `frontend/src/pages/Dashboard.jsx` |
| **Pre-Spike** | `/pre-spike` | `frontend/src/pages/PreSpikeDashboard.jsx` |
| **Instruments** | `/instruments` | Already in US fork — **do not overwrite** |
| **Admin** | `/admin` | `frontend/src/pages/AdminDashboard.jsx` |
| **Settings** | `/settings` | `frontend/src/pages/Settings.jsx` |
| **Backup** | `/backup` | `frontend/src/pages/Backup.jsx` |

**Landing page US content tweak (only text/data, not layout):**
- Replace India ticker strip (`NIFTY 50`, `BANKNIFTY`, `RELIANCE`…) with US symbols (`SPX`, `/ES`, `/NQ`, `TSLA`, `AAPL`, `NVDA`)
- Replace `₹` with `$` in hero mock prices
- Replace "NSE, BSE, MCX" copy with "US equities, futures, indices"
- Keep all CSS classes, layout, animations, theme toggle — **identical structure**

**Sidebar nav (US fork target):**
```
Dashboard
Pre-Spike
Instruments        ← keep existing
Settings           ← admin
Admin              ← admin
Backup             ← admin
```
Hide India-only: Option Chain, Commodity, AI Chat, ETL, HF Alerts, Historical, etc.

### 3. Supporting components

| Component | File |
|---|---|
| Candlestick chart | `frontend/src/components/CandlestickChart.jsx` (theme-aware via `data-theme` observer) |
| Feature flags | `frontend/src/config/featureFlags.js` |
| Formatters | `frontend/src/utils/formatters.js` — change to `en-US`, `America/New_York`, `$` |

### 4. Backend (API only — no pipeline changes)

Copy from India if missing:

| File | Purpose |
|---|---|
| `backend/app/market/router.py` | `dashboard-analytics`, `pre-spike`, `summary` |
| `backend/app/services/price_spike_watcher.py` | WebSocket pre-spike alerts |
| `backend/app/market/websocket.py` | WS broadcast |
| `backend/app/admin/router.py` | Admin API |
| `backend/app/backup/` | Backup scheduler |
| `backend/app/main.py` | Router registration, watcher lifespan |

**Minimal backend edits:**
- `CLICKHOUSE_DB=trade_analytics_us` in `.env` / `config.py`
- Fix hardcoded `trade_analytics.` → `settings.CLICKHOUSE_DB` in `price_spike_watcher.py`
- `Asia/Kolkata` → `America/New_York` in router queries
- Market hours `920-1520` → `930-1600`

### 5. Out of scope — do NOT touch

- Kafka consumer, ticker, data ingestion
- IBKR instruments integration (already working)
- Docker / infrastructure setup
- Option Chain, Commodity, AI Chat, ETL pages

---

## What the MD file will contain

### Section A — Cursor agent preamble

```
Port the ENTIRE India SpikeIQ frontend UI into this US fork.
Visual parity is mandatory: same glassmorphism, same grid background,
same dark/light mode toggle, same landing page layout.
Data pipeline (Kafka → trade_analytics_us) is already running.
Only copy files, wire routes, set CLICKHOUSE_DB, apply US display formatting.
```

### Section B — Frontend file copy checklist (copy verbatim from India)

Grouped checklist with `[ ]` boxes:

**Styles (copy entire files, no edits except none needed):**
- [ ] `frontend/src/index.css`
- [ ] `frontend/src/styles/landing.css`
- [ ] `frontend/src/styles/alerts.css`
- [ ] `frontend/src/styles/ticker-interval.css`
- [ ] `frontend/index.html`
- [ ] `frontend/public/*` (favicons, manifest)

**Shell:**
- [ ] `frontend/src/App.jsx`
- [ ] `frontend/src/main.jsx`
- [ ] `frontend/src/components/Navbar.jsx`
- [ ] `frontend/src/components/Sidebar.jsx` (then trim nav items)
- [ ] `frontend/src/components/CandlestickChart.jsx`
- [ ] `frontend/src/auth/*`
- [ ] `frontend/src/hooks/useWebSocket.js`
- [ ] `frontend/src/api/client.js`
- [ ] `frontend/src/api/endpoints.js`
- [ ] `frontend/src/utils/browserNotify.js`
- [ ] `frontend/src/config/featureFlags.js`

**Pages:**
- [ ] `frontend/src/pages/LandingPage.jsx` (US ticker text only)
- [ ] `frontend/src/pages/Dashboard.jsx` (US timezone/currency)
- [ ] `frontend/src/pages/PreSpikeDashboard.jsx` (US timezone/currency/symbol classifier)
- [ ] `frontend/src/pages/AdminDashboard.jsx`
- [ ] `frontend/src/pages/Settings.jsx`
- [ ] `frontend/src/pages/Backup.jsx`

### Section C — US display edits (minimal, after copy)

| File | Change |
|---|---|
| `formatters.js` | `en-IN` → `en-US`, `Asia/Kolkata` → `America/New_York` |
| `Dashboard.jsx` | `formatSpikeTime` timezone; hide Kite buttons if no Kite; US index labels |
| `PreSpikeDashboard.jsx` | US `getSymbolType()`: `/` = FUTURES, SPX/NDX = INDEX |
| `LandingPage.jsx` | US ticker symbols and `$` prices in `TICKER_DATA` and feature mocks |
| `Sidebar.jsx` | Trim to Dashboard, Pre-Spike, Instruments, Settings, Admin, Backup |

### Section D — Backend copy + DB config

Same as before: copy router/watcher/admin/backup, set `CLICKHOUSE_DB=trade_analytics_us`, fix hardcoded DB names.

### Section E — Visual parity verification checklist

- [ ] `/` landing page loads with cinematic dark background (grid + orbs + noise)
- [ ] Theme toggle (Sun/Moon) switches to light mode — white gradient background, same grid
- [ ] Theme persists after page reload (localStorage)
- [ ] No flash of wrong theme on first paint (index.html script)
- [ ] Login page matches India glassmorphism style
- [ ] Authenticated app: Sidebar + Navbar layout identical to India
- [ ] Dashboard glass cards, stat widgets, tables match India dark mode
- [ ] Dashboard looks correct in light mode (cards, sidebar, navbar)
- [ ] Pre-Spike split-panel layout matches India
- [ ] `/instruments` still works (regression)
- [ ] API returns data from `trade_analytics_us`

### Section F — Implementation order

1. Copy all CSS + `index.html` + public assets (visual foundation)
2. Copy `App.jsx`, auth, Navbar, Sidebar shell
3. Copy Landing + Login pages
4. Copy Dashboard + Pre-Spike + Admin + Settings + Backup pages
5. Copy backend APIs + set `CLICKHOUSE_DB`
6. Apply US text/timezone/currency edits
7. Trim Sidebar nav
8. Run visual + API verification checklist

---

## Deliverable

One file: **`US_MARKET_MIGRATION.md`** (~350-450 lines) — complete Cursor agent prompt with:

- Full frontend file copy list (styles, shell, pages)
- Exact theme system documentation
- Landing page US content substitutions
- Backend API copy list
- Visual parity + API verification checklists
- "Do not touch" list (Kafka, instruments, infra)

No broker work. No infrastructure setup. **Exact same UI as India.**
