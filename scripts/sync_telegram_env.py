#!/usr/bin/env python3
"""Sync TELEGRAM_* vars from project root .env into docker/.env."""

from __future__ import annotations

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ROOT_ENV = PROJECT_ROOT / ".env"
DOCKER_ENV = PROJECT_ROOT / "docker" / ".env"
TELEGRAM_KEYS = ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID")


def _read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _upsert_lines(content: str, updates: dict[str, str]) -> str:
    lines = content.splitlines()
    seen: set[str] = set()
    out: list[str] = []

    for line in lines:
        match = re.match(r"^([A-Z0-9_]+)\s*=", line)
        if match and match.group(1) in updates:
            key = match.group(1)
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)

    missing = [key for key in updates if key not in seen]
    if missing:
        if out and out[-1].strip():
            out.append("")
        out.append("# --- Telegram Notifier (synced from project root .env) ---")
        for key in missing:
            out.append(f"{key}={updates[key]}")

    return "\n".join(out).rstrip() + "\n"


def main() -> int:
    root_values = _read_env(ROOT_ENV)
    updates = {key: root_values[key] for key in TELEGRAM_KEYS if root_values.get(key)}
    if not updates:
        print(f"No TELEGRAM_* values found in {ROOT_ENV}")
        return 1

    if DOCKER_ENV.exists():
        content = DOCKER_ENV.read_text(encoding="utf-8")
    else:
        example = PROJECT_ROOT / "docker" / ".env.example"
        content = example.read_text(encoding="utf-8") if example.exists() else ""

    DOCKER_ENV.parent.mkdir(parents=True, exist_ok=True)
    DOCKER_ENV.write_text(_upsert_lines(content, updates), encoding="utf-8")
    print(f"Updated {DOCKER_ENV}")
    for key, value in updates.items():
        masked = value if key.endswith("_CHAT_ID") else f"{value[:8]}..."
        print(f"  {key}={masked}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
