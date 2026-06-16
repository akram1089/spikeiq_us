from ib_insync import *
import asyncio
from datetime import datetime, timezone
from typing import Dict, Set
from loguru import logger
import math
from src.db.clickhouse_client import ch_manager
from src.db.postgres import SessionLocal
from src.security_master.models import Instrument
from src.security_master.repository import InstrumentRepository

class MarketDataService:
    """Streams live market data to Kafka; IB subscriptions keyed by instrument_id."""

    def __init__(self, ib: IB):
        self.ib = ib
        self.websockets: Dict[str, Set] = {}
        self.cache: Dict[int, dict] = {}
        self.contracts: Dict[int, Contract] = {}
        self.tickers: Dict[int, Ticker] = {}
        self.instrument_meta: Dict[int, dict] = {}
        self.symbol_to_id: Dict[str, int] = {}
        self.always_stream: Set[int] = set()
        self.active = False
        self._loop = None

    def _cache_for(self, instrument_id: int) -> dict:
        if instrument_id not in self.cache:
            self.cache[instrument_id] = {
                "last": None, "bid": None, "ask": None, "volume": None, "close": None
            }
        return self.cache[instrument_id]

    def _load_instrument_meta(self, instrument_id: int) -> dict | None:
        if instrument_id in self.instrument_meta:
            return self.instrument_meta[instrument_id]
        db = SessionLocal()
        try:
            repo = InstrumentRepository(db)
            inst = repo.get_by_id(instrument_id)
            if not inst or not inst.ibkr_conid:
                return None
            meta = {
                "instrument_id": inst.id,
                "symbol": inst.symbol,
                "ibkr_conid": inst.ibkr_conid,
                "exchange": inst.exchange or "SMART",
                "currency": inst.currency or "USD",
            }
            self.instrument_meta[instrument_id] = meta
            self.symbol_to_id[inst.symbol.upper()] = instrument_id
            return meta
        finally:
            db.close()

    def _register_stream_instrument(self, inst: Instrument) -> None:
        self.always_stream.add(inst.id)
        self.instrument_meta[inst.id] = {
            "instrument_id": inst.id,
            "symbol": inst.symbol,
            "ibkr_conid": inst.ibkr_conid,
            "exchange": inst.exchange or "SMART",
            "currency": inst.currency or "USD",
        }
        self.symbol_to_id[inst.symbol.upper()] = inst.id

    async def _load_autonomous_stream_catalog(self):
        """Load active instruments from ClickHouse catalog for autonomous streaming."""
        catalog_rows: list[dict] = []
        try:
            catalog_rows = ch_manager.list_active_instruments()
            logger.info(
                f"Loaded {len(catalog_rows)} active instrument(s) from ClickHouse catalog"
            )
        except Exception as e:
            logger.error(f"Failed to load stream catalog from ClickHouse: {e}")

        db = SessionLocal()
        try:
            repo = InstrumentRepository(db)
            if not catalog_rows:
                logger.warning(
                    "ClickHouse catalog empty; falling back to PostgreSQL active resolved instruments"
                )
                for inst in repo.list_active_resolved():
                    self._register_stream_instrument(inst)
                return

            registered = 0
            for row in catalog_rows:
                inst = repo.get_by_ibkr_conid(row["con_id"]) or repo.get_by_symbol(row["symbol"])
                if inst and inst.ibkr_conid and inst.is_active:
                    self._register_stream_instrument(inst)
                    registered += 1
                else:
                    logger.warning(
                        f"Catalog symbol {row['symbol']} (con_id={row['con_id']}) "
                        "not found or unresolved in PostgreSQL"
                    )
            logger.info(f"Registered {registered} instrument(s) for autonomous streaming")
        finally:
            db.close()

    async def ensure_autonomous_streaming(self, force_resubscribe: bool = False):
        """Start or restore IB subscriptions for all active ClickHouse catalog instruments."""
        await self._load_autonomous_stream_catalog()

        if not self.ib.isConnected():
            logger.warning(
                f"IB not connected; {len(self.always_stream)} instrument(s) queued for streaming"
            )
            return

        self._loop = asyncio.get_event_loop()
        self.active = True

        if force_resubscribe:
            self._clear_ib_subscriptions()

        for instrument_id in sorted(self.always_stream):
            await self._subscribe_to_instrument(instrument_id)

        logger.success(
            f"Autonomous streaming active for {len(self.always_stream)} instrument(s)"
        )

    async def ensure_subscriptions(self):
        await self.ensure_autonomous_streaming(force_resubscribe=True)

    def _clear_ib_subscriptions(self):
        for iid, ticker in list(self.tickers.items()):
            try:
                ticker.updateEvent.clear()
                if iid in self.contracts:
                    self.ib.cancelMktData(self.contracts[iid])
            except Exception:
                pass
        self.tickers.clear()
        self.contracts.clear()

    def stop(self):
        if not self.active:
            return
        logger.info("Stopping MarketDataService...")
        self._clear_ib_subscriptions()
        self.active = False
        logger.success("MarketDataService stopped.")

    async def _subscribe_to_instrument(self, instrument_id: int):
        if instrument_id in self.contracts:
            return
        meta = self._load_instrument_meta(instrument_id)
        if not meta:
            logger.error(f"No metadata for instrument_id={instrument_id}")
            return
        try:
            contract = Contract(conId=int(meta["ibkr_conid"]))
            qualified = await self.ib.qualifyContractsAsync(contract)
            if not qualified:
                logger.error(f"Failed to qualify conId={meta['ibkr_conid']} for id={instrument_id}")
                return
            contract = qualified[0]
            self.contracts[instrument_id] = contract
            ticker = self.ib.reqMktData(contract, "", False, False)
            ticker.updateEvent += lambda t, i=instrument_id: self._on_ticker_update(i, t)
            self.tickers[instrument_id] = ticker
            self._cache_for(instrument_id)
            logger.success(
                f"IB market data subscription active: {meta['symbol']} (id={instrument_id})"
            )
        except Exception as e:
            logger.error(f"Error subscribing to instrument_id={instrument_id}: {e}")

    def request_streaming(self, instrument_id: int):
        """Add an instrument to the always-on pipeline."""
        self.always_stream.add(instrument_id)
        self._load_instrument_meta(instrument_id)
        self._cache_for(instrument_id)
        if self._loop and self.ib.isConnected():
            asyncio.run_coroutine_threadsafe(
                self._subscribe_to_instrument(instrument_id), self._loop
            )

    def request_streaming_by_symbol(self, symbol: str):
        """Backward-compatible symbol-based streaming."""
        symbol = symbol.upper()
        iid = self.symbol_to_id.get(symbol)
        if iid:
            self.request_streaming(iid)
            return
        db = SessionLocal()
        try:
            repo = InstrumentRepository(db)
            inst = repo.get_by_symbol(symbol)
            if inst and inst.ibkr_conid:
                self.request_streaming(inst.id)
        finally:
            db.close()

    def register_websocket(self, symbol: str, websocket):
        symbol = symbol.upper()
        if symbol not in self.websockets:
            self.websockets[symbol] = set()
        if websocket is not None:
            self.websockets[symbol].add(websocket)
        self.request_streaming_by_symbol(symbol)
        logger.info(f"Registered WebSocket client for {symbol}")

    def unregister_websocket(self, symbol: str, websocket):
        if symbol not in self.websockets or websocket not in self.websockets[symbol]:
            return
        self.websockets[symbol].remove(websocket)
        logger.info(f"Unregistered WebSocket client for {symbol}")
        if not self.websockets[symbol]:
            del self.websockets[symbol]

    def _on_ticker_update(self, instrument_id: int, ticker: Ticker):
        meta = self.instrument_meta.get(instrument_id) or self._load_instrument_meta(instrument_id)
        if not meta or instrument_id not in self.contracts:
            return

        symbol = meta["symbol"]
        loop = self._loop

        def _safe_float(val):
            if val is None:
                return None
            try:
                return None if math.isnan(val) else float(val)
            except Exception:
                return None

        new_last = _safe_float(ticker.last)
        new_bid = _safe_float(ticker.bid)
        new_ask = _safe_float(ticker.ask)
        new_close = _safe_float(ticker.close)

        cache = self._cache_for(instrument_id)

        if (
            new_last == cache.get("last")
            and new_bid == cache.get("bid")
            and new_ask == cache.get("ask")
        ):
            return

        if new_last is not None:
            cache["last"] = new_last
        if new_bid is not None:
            cache["bid"] = new_bid
        if new_ask is not None:
            cache["ask"] = new_ask
        if new_close is not None:
            cache["close"] = new_close

        vol = ticker.volume
        if vol is not None:
            try:
                if not math.isnan(vol):
                    cache["volume"] = int(vol)
            except Exception:
                pass

        ts = ticker.time
        if ts:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            ts_str = (
                ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")
                + f"{ts.microsecond // 1000:03d}Z"
            )
        else:
            now = datetime.now(timezone.utc)
            ts_str = (
                now.strftime("%Y-%m-%dT%H:%M:%S.")
                + f"{now.microsecond // 1000:03d}Z"
            )

        try:
            contract = self.contracts.get(instrument_id)
            con_id = contract.conId if contract else meta["ibkr_conid"]
            exchange = contract.exchange if contract else meta["exchange"]

            def _safe_int(val):
                try:
                    return int(val) if val and not math.isnan(val) else 0
                except Exception:
                    return 0

            bid_price_1 = cache.get("bid") or 0.0
            ask_price_1 = cache.get("ask") or 0.0
            bid_qty_1 = _safe_int(ticker.bidSize)
            ask_qty_1 = _safe_int(ticker.askSize)
            open_price = _safe_float(ticker.open) or 0.0
            high_price = _safe_float(ticker.high) or 0.0
            low_price = _safe_float(ticker.low) or 0.0
            close_price = cache.get("close") or 0.0
            ltp = cache.get("last") or 0.0
            volume = cache.get("volume") or 0
            oi = _safe_int(ticker.callOpenInterest or ticker.putOpenInterest or 0)
            change = round(ltp - close_price, 4) if ltp and close_price else 0.0

            kafka_msg = {
                "instrument_id": instrument_id,
                "instrument_token": con_id,
                "symbol": symbol,
                "exchange": exchange,
                "ltp": ltp,
                "volume": volume,
                "buy_quantity": bid_qty_1,
                "sell_quantity": ask_qty_1,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "change": change,
                "oi": oi,
                "bid_price_1": bid_price_1,
                "bid_qty_1": bid_qty_1,
                "ask_price_1": ask_price_1,
                "ask_qty_1": ask_qty_1,
                "bid_price_2": 0, "bid_qty_2": 0,
                "bid_price_3": 0, "bid_qty_3": 0,
                "bid_price_4": 0, "bid_qty_4": 0,
                "bid_price_5": 0, "bid_qty_5": 0,
                "ask_price_2": 0, "ask_qty_2": 0,
                "ask_price_3": 0, "ask_qty_3": 0,
                "ask_price_4": 0, "ask_qty_4": 0,
                "ask_price_5": 0, "ask_qty_5": 0,
                "ts": ts_str,
            }
            from src.queue.kafka_producer import kafka_producer
            kafka_producer.publish("market-ticks", str(con_id), kafka_msg)
        except Exception as ke:
            logger.error(f"Failed to publish tick to Kafka: {ke}")

        contract = self.contracts.get(instrument_id)
        con_id = contract.conId if contract else meta.get("ibkr_conid", 0)
        ltp = cache.get("last") or 0.0
        close_price = cache.get("close") or 0.0
        change = (
            round(((ltp - close_price) / close_price) * 100, 4)
            if ltp and close_price
            else 0.0
        )

        msg = {
            "type": "tick",
            "data": {
                "instrument_id": instrument_id,
                "instrument_token": int(con_id or 0),
                "symbol": symbol,
                "ltp": ltp,
                "close": close_price,
                "change": change,
                "bid": cache.get("bid"),
                "ask": cache.get("ask"),
                "volume": cache.get("volume"),
                "ts": ts_str,
            },
        }

        ws_clients = self.websockets.get(symbol, set())
        if not loop or not ws_clients:
            return

        for ws in list(ws_clients):
            if ws is not None:
                try:
                    asyncio.run_coroutine_threadsafe(ws.send_json(msg), loop)
                except Exception as e:
                    logger.warning(f"Failed to broadcast tick to WebSocket: {e}")
