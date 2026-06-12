import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Chip,
  Button,
  TextField,
  Typography,
  Stack,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#3b82f6' },
    background: { default: '#0a0e17', paper: '#111827' },
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
  },
});

const ASSET_FILTERS = ['ALL', 'STOCK', 'ETF', 'INDEX', 'FUTURE'];

export default function InstrumentsCatalog({ restUrl, token, subscribedIds, onSubscribe, onUnsubscribe, onSubscriptionsChange }) {
  const [rows, setRows] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [sortModel, setSortModel] = useState([{ field: 'symbol', sort: 'asc' }]);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const sort = sortModel[0] || { field: 'symbol', sort: 'asc' };
      const params = new URLSearchParams({
        page: String(paginationModel.page + 1),
        page_size: String(paginationModel.pageSize),
        sort_by: sort.field === 'instrument_id' ? 'id' : sort.field,
        sort_order: sort.sort || 'asc',
      });
      if (searchQ.trim()) params.set('q', searchQ.trim());
      if (assetFilter !== 'ALL') params.set('asset_type', assetFilter);

      const res = await fetch(`${restUrl}/instruments?${params}`);
      const data = await res.json();
      setRows(
        (data.items || []).map((item) => ({
          id: item.instrument_id,
          instrument_id: item.instrument_id,
          symbol: item.symbol,
          name: item.name,
          asset_type: item.asset_type,
          exchange: item.exchange || '—',
          currency: item.currency || 'USD',
          ibkr_conid: item.ibkr_conid,
          is_active: item.is_active,
          created_at: item.created_at,
        }))
      );
      setRowCount(data.total || 0);
    } catch (err) {
      console.error('Failed to load instrument catalog:', err);
    } finally {
      setLoading(false);
    }
  }, [restUrl, paginationModel, sortModel, searchQ, assetFilter]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const handleSubscribe = async (instrumentId) => {
    if (!token) return;
    try {
      const res = await fetch(`${restUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instrument_id: instrumentId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Subscription failed');
      }
      onSubscribe?.(instrumentId);
      onSubscriptionsChange?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUnsubscribe = async (instrumentId) => {
    if (!token) return;
    try {
      await fetch(`${restUrl}/subscriptions/${instrumentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onUnsubscribe?.(instrumentId);
      onSubscriptionsChange?.();
    } catch (err) {
      console.error(err);
    }
  };

  const columns = useMemo(
    () => [
      { field: 'symbol', headerName: 'Symbol', flex: 0.8, minWidth: 90 },
      { field: 'name', headerName: 'Name', flex: 1.5, minWidth: 180 },
      { field: 'asset_type', headerName: 'Asset Type', flex: 0.7, minWidth: 100 },
      { field: 'exchange', headerName: 'Exchange', flex: 0.7, minWidth: 90 },
      { field: 'currency', headerName: 'Currency', flex: 0.5, minWidth: 80 },
      {
        field: 'ibkr_conid',
        headerName: 'IBKR ConId',
        flex: 0.8,
        minWidth: 110,
        valueFormatter: (value) => (value != null ? value : '—'),
      },
      {
        field: 'status',
        headerName: 'Status',
        flex: 0.9,
        minWidth: 120,
        sortable: false,
        renderCell: (params) => {
          const id = params.row.instrument_id;
          if (subscribedIds?.has(id)) {
            return <Chip label="Subscribed" size="small" color="success" variant="outlined" />;
          }
          if (params.row.ibkr_conid == null) {
            return <Chip label="Unresolved" size="small" color="warning" variant="outlined" />;
          }
          return <Chip label="Available" size="small" variant="outlined" />;
        },
      },
      {
        field: 'created_at',
        headerName: 'Created',
        flex: 1,
        minWidth: 160,
        valueFormatter: (value) =>
          value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—',
      },
      {
        field: 'actions',
        headerName: 'Actions',
        flex: 0.8,
        minWidth: 120,
        sortable: false,
        renderCell: (params) => {
          const id = params.row.instrument_id;
          const subscribed = subscribedIds?.has(id);
          return (
            <Button
              size="small"
              variant={subscribed ? 'outlined' : 'contained'}
              color={subscribed ? 'error' : 'primary'}
              onClick={() => (subscribed ? handleUnsubscribe(id) : handleSubscribe(id))}
              disabled={!token}
            >
              {subscribed ? 'Unsubscribe' : 'Subscribe'}
            </Button>
          );
        },
      },
    ],
    [subscribedIds, token]
  );

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Security Master Catalog
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Searchable instrument catalog — {rowCount.toLocaleString()} total records
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            placeholder="Search symbol or name..."
            value={searchQ}
            onChange={(e) => {
              setSearchQ(e.target.value);
              setPaginationModel((m) => ({ ...m, page: 0 }));
            }}
            sx={{ minWidth: 260 }}
          />
          {ASSET_FILTERS.map((f) => (
            <Chip
              key={f}
              label={f === 'ALL' ? 'All Types' : f}
              onClick={() => {
                setAssetFilter(f);
                setPaginationModel((m) => ({ ...m, page: 0 }));
              }}
              color={assetFilter === f ? 'primary' : 'default'}
              variant={assetFilter === f ? 'filled' : 'outlined'}
              size="small"
            />
          ))}
        </Stack>

        <Box sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            rowCount={rowCount}
            loading={loading}
            pageSizeOptions={[10, 25, 50, 100]}
            paginationModel={paginationModel}
            paginationMode="server"
            onPaginationModelChange={setPaginationModel}
            sortingMode="server"
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            disableRowSelectionOnClick
            sx={{
              border: '1px solid rgba(255,255,255,0.08)',
              '& .MuiDataGrid-columnHeaders': { backgroundColor: '#1f2937' },
              '& .MuiDataGrid-cell': { borderColor: 'rgba(255,255,255,0.05)' },
            }}
          />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
