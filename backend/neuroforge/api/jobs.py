# Job status/result polling for the async heavy endpoints.
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..core.jobs import jobs

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
def list_jobs():
    return {"jobs": [j.public() for j in jobs.list()], "stats": jobs.stats()}


@router.get("/{job_id}")
def get_job(job_id: str):
    j = jobs.get(job_id)
    if j is None:
        raise HTTPException(404, "job not found")
    return j.public(with_result=True)
