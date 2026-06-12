import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';

const SEC_TYPE_LABEL = { STK: 'STK', IND: 'IND', FUT: 'FUT' };

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All Types' },
  { value: 'STOCK', label: 'Stock' },
  { value: 'ETF', label: 'ETF' },
  { value: 'INDEX', label: 'Index' },
  { value: 'FUTURE', label: 'Future' },
];

const EXCHANGE_OPTIONS = [
  { value: 'ALL', label: 'All Exchanges' },
  { value: 'SMART', label: 'SMART' },
  { value: 'NASDAQ', label: 'NASDAQ' },
  { value: 'NYSE', label: 'NYSE' },
  { value: 'CBOE', label: 'CBOE' },
  { value: 'ARCA', label: 'ARCA' },
  { value: 'AMEX', label: 'AMEX' },
  { value: 'CME', label: 'CME' },
  { value: 'CBOT', label: 'CBOT' },
  { value: 'NYMEX', label: 'NYMEX' },
  { value: 'COMEX', label: 'COMEX' },
  { value: 'PHLX', label: 'PHLX' },
];

const ACTIVE_EXCHANGE_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'NASDAQ', label: 'NASDAQ' },
  { id: 'NYSE', label: 'NYSE' },
  { id: 'CBOE', label: 'CBOE' },
  { id: 'SMART', label: 'SMART' },
  { id: 'CME', label: 'CME' },
];

const secTypeForAsset = (assetType) => {
  if (assetType === 'INDEX') return 'IND';
  if (assetType === 'FUTURE') return 'FUT';
  if (assetType === 'ETF') return 'ETF';
  return 'STK';
};

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '20px 24px',
};

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '10px 14px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
};

