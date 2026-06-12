import io

import pandas as pd


NASDAQ_SAMPLE = """Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N
QQQ|Invesco QQQ Trust, Series 1|G|N|N|100|Y|N
File Creation Time: 06-11-2026
"""

OTHER_SAMPLE = """ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
IBM|International Business Machines|N|IBM|N|100|N|IBM
File Creation Time: 06-11-2026
"""


def _parse_pipe(text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text), sep="|")
    return df[~df.iloc[:, 0].astype(str).str.contains("File Creation Time", na=False)]


def test_parse_nasdaq_etf_detection():
    df = _parse_pipe(NASDAQ_SAMPLE)
    rows = []
    for _, r in df.iterrows():
        etf = str(r.get("ETF", "N")).strip().upper()
        asset_type = "ETF" if etf == "Y" else "STOCK"
        rows.append({"symbol": r["Symbol"], "asset_type": asset_type})
    assert {"symbol": "AAPL", "asset_type": "STOCK"} in rows
    assert {"symbol": "QQQ", "asset_type": "ETF"} in rows


def test_parse_other_listed():
    df = _parse_pipe(OTHER_SAMPLE)
    assert len(df) == 1
    assert df.iloc[0]["ACT Symbol"] == "IBM"
