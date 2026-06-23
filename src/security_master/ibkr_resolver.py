import re
from dataclasses import dataclass
from datetime import date

from ib_insync import IB, Contract, Future, Index, Stock
from loguru import logger

# CME month codes: F=Jan ... Z=Dec
MONTH_CODES = "FGHJKMNQUVXZ"
QUARTERLY_MONTHS = {3, 6, 9, 12}  # H, M, U, Z
QUARTERLY_ROOTS = {"ES", "MES", "NQ", "MNQ", "RTY", "YM", "ZN", "ZT"}

# Index / colloquial names -> primary CME futures root (SPX is an index; /ES is the future).
INDEX_FUTURES_ALIASES: dict[str, str] = {
    "SPX": "ES",
    "S&P": "ES",
    "SNP": "ES",
    "NDX": "NQ",
    "NASDAQ": "NQ",
    "NDAQ": "NQ",
    "NAS100": "NQ",
    "COMP": "NQ",
    "DOW": "YM",
    "DJIA": "YM",
}


def normalize_asset_type(asset_type: str | None, sec_type: str | None = None) -> str:
    """Map API sec_type / asset_type values to canonical STOCK|ETF|INDEX|FUTURE."""
    raw = (asset_type or sec_type or "STK").upper()
    if raw in ("STOCK", "STK"):
        return "STOCK"
    if raw in ("ETF",):
        return "ETF"
    if raw in ("INDEX", "IND"):
        return "INDEX"
    if raw in ("FUTURE", "FUT"):
        return "FUTURE"
    return "STOCK"


def resolve_futures_root(query: str) -> str:
    """Return the futures product root for a search query (e.g. SPX -> ES)."""
    clean = query.strip().upper().lstrip("/")
    return INDEX_FUTURES_ALIASES.get(clean, clean)


@dataclass
class ResolvedContract:
    ibkr_conid: int
    local_symbol: str | None
    exchange: str | None
    currency: str | None
    symbol: str


def build_ib_contract(instrument) -> Contract:
    """Build an IB contract from a Security Master instrument row."""
    asset_type = instrument.asset_type.upper()
    symbol = instrument.symbol.upper()
    exchange = instrument.exchange or "SMART"

    if asset_type in ("STOCK", "ETF"):
        return Stock(symbol, "SMART", instrument.currency or "USD")
    if asset_type == "INDEX":
        return Index(symbol, exchange, instrument.currency or "USD")
    if asset_type == "FUTURE":
        local = (instrument.local_symbol or symbol).upper()
        root_sym, expiry = parse_futures_contract_symbol(local)
        if not expiry and local != symbol:
            root_sym, expiry = parse_futures_contract_symbol(symbol)
        exchange = instrument.exchange or "GLOBEX"
        return Future(
            symbol=root_sym,
            lastTradeDateOrContractMonth=expiry,
            exchange=exchange,
            currency=instrument.currency or "USD",
        )
    return Stock(symbol, exchange, instrument.currency or "USD")


def parse_futures_contract_symbol(contract_symbol: str) -> tuple[str, str]:
    """Parse ESU26 -> (ES, 202609). Returns (symbol, '') when pattern does not match."""
    sym = contract_symbol.upper().strip()
    match = re.match(r"^(.+?)([FGHJKMNQUVXZ])(\d{2})$", sym)
    if not match:
        return sym, ""
    root, month_code, year_suffix = match.groups()
    month = MONTH_CODES.index(month_code) + 1
    year = 2000 + int(year_suffix)
    return root, f"{year}{month:02d}"


def parse_futures_expiry(contract_symbol: str) -> str:
    """Parse ESU26 -> 202609 (YYYYMM)."""
    _, expiry = parse_futures_contract_symbol(contract_symbol)
    return expiry


FUTURES_EXCHANGE_FALLBACKS: dict[str, list[str]] = {
    "CME": ["GLOBEX", "CME"],
    "CBOT": ["ECBOT", "CBOT"],
    "NYMEX": ["NYMEX"],
    "COMEX": ["COMEX"],
}


async def _qualify_contract(ib: IB, candidate: Contract) -> Contract | None:
    try:
        details_list = await ib.reqContractDetailsAsync(candidate)
        if details_list:
            return details_list[0].contract
        qualified = await ib.qualifyContractsAsync(candidate)
        if qualified:
            return qualified[0]
    except Exception as e:
        logger.debug(f"IB qualify failed for {candidate}: {e}")
    return None


