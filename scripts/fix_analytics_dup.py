from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src" / "market" / "analytics_router.py"
t = p.read_text(encoding="utf-8")
marker = "Configurable Ticker"
i = t.find(marker)
if i != -1:
    i = t.rfind("\n", 0, i)
    j = t.find('@router.get("/summary")', i)
    t = t[:i] + "\n\n" + t[j:]
    p.write_text(t, encoding="utf-8")
    print("removed duplicate block")
