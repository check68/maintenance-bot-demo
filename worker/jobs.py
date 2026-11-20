"""Background-job helpers for the demo worker service.

The real worker service polls third-party APIs and writes to a queue; this is the
sanitized slice that the maintenance bot exercises.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class Job:
    name: str
    last_run: datetime | None
    interval: timedelta

    def is_due(self, now: datetime) -> bool:
        if self.last_run is None:
            return True
        return now - self.last_run >= self.interval


def dedupe(jobs: list[Job]) -> list[Job]:
    """Keeps the first job per name, preserving input order."""
    seen: set[str] = set()
    unique: list[Job] = []
    for job in jobs:
        if job.name in seen:
            continue
        seen.add(job.name)
        unique.append(job)
    return unique


def due_jobs(jobs: list[Job], now: datetime) -> list[Job]:
    return [job for job in dedupe(jobs) if job.is_due(now)]