function ResultTable({ rows, activeSymbols, onAdd, addingId, token, showAdd }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: '16px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Symbol</th>
            <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Name</th>
            <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Exchange</th>
            <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Type</th>
            <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Token</th>
            {showAdd && <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 800 }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tokenId = row.ibkr_conid || row.con_id;
            const isActive = activeSymbols.has(row.symbol);
            const isAdding = addingId === row.instrument_id;
            return (
              <tr key={`${row.instrument_id}-${row.symbol}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>{row.symbol}</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    background: 'rgba(45, 212, 191, 0.12)', color: 'var(--teal, #2dd4bf)',
                    padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                  }}>
                    {row.exchange || 'SMART'}
                  </span>
                </td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                  {SEC_TYPE_LABEL[row.sec_type] || row.asset_type || 'STK'}
                </td>
                <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                  {tokenId ?? '—'}
                </td>
                {showAdd && (
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {isActive ? (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>Added</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(row)}
                        disabled={!token || isAdding || !row.instrument_id}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(34, 197, 94, 0.15)', color: 'var(--green, #22c55e)',
                          border: '1px solid rgba(34, 197, 94, 0.35)', borderRadius: '6px',
                          padding: '6px 14px', fontSize: '11px', fontWeight: 700,
                          cursor: !token || isAdding ? 'not-allowed' : 'pointer',
                          opacity: !token || isAdding ? 0.6 : 1,
                        }}
                      >
                        <Plus size={14} />
                        {isAdding ? 'Adding...' : 'Add'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function InstrumentsCatalog({
  restUrl,
  token,
  onSubscribe,
  onUnsubscribe,
  onSubscriptionsChange,
}) {
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchType, setSearchType] = useState('ALL');
  const [searchExchange, setSearchExchange] = useState('ALL');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingId, setAddingId] = useState(null);

  const [activeInstruments, setActiveInstruments] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [exchangeFilter, setExchangeFilter] = useState('ALL');

  const activeSymbols = useMemo(
    () => new Set(activeInstruments.map((i) => i.symbol)),
    [activeInstruments]
  );

  const fetchActiveInstruments = useCallback(async () => {
    setLoadingActive(true);
    try {
      const res = await fetch(`${restUrl}/instruments/streaming`);
      const data = await res.json();
      setActiveInstruments(data.items || []);
    } catch (err) {
      console.error('Failed to load streaming instruments:', err);
    } finally {
      setLoadingActive(false);
    }
  }, [restUrl]);

  useEffect(() => {
    fetchActiveInstruments();
  }, [fetchActiveInstruments]);

  const filteredActive = useMemo(() => {
    if (exchangeFilter === 'ALL') return activeInstruments;
    return activeInstruments.filter(
      (i) => (i.exchange || 'SMART').toUpperCase() === exchangeFilter
    );
  }, [activeInstruments, exchangeFilter]);

  const exchangeTabCounts = useMemo(() => {
    const counts = { ALL: activeInstruments.length };
    for (const tab of ACTIVE_EXCHANGE_TABS) {
      if (tab.id === 'ALL') continue;
      counts[tab.id] = activeInstruments.filter(
        (i) => (i.exchange || 'SMART').toUpperCase() === tab.id
      ).length;
    }
    return counts;
  }, [activeInstruments]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchSymbol.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    setHasSearched(true);
    const query = searchSymbol.trim();

    try {
      const params = new URLSearchParams({
        page: '1',
        page_size: '50',
        sort_by: 'symbol',
        sort_order: 'asc',
        q: query,
      });
      if (searchType !== 'ALL') params.set('asset_type', searchType);
      if (searchExchange !== 'ALL') params.set('exchange', searchExchange);

      const res = await fetch(`${restUrl}/instruments?${params}`);
      const data = await res.json();
      let items = (data.items || []).map((item) => ({
        ...item,
        sec_type: secTypeForAsset(item.asset_type),
        con_id: item.ibkr_conid,
      }));

      // Exact ticker miss: resolve via IBKR
      if (items.length === 0 && /^[A-Za-z0-9./]{1,20}$/.test(query)) {
        const symbol = query.toUpperCase().replace(/^\//, '');
        const secType = searchType === 'ALL' ? 'STK' : secTypeForAsset(searchType);
        const searchRes = await fetch(
          `${restUrl}/instruments/search?symbol=${encodeURIComponent(symbol)}&sec_type=${secType}`
        );
        if (searchRes.ok) {
          const hit = await searchRes.json();
          if (searchExchange === 'ALL' || (hit.exchange || '').toUpperCase().includes(searchExchange)) {
            items = [{
              ...hit,
              sec_type: secTypeForAsset(hit.asset_type),
              con_id: hit.ibkr_conid,
            }];
          }
        }
      }

      setSearchResults(items);
      if (items.length === 0) {
        setSearchError('No instruments found. Try a different symbol or filter.');
      }
    } catch (err) {
      setSearchError(err.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAdd = async (row) => {
    if (!token) {
      setSearchError('Please log in to add instruments.');
      return;
    }
    if (!row.instrument_id) {
      setSearchError(`${row.symbol} has no instrument ID — resolve it first.`);
      return;
    }
    if (activeSymbols.has(row.symbol)) return;

    setAddingId(row.instrument_id);
    setSearchError(null);
    try {
      const subRes = await fetch(`${restUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instrument_id: row.instrument_id }),
      });
      if (!subRes.ok) {
        const err = await subRes.json();
        throw new Error(err.detail || 'Failed to add to stream catalog');
      }
      onSubscribe?.(row);
      onSubscriptionsChange?.();
      await fetchActiveInstruments();
    } catch (err) {
      setSearchError(err.message || 'Add failed');
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (row) => {
    if (!token || !row.instrument_id) return;
    try {
      const res = await fetch(`${restUrl}/subscriptions/${row.instrument_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Remove failed');
      }
      onUnsubscribe?.(row.instrument_id);
      onSubscriptionsChange?.();
      await fetchActiveInstruments();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Building2 size={28} style={{ color: 'var(--blue)' }} />
          <div>
            <h2 style={{
              fontSize: '22px', fontWeight: 800, margin: 0,
              fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Instruments
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Manage streamed instruments across NYSE, NASDAQ, CBOE &amp; CME
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-tab"
          onClick={fetchActiveInstruments}
          disabled={loadingActive}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px' }}
        >
          <RefreshCw size={14} style={{ animation: loadingActive ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 16px' }}>
          Search &amp; Add Instruments
        </h3>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value)}
            placeholder="Search for AAPL, SPX, NVDA, NDX..."
            style={{ ...inputStyle, flex: '1 1 220px', minWidth: '180px' }}
          />
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer', minWidth: '120px' }}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={searchExchange}
            onChange={(e) => setSearchExchange(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer', minWidth: '140px' }}
          >
            {EXCHANGE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={searchLoading || !searchSymbol.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'var(--blue)', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '10px 20px', fontWeight: 700,
              fontSize: '13px', cursor: searchLoading ? 'wait' : 'pointer',
              opacity: searchLoading ? 0.7 : 1,
            }}
          >
            <Search size={16} />
            {searchLoading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {searchError && (
          <p style={{ color: 'var(--red)', fontSize: '12px', margin: '12px 0 0' }}>{searchError}</p>
        )}

        {hasSearched && !searchLoading && searchResults.length > 0 && (
          <ResultTable
            rows={searchResults}
            activeSymbols={activeSymbols}
            onAdd={handleAdd}
            addingId={addingId}
            token={token}
            showAdd
          />
        )}
      </div>

      {/* Active Instruments */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>
            Active Instruments ({activeInstruments.length})
          </h3>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {ACTIVE_EXCHANGE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn-tab ${exchangeFilter === tab.id ? 'active' : ''}`}
                onClick={() => setExchangeFilter(tab.id)}
                style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '20px' }}
              >
                {tab.label} ({exchangeTabCounts[tab.id] ?? 0})
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Symbol</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Exchange</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Type</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 800 }}>Token</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 800 }}></th>
              </tr>
            </thead>
            <tbody>
              {loadingActive ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading streaming instruments...
                  </td>
                </tr>
              ) : filteredActive.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No active instruments. Search above and click Add to stream a symbol.
                  </td>
                </tr>
              ) : (
                filteredActive.map((row) => (
                  <tr key={`${row.con_id}-${row.symbol}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>{row.symbol}</td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.name}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        background: 'rgba(45, 212, 191, 0.12)', color: 'var(--teal, #2dd4bf)',
                        padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                      }}>
                        {row.exchange || 'SMART'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                      {SEC_TYPE_LABEL[row.sec_type] || row.asset_type || 'STK'}
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                      {row.con_id}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleRemove(row)}
                        disabled={!token}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red, #ef4444)',
                          border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px',
                          padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
