"""Module 5 — signal analyzer & feature extractor."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..core import features
from ..core.registry import registry

router = APIRouter(prefix="/api/analyze", tags=["analyze"])


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


@router.get("/{dataset_id}/features")
def feats(dataset_id: str):
    try:
        return features.channel_features(_get(dataset_id).raw)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/{dataset_id}/connectivity")
def connectivity(
    dataset_id: str,
    method: str = Query("plv", pattern="^(plv|pli|wpli|coh)$"),
    band: str = Query("alpha"),
):
    try:
        return features.connectivity(_get(dataset_id).raw, method=method, band=band)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/{dataset_id}/aperiodic")
def aperiodic(dataset_id: str):
    try:
        return features.aperiodic(_get(dataset_id).raw)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/{dataset_id}/microstates")
def microstates(dataset_id: str, n_states: int = Query(4, ge=2, le=7)):
    try:
        return features.microstates(_get(dataset_id).raw, n_states=n_states)
    except ValueError as e:
        raise HTTPException(422, str(e))
