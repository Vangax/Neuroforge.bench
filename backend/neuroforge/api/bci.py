"""Module 8 — BCI / neurotechnology workbench."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core import decoding
from ..core.registry import registry
from ..core.jobs import jobs

router = APIRouter(prefix="/api/bci", tags=["bci"])


class DecodeRequest(BaseModel):
    classifier: str = "lda"
    folds: int = 5


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


@router.get("/classifiers")
def classifiers():
    return {"classifiers": [
        {"id": "lda", "label": "CSP + LDA"},
        {"id": "svm", "label": "CSP + SVM (RBF)"},
        {"id": "rf", "label": "CSP + Random Forest"},
        {"id": "riemann", "label": "Riemannian + LogReg"},
    ]}


@router.post("/{dataset_id}/decode")
def decode(dataset_id: str, req: DecodeRequest):
    nd = _get(dataset_id)
    job = jobs.submit("decode", lambda: decoding.decode(nd.raw, classifier=req.classifier, folds=req.folds))
    return {"job_id": job.id}
