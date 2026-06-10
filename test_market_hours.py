import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))

from src.utils.market_hours import check_us_market_active

def test_market_hours(mock_time: datetime, expected: bool):
    with patch("src.utils.market_hours.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_time
        mock_datetime.side_effect = lambda *args, **kw: datetime(*args, **kw)
        
        result = check_us_market_active()
        status = "PASS" if result == expected else "FAIL"
        print(f"[{status}] Time (UTC): {mock_time.isoformat()} => Active? {result} (Expected: {expected})")

print("Testing Market Hours logic...")
# Note: Regular hours are 9:30 AM to 4:00 PM ET.
# In EDT (summer), ET is UTC-4.
# 9:30 AM EDT = 13:30 UTC
# 4:00 PM EDT = 20:00 UTC

# Summer (EDT - UTC-4) - Monday (weekday=0)
test_market_hours(datetime(2024, 7, 1, 12, 0, tzinfo=timezone.utc), False)  # 8:00 AM EDT (Pre-market)
test_market_hours(datetime(2024, 7, 1, 13, 30, tzinfo=timezone.utc), True)  # 9:30 AM EDT (Open)
test_market_hours(datetime(2024, 7, 1, 15, 0, tzinfo=timezone.utc), True)   # 11:00 AM EDT (Open)
test_market_hours(datetime(2024, 7, 1, 19, 59, tzinfo=timezone.utc), True)  # 3:59 PM EDT (Open)
test_market_hours(datetime(2024, 7, 1, 20, 0, tzinfo=timezone.utc), False)  # 4:00 PM EDT (Closed)

# Winter (EST - UTC-5) - Monday (weekday=0)
# 9:30 AM EST = 14:30 UTC
# 4:00 PM EST = 21:00 UTC
test_market_hours(datetime(2024, 1, 1, 14, 0, tzinfo=timezone.utc), False)  # 9:00 AM EST (Pre-market)
test_market_hours(datetime(2024, 1, 1, 14, 30, tzinfo=timezone.utc), True)  # 9:30 AM EST (Open)
test_market_hours(datetime(2024, 1, 1, 21, 0, tzinfo=timezone.utc), False)  # 4:00 PM EST (Closed)

# Weekend (Saturday)
test_market_hours(datetime(2024, 7, 6, 15, 0, tzinfo=timezone.utc), False)  # 11:00 AM EDT Saturday (Closed)
