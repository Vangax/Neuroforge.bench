# In-process job queue for heavy ops (ICA, decoding, benchmarks) so requests
# don't block. Threaded — fine for single-node CPU work that releases the GIL in
# NumPy/MNE. For multi-node, swap this for Celery/RQ behind the same interface.
from __future__ import annotations

import time
import uuid
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable

log = logging.getLogger("neuroforge.jobs")


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"            # queued | running | done | error
    result: Any = None
    error: str | None = None
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None

    def elapsed(self) -> float:
        if self.started is None:
            return 0.0
        return (self.finished or time.time()) - self.started

    def public(self, with_result: bool = False) -> dict:
        d = {
            "id": self.id, "kind": self.kind, "status": self.status,
            "error": self.error, "elapsed": round(self.elapsed(), 2), "created": self.created,
        }
        if with_result and self.status == "done":
            d["result"] = self.result
        return d


class JobManager:
    def __init__(self, workers: int = 2, keep: int = 100):
        self._ex = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="nf-job")
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._keep = keep

    def submit(self, kind: str, fn: Callable[[], Any]) -> Job:
        job = Job(uuid.uuid4().hex[:12], kind)
        with self._lock:
            self._jobs[job.id] = job
            self._evict()
        self._ex.submit(self._run, job, fn)
        return job

    def _run(self, job: Job, fn: Callable[[], Any]) -> None:
        job.status, job.started = "running", time.time()
        try:
            job.result = fn()
            job.status = "done"
        except Exception as e:  # noqa: BLE001 — captured into the job, not swallowed
            job.status, job.error = "error", str(e)
            log.exception("job %s (%s) failed", job.id, job.kind)
        finally:
            job.finished = time.time()

    def _evict(self) -> None:
        # drop oldest finished jobs once we exceed `keep`
        if len(self._jobs) <= self._keep:
            return
        done = sorted(
            (j for j in self._jobs.values() if j.finished),
            key=lambda j: j.finished or 0,
        )
        for j in done[: len(self._jobs) - self._keep]:
            self._jobs.pop(j.id, None)

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list(self, limit: int = 50) -> list[Job]:
        return sorted(self._jobs.values(), key=lambda j: j.created, reverse=True)[:limit]

    def stats(self) -> dict:
        c = {"queued": 0, "running": 0, "done": 0, "error": 0}
        for j in self._jobs.values():
            c[j.status] = c.get(j.status, 0) + 1
        return c


jobs = JobManager()
