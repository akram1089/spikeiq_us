import scripts._bootstrap  # noqa: F401

import io
import urllib.request

import pandas as pd
from loguru import logger

from src.db.postgres import SessionLocal
from src.security_master.mappers import publish_instrument_event
from src.security_master.repository import InstrumentRepository

NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

EXCHANGE_MAP = {
    "N": "NYSE",
    "A": "AMEX",
    "P": "ARCA",
    "Z": "BATS",
    "V": "IEXG",
}

# Ensured in catalog before NASDAQ symdir sync (e.g. recent IPOs)
PRIORITY_STOCKS = [
    ("SPCX", "Space Exploration Technologies Corp.", "NASDAQ"),
]


def download_text(url: str) -> str:
    logger.info(f"Downloading {url}")
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_pipe_file(text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text), sep="|")
    df = df[~df.iloc[:, 0].astype(str).str.contains("File Creation Time", na=False)]
    return df


def normalize_nasdaq(df: pd.DataFrame) -> list[dict]:
    rows = []
    for _, r in df.iterrows():
        symbol = str(r.get("Symbol", "")).strip().upper()
        if not symbol or symbol == "NAN":
            continue
        name = str(r.get("Security Name", symbol)).strip()
        etf_flag = str(r.get("ETF", "N")).strip().upper()
        asset_type = "ETF" if etf_flag == "Y" else "STOCK"
        rows.append(
            {
                "symbol": symbol,
                "name": name,
                "asset_type": asset_type,
                "exchange": "NASDAQ",
                "currency": "USD",
                "is_active": True,
            }
        )
    return rows


def normalize_other(df: pd.DataFrame) -> list[dict]:
    rows = []
    for _, r in df.iterrows():
        symbol = str(r.get("ACT Symbol", r.get("NASDAQ Symbol", ""))).strip().upper()
        if not symbol or symbol == "NAN":
            continue
        name = str(r.get("Security Name", symbol)).strip()
        exchange_code = str(r.get("Exchange", "N")).strip().upper()
        exchange = EXCHANGE_MAP.get(exchange_code, exchange_code)
        etf_flag = str(r.get("ETF", "N")).strip().upper()
        asset_type = "ETF" if etf_flag == "Y" else "STOCK"
        rows.append(
            {
                "symbol": symbol,
                "name": name,
                "asset_type": asset_type,
                "exchange": exchange,
                "currency": "USD",
                "is_active": True,
            }
        )
    return rows


def main() -> None:
    logger.info("Starting stock sync from NASDAQ symdir files...")
    nasdaq_df = parse_pipe_file(download_text(NASDAQ_URL))
    other_df = parse_pipe_file(download_text(OTHER_URL))
    all_rows = normalize_nasdaq(nasdaq_df) + normalize_other(other_df)
    logger.info(f"Parsed {len(all_rows)} stock/ETF rows")

    db = SessionLocal()
    try:
        repo = InstrumentRepository(db)
        inserted = 0
        updated = 0
        for symbol, name, exchange in PRIORITY_STOCKS:
            inst, created = repo.upsert_by_symbol(
                {
                    "symbol": symbol,
                    "name": name,
                    "asset_type": "STOCK",
                    "exchange": exchange,
                    "currency": "USD",
                    "is_active": True,
                }
            )
            if created:
                inserted += 1
                publish_instrument_event(inst, "CREATE")
            else:
                updated += 1
                publish_instrument_event(inst, "UPDATE")
        for row in all_rows:
            inst, created = repo.upsert_by_symbol(row)
            if created:
                inserted += 1
                publish_instrument_event(inst, "CREATE")
            else:
                updated += 1
                publish_instrument_event(inst, "UPDATE")
        logger.success(f"Stock sync complete: inserted={inserted}, updated={updated}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
