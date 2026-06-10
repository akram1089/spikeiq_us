from datetime import datetime, timezone, timedelta

def check_us_market_active() -> bool:
    """
    Returns True if the US market is currently open for regular trading 
    session (9:30 AM to 4:00 PM ET, Monday through Friday).
    """
    now_utc = datetime.now(timezone.utc)
    
    # Determine if we're in EDT (approx Mar-Nov) or EST
    month = now_utc.month
    is_edt = 3 <= month <= 11
    et_offset = timedelta(hours=-4) if is_edt else timedelta(hours=-5)
    now_et = now_utc + et_offset
    
    weekday = now_et.weekday()  # 0=Mon, 6=Sun
    hour = now_et.hour
    minute = now_et.minute
    total_minutes = hour * 60 + minute
    
    REGULAR_OPEN     = 9 * 60 + 30   # 09:30 ET
    REGULAR_CLOSE    = 16 * 60       # 16:00 ET
    
    is_weekday = weekday < 5
    return is_weekday and (REGULAR_OPEN <= total_minutes < REGULAR_CLOSE)
