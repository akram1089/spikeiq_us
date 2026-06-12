import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, Search, Trash2 } from 'lucide-react';

const SEC_TYPE_LABEL = { STK: 'STK', IND: 'IND', FUT: 'FUT' };
const SEARCH_TYPES = [
  { value: 'STK', label: 'Stock' },
  { value: 'IND', label: 'Index' },
  { value: 'FUT', label: 'Future' },
  { value: 'ETF', label: 'ETF' },
];

const FILTER_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'STOCK', label: 'Stock' },
  { id: 'ETF', label: 'ETF' },
  { id: 'INDEX', label: 'Index' },
  { id: 'FUTURE', label: 'Future' },
];

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '20px 24px',
};

export default function InstrumentsCatalog({
  restUrl,
  token,
  onSubscribe,
  onUnsubscribe,
  onSubscriptionsChange,
}) {
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchSecType, setSearchSecType] = useState('STK');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchSuccess, setSearchSuccess] = useState(null);

  const [activeInstruments, setActiveInstruments] = useState([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');

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
    if (typeFilter === 'ALL') return activeInstruments;
    return activeInstruments.filter((i) => i.asset_type === typeFilter);
  }, [activeInstruments, typeFilter]);

  const tabCounts = useMemo(() => {
    const counts = { ALL: activeInstruments.length };
    for (const tab of FILTER_TABS) {
      if (tab.id === 'ALL') continue;
      counts[tab.id] = activeInstruments.filter((i) => i.asset_type === tab.id).length;
    }
    return counts;
  }, [activeInstruments]);

  const handleSearchAndAdd = async (e) => {
    e?.preventDefault();
    if (!searchSymbol.trim()) return;
    if (!token) {
      setSearchError('Please log in to add instruments.');
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setSearchSuccess(null);
    const querySymbol = searchSymbol.trim().toUpperCase();

    try {
      const searchRes = await fetch(
        `${restUrl}/instruments/search?symbol=${encodeURIComponent(querySymbol)}&sec_type=${searchSecType}`
      );
      if (!searchRes.ok) {
        const err = await searchRes.json();
        throw new Error(err.detail || `Symbol ${querySymbol} not found`);
      }
      const hit = await searchRes.json();

      const exists = activeInstruments.some((i) => i.symbol === hit.symbol);
      if (exists) {
        setSearchError(`${hit.symbol} is already in the active stream list.`);
        return;
      }

      const subRes = await fetch(`${restUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instrument_id: hit.instrument_id }),
      });
      if (!subRes.ok) {
        const err = await subRes.json();
        throw new Error(err.detail || 'Failed to add instrument to stream catalog');
      }

      onSubscribe?.(hit);
      onSubscriptionsChange?.();
      setSearchSuccess(`Added ${hit.symbol} to streaming catalog.`);
      setSearchSymbol('');
      await fetchActiveInstruments();
    } catch (err) {
      setSearchError(err.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRemove = async (row) => {
    if (!token) return;
    if (!row.instrument_id) {
      alert('Cannot remove: instrument not linked in Security Master.');
      return;
    }
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
      {/* Header */}
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
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 16px', borderRadius: '8px',
          }}
        >
          <RefreshCw size={14} style={{ animation: loadingActive ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Search & Add */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 16px' }}>
          Search &amp; Add Instruments
        </h3>
        <form onSubmit={handleSearchAndAdd} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value)}
            placeholder="Search for AAPL, SPX, NVDA, ESU26..."
            style={{
              flex: '1 1 280px', minWidth: '200px',
              background: 'var(--bg-input)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)',
              fontSize: '13px', outline: 'none',
            }}
          />
          <select
            value={searchSecType}
            onChange={(e) => setSearchSecType(e.target.value)}
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '10px 14px', color: 'var(--text-primary)',
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            {SEARCH_TYPES.map((t) => (
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
        {searchSuccess && (
          <p style={{ color: 'var(--green)', fontSize: '12px', margin: '12px 0 0' }}>{searchSuccess}</p>
        )}
      </div>

      {/* Active Instruments */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>
            Active Instruments ({activeInstruments.length})
          </h3>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn-tab ${typeFilter === tab.id ? 'active' : ''}`}
                onClick={() => setTypeFilter(tab.id)}
                style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '20px' }}
              >
                {tab.label} ({tabCounts[tab.id] ?? 0})
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
                    No active instruments. Search above to add symbols to the stream catalog.
                  </td>
                </tr>
              ) : (
                filteredActive.map((row) => (
                  <tr
                    key={`${row.con_id}-${row.symbol}`}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
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
