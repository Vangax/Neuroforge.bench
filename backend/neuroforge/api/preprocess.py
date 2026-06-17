"""Module 3 — preprocessing pipeline."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core import pipeline
from ..core.registry import registry
from ..core.jobs import jobs

router = APIRouter(prefix="/api/preprocess", tags=["preprocess"])


class PipelineRequest(BaseModel):
    steps: list[dict] = []


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


@router.get("/catalog")
def catalog():
    return {"catalog": pipeline.STEP_CATALOG}


@router.post("/{dataset_id}/run")
def run(dataset_id: str, req: PipelineRequest):
    nd = _get(dataset_id)

    def task():
        new, qc = pipeline.run_pipeline(nd, req.steps)
        registry.add(new)  # persist the derivative
        return {"dataset": new.metadata_dict(), "qc": qc}

    return {"job_id": jobs.submit("preprocess", task).id}
