import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jobs import Job, dedupe, due_jobs  # noqa: E402


NOW = datetime(2026, 11, 20, 12, 0, 0)


class JobTests(unittest.TestCase):
    def test_new_job_is_due(self):
        job = Job("sync-orders", None, timedelta(minutes=15))
        self.assertTrue(job.is_due(NOW))

    def test_recent_job_is_not_due(self):
        job = Job("sync-orders", NOW - timedelta(minutes=5), timedelta(minutes=15))
        self.assertFalse(job.is_due(NOW))

    def test_old_job_is_due(self):
        job = Job("sync-orders", NOW - timedelta(minutes=16), timedelta(minutes=15))
        self.assertTrue(job.is_due(NOW))

    def test_dedupe_keeps_first_occurrence(self):
        first = Job("a", NOW - timedelta(minutes=1), timedelta(minutes=15))
        second = Job("a", NOW, timedelta(minutes=15))
        self.assertEqual(dedupe([first, second]), [first])

    def test_due_jobs_filters_and_dedupes(self):
        jobs = [
            Job("a", None, timedelta(minutes=15)),
            Job("a", NOW, timedelta(minutes=15)),
            Job("b", NOW - timedelta(hours=1), timedelta(minutes=15)),
            Job("c", NOW - timedelta(minutes=1), timedelta(minutes=15)),
        ]
        names = [job.name for job in due_jobs(jobs, NOW)]
        self.assertEqual(names, ["a", "b"])


if __name__ == "__main__":
    unittest.main()