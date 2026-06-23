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
        exchange = instrument.exchange or "CME"
        fut = Future(
            symbol=root_sym,
            lastTradeDateOrContractMonth=expiry,
            exchange=exchange,
            currency=instrument.currency or "USD",
        )
        fut.localSymbol = local
        fut.tradingClass = root_sym
        return fut
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
    "CME": ["CME", "GLOBEX"],
    "CBOT": ["CBOT", "ECBOT"],
    "NYMEX": ["NYMEX"],
    "COMEX": ["COMEX"],
}


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
            details_list = await ib.reqContractDetailsAsync(candidate)
            if details_list:
                contract = details_list[0].contract
                break
            qualified = await ib.qualifyContractsAsync(candidate)
            if qualified:
                contract = qualified[0]
                break

        if not contract:
            logger.warning(f"No contract details for {instrument.symbol}")
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
    base = build_ib_contract(instrument)
    variants: list[Contract] = [base]
    if instrument.asset_type.upper() != "FUTURE":
        return variants

    local = (instrument.local_symbol or instrument.symbol).upper()
    root_sym, expiry = parse_futures_contract_symbol(local)
    if not expiry:
        return variants

    primary_exchange = (instrument.exchange or "CME").upper()
    seen: set[tuple[str, str, str]] = set()

    def add_variant(exchange: str) -> None:
        key = (root_sym, expiry, exchange)
        if key in seen:
            return
        seen.add(key)
        fut = Future(
            symbol=root_sym,
            lastTradeDateOrContractMonth=expiry,
            exchange=exchange,
            currency=instrument.currency or "USD",
        )
        fut.localSymbol = local
        fut.tradingClass = root_sym
        variants.append(fut)

    for exchange in FUTURES_EXCHANGE_FALLBACKS.get(primary_exchange, [primary_exchange]):
        add_variant(exchange)

    return variants
