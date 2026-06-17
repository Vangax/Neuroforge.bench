"""Module 2/5 — spectral visualization: PSD, band power, topographies."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..core import dsp
from ..core.registry import registry
from ..config import DEFAULT_BANDS

router = APIRouter(prefix="/api/spectral", tags=["spectral"])


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


@router.get("/{dataset_id}/psd")
def psd(
    dataset_id: str,
    fmin: float = Query(0.5, ge=0.0),
    fmax: float = Query(45.0, gt=0.0),
    method: str = Query("welch", pattern="^(welch|multitaper)$"),
    picks: str | None = Query(None),
):
    nd = _get(dataset_id)
    pick_list = [p for p in picks.split(",") if p] if picks else None
    return dsp.compute_psd(nd.raw, fmin=fmin, fmax=fmax, method=method, picks=pick_list)


@router.get("/{dataset_id}/bandpower")
def bandpower(
    dataset_id: str,
    relative: bool = Query(False),
):
    nd = _get(dataset_id)
    return dsp.band_powers(nd.raw, bands=DEFAULT_BANDS, relative=relative)


@router.get("/{dataset_id}/topomap")
def topomap(
    dataset_id: str,
    fmin: float = Query(8.0, ge=0.0),
    fmax: float = Query(13.0, gt=0.0),
    resolution: int = Query(48, ge=16, le=128),
):
    nd = _get(dataset_id)
    return dsp.topomap_grid(nd.raw, fmin=fmin, fmax=fmax, resolution=resolution)


@router.get("/bands")
def bands():
    return {"bands": {k: list(v) for k, v in DEFAULT_BANDS.items()}}
