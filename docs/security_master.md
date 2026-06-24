# Security Master runbook

## Overview

PostgreSQL is the **source of truth** for tradable instruments. ClickHouse `instruments` is a read replica synced via Kafka `security_master_updates`.

## Reset streaming (IB ticker limit / too many active instruments)

IB paper accounts cap simultaneous market data lines (~100). Bulk `resolve_conids` used to mark every resolved stock as streaming.

```bash
docker exec quant_backend python -m scripts.reset_streaming_catalog
docker restart quant_backend
```

Edit `DEFAULT_STREAM_SYMBOLS` in `docker/.env` to control the seed list (default: AAPL, MSFT, NVDA, TSLA, SPX, NDX, etc.).

User **Subscribe** in the UI adds one instrument at a time to the streaming catalog.

## Resolve IBKR contract IDs

```bash
# All unresolved (indexes first, then futures, then stocks)
docker exec quant_backend python -m scripts.resolve_all

# By asset type
docker exec quant_backend python -m scripts.resolve_indexes   # DJI -> INDU, etc.
docker exec quant_backend python -m scripts.resolve_futures    # ESU26, NQU26, ...
docker exec quant_backend python -m scripts.resolve_instrument 4  # single id

curl -X POST https://spikeiq.chickenkiller.com/api/instruments/resolve-pending
```

**Index aliases:** `DJI` / `DOW` / `DJIA` resolve to IB symbol `INDU` on CME. `SPX`→`ES` only when searching **Future** type.

## Manual sync commands

```bash
# From project root with DATABASE_URL set
python -m scripts.sync_indexes
python -m scripts.sync_priority_streaming
python -m scripts.sync_stocks
python -m scripts.sync_futures
python -m scripts.resolve_conids

# Docker (after deploy)
docker exec quant_backend python -m scripts.sync_indexes
docker exec quant_backend python -m scripts.sync_priority_streaming
docker exec quant_backend python -m scripts.sync_stocks
docker exec quant_backend python -m scripts.sync_futures
docker exec quant_scheduler python -m scripts.resolve_conids

# Preferred: reuse backend IB session (no client-id conflict)
curl -X POST https://spikeiq.chickenkiller.com/api/instruments/resolve-pending
```

## Autonomous streaming

All rows in ClickHouse `instruments` with `is_active = 1` are streamed automatically on backend startup.
User **Subscribe** adds additional instruments via `user_subscriptions` → Kafka → IB.

Priority catalog seeds (also synced to ClickHouse when resolved):

| Symbol | Name | Type |
|--------|------|------|
| NDX | NASDAQ 100 Index | INDEX |
| COMP | NASDAQ Composite Index | INDEX |
| SPCX | Space Exploration Technologies Corp. (SpaceX) | STOCK |

Edit `data/priority_streaming.csv` to add more priority stream targets.

## Scheduled jobs (scheduler container)

| Time (ET) | Job |
|-----------|-----|
| Daily 03:00 | sync_stocks.py |
| Daily 03:05 | sync_priority_streaming.py |
| Daily 03:15 | sync_futures.py |
| Daily 03:30 | resolve_conids.py |
| Sunday 03:00 | sync_indexes.py |
| Sunday 03:05 | sync_priority_streaming.py |

## IB Gateway requirements

- Set `IB_HOST` and `IB_PORT` in environment (Docker: `ib-gateway:4004`)
- `resolve_conids.py` only processes rows where `ibkr_conid IS NULL`
- Already-resolved instruments are never re-resolved

## API endpoints

- `GET /api/instruments` — paginated catalog
- `GET /api/instruments/search?symbol=` — catalog first, IBKR on miss
- `POST /api/subscriptions` — `{ "instrument_id": 123 }`

## Troubleshooting

1. **Unresolved instruments**: Ensure IB Gateway is connected; run `resolve_conids.py`
2. **Empty catalog**: Run `sync_indexes.py` then `sync_stocks.py`
3. **PostgreSQL connection**: Check `DATABASE_URL` and postgres container health