async def _resolve_future_via_matching_symbols(
    ib: IB, local: str, root_sym: str
) -> Contract | None:
    """Fallback: search IB symbol directory for the exact futures local symbol."""
    try:
        descriptions = await ib.reqMatchingSymbolsAsync(local)
    except Exception as e:
        logger.debug(f"reqMatchingSymbols failed for {local}: {e}")
        return None

    local_upper = local.upper()
    best: Contract | None = None
    for desc in descriptions:
        c = desc.contract
        if (c.secType or "").upper() != "FUT":
            continue
        ls = (getattr(c, "localSymbol", None) or "").upper()
        sym = (getattr(c, "symbol", None) or "").upper()
        if ls != local_upper and sym != root_sym:
            continue
        qualified = await _qualify_contract(ib, c)
        if not qualified:
            continue
        if (getattr(qualified, "localSymbol", None) or "").upper() == local_upper:
            return qualified
        if best is None:
            best = qualified
    return best


def generate_futures_contracts(
    product_root: str, exchange: str, name: str, months_ahead: int = 12
) -> list[dict]:
    """Generate active futures contract rows for the next N calendar months."""
    rows = []
    today = date.today()
    for i in range(months_ahead):
        m = today.month + i
        y = today.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        if m not in QUARTERLY_MONTHS and product_root in QUARTERLY_ROOTS:
            continue
        month_code = MONTH_CODES[m - 1]
        year_suffix = str(y)[-2:]
        sym = f"{product_root}{month_code}{year_suffix}"
        rows.append(
            {
                "symbol": sym,
                "name": f"{name} ({sym})",
                "asset_type": "FUTURE",
                "exchange": exchange,
                "currency": "USD",
                "local_symbol": sym,
                "is_active": True,
            }
        )
    return rows


async def resolve_instrument(ib: IB, instrument) -> ResolvedContract | None:
    """Resolve IBKR contract details for an instrument. Never overwrites existing conid."""
    if instrument.ibkr_conid is not None:
        return ResolvedContract(
            ibkr_conid=instrument.ibkr_conid,
            local_symbol=instrument.local_symbol,
            exchange=instrument.exchange,
            currency=instrument.currency,
            symbol=instrument.symbol,
        )

    try:
        contracts = _resolution_contract_variants(instrument)
        contract = None
        for candidate in contracts:
            contract = await _qualify_contract(ib, candidate)
            if contract:
                break

        if not contract and instrument.asset_type.upper() == "FUTURE":
            local = (instrument.local_symbol or instrument.symbol).upper()
            root_sym, _ = parse_futures_contract_symbol(local)
            contract = await _resolve_future_via_matching_symbols(ib, local, root_sym)

        if not contract:
            logger.warning(
                f"No contract details for {instrument.symbol} "
                f"(asset_type={instrument.asset_type}, exchange={instrument.exchange})"
            )
            return None

        return ResolvedContract(
            ibkr_conid=contract.conId,
            local_symbol=getattr(contract, "localSymbol", None) or instrument.local_symbol,
            exchange=contract.exchange or instrument.exchange,
            currency=contract.currency or instrument.currency or "USD",
            symbol=instrument.symbol,
        )
    except Exception as e:
        logger.error(f"Failed to resolve {instrument.symbol}: {e}")
        return None


def _resolution_contract_variants(instrument) -> list[Contract]:
    """Build IB contract candidates, including futures exchange fallbacks."""
    if instrument.asset_type.upper() != "FUTURE":
        return [build_ib_contract(instrument)]

    local = (instrument.local_symbol or instrument.symbol).upper()
    root_sym, expiry = parse_futures_contract_symbol(local)
    if not expiry:
        return [build_ib_contract(instrument)]

    currency = instrument.currency or "USD"
    primary_exchange = (instrument.exchange or "CME").upper()
    variants: list[Contract] = []
    seen: set[str] = set()

    def add(candidate: Contract) -> None:
        key = repr(candidate)
        if key in seen:
            return
        seen.add(key)
        variants.append(candidate)

    # 1) Local symbol on GLOBEX/CME (most reliable for CME equity index futures)
    for exchange in ("GLOBEX", "CME", "", primary_exchange):
        fut = Future(localSymbol=local, currency=currency)
        if exchange:
            fut.exchange = exchange
        add(fut)

    # 2) Root + expiry across exchange aliases
    for exchange in FUTURES_EXCHANGE_FALLBACKS.get(primary_exchange, [primary_exchange, "GLOBEX"]):
        add(
            Future(
                symbol=root_sym,
                lastTradeDateOrContractMonth=expiry,
                exchange=exchange,
                currency=currency,
            )
        )
        fut = Future(
            symbol=root_sym,
            lastTradeDateOrContractMonth=expiry,
            exchange=exchange,
            currency=currency,
        )
        fut.localSymbol = local
        add(fut)

    add(build_ib_contract(instrument))
    return variants
