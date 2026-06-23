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
        expiry = parse_futures_expiry(symbol)
        local = instrument.local_symbol or symbol
        root = re.match(r"^([A-Z0-9]+)", local)
        root_sym = root.group(1) if root else local
        fut = Future(
            symbol=root_sym,
            lastTradeDateOrContractMonth=expiry,
            exchange=exchange,
            currency=instrument.currency or "USD",
        )
        if instrument.local_symbol:
            fut.localSymbol = instrument.local_symbol
        return fut
    return Stock(symbol, exchange, instrument.currency or "USD")


def parse_futures_expiry(contract_symbol: str) -> str:
    """Parse ESU26 -> 202609 (YYYYMM)."""
    match = re.match(r"^[A-Z0-9]+([FGHJKMNQUVXZ])(\d{2})$", contract_symbol.upper())
    if not match:
        return ""
    month_code, year_suffix = match.groups()
    month = MONTH_CODES.index(month_code) + 1
    year = 2000 + int(year_suffix)
    return f"{year}{month:02d}"


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
        contract = build_ib_contract(instrument)
        details_list = await ib.reqContractDetailsAsync(contract)
        if not details_list:
            qualified = await ib.qualifyContractsAsync(contract)
            if not qualified:
                logger.warning(f"No contract details for {instrument.symbol}")
                return None
            contract = qualified[0]
        else:
            contract = details_list[0].contract

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
