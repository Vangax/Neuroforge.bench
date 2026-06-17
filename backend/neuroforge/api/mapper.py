"""Module 6 — cross-session / cross-subject mapper."""
from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Query

from ..core.registry import registry
from ..core import dsp
from ..config import DEFAULT_BANDS

router = APIRouter(prefix="/api/mapper", tags=["mapper"])


@router.get("/overview")
def overview():
    items = []
    for nd in registry.all():
        bp = dsp.band_powers(nd.raw, relative=True)
        items.append({
            "id": nd.id, "label": nd.entities.label(),
            "subject": nd.entities.subject, "session": nd.entities.session,
            "task": nd.entities.task,
            "summary": {b: float(np.mean(v)) for b, v in bp["bands"].items()},
        })
    return {"datasets": items, "bands": list(DEFAULT_BANDS.keys())}


@router.get("/matrix")
def matrix(metric: str = Query("alpha")):
    rows, vectors, labels = [], [], []
    for nd in registry.all():
        bp = dsp.band_powers(nd.raw, relative=True)
        vals = bp["bands"].get(metric, [])
        rows.append({"id": nd.id, "label": nd.entities.label(),
                     "ch_names": bp["ch_names"], "values": [float(v) for v in vals]})
        vectors.append(np.asarray(vals, dtype=float))
        labels.append(nd.entities.label())

    # dataset-similarity (Pearson) where channel vectors are comparable
    n = len(vectors)
    sim = np.eye(n)
    for i in range(n):
        for j in range(i + 1, n):
            if vectors[i].shape == vectors[j].shape and vectors[i].size > 1:
                c = np.corrcoef(vectors[i], vectors[j])[0, 1]
                sim[i, j] = sim[j, i] = 0.0 if np.isnan(c) else float(c)
    off = sim[np.triu_indices(n, 1)] if n > 1 else np.array([])
    return {
        "metric": metric, "rows": rows, "labels": labels,
        "similarity": sim.tolist(),
        "mean_reliability": float(np.mean(off)) if off.size else 0.0,
    }
