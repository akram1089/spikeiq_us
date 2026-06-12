import scripts._bootstrap  # noqa: F401

import os
import subprocess
import sys
from pathlib import Path

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PYTHON = sys.executable

JOBS = {
    "sync_stocks": PROJECT_ROOT / "scripts" / "sync_stocks.py",
    "sync_futures": PROJECT_ROOT / "scripts" / "sync_futures.py",
    "resolve_conids": PROJECT_ROOT / "scripts" / "resolve_conids.py",
    "sync_indexes": PROJECT_ROOT / "scripts" / "sync_indexes.py",
    "sync_priority_streaming": PROJECT_ROOT / "scripts" / "sync_priority_streaming.py",
}


def run_job(name: str) -> None:
    script = JOBS[name]
    logger.info(f"Scheduler starting job: {name}")
    module = f"scripts.{script.stem}"
    result = subprocess.run(
        [PYTHON, "-m", module],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(PROJECT_ROOT)},
    )
    if result.stdout:
        logger.info(result.stdout.strip())
    if result.returncode != 0:
        logger.error(f"Job {name} failed (exit {result.returncode}): {result.stderr}")
    else:
        logger.success(f"Job {name} completed successfully")


def main() -> None:
    scheduler = BlockingScheduler(timezone="America/New_York")

    scheduler.add_job(
        run_job,
        CronTrigger(hour=3, minute=0),
        args=["sync_stocks"],
        id="sync_stocks",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        run_job,
        CronTrigger(hour=3, minute=5),
        args=["sync_priority_streaming"],
        id="sync_priority_streaming_daily",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        run_job,
        CronTrigger(hour=3, minute=15),
        args=["sync_futures"],
        id="sync_futures",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        run_job,
        CronTrigger(hour=3, minute=30),
        args=["resolve_conids"],
        id="resolve_conids",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        run_job,
        CronTrigger(day_of_week="sun", hour=3, minute=0),
        args=["sync_indexes"],
        id="sync_indexes",
        max_instances=1,
        replace_existing=True,
    )
    scheduler.add_job(
        run_job,
        CronTrigger(day_of_week="sun", hour=3, minute=5),
        args=["sync_priority_streaming"],
        id="sync_priority_streaming",
        max_instances=1,
        replace_existing=True,
    )

    logger.info("Security Master scheduler started (America/New_York)")
    scheduler.start()


if __name__ == "__main__":
    main()
