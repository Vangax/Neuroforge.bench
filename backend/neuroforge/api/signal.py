"""Module 2 — time-domain visualization: windowed multichannel signal."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..core.registry import registry
from ..config import settings

router = APIRouter(prefix="/api/signal", tags=["signal"])


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


@router.get("/{dataset_id}/window")
def window(
    dataset_id: str,
    start: float = Query(0.0, ge=0.0),
    duration: float = Query(10.0, gt=0.0, le=120.0),
    picks: str | None = Query(None, description="comma-separated channel names"),
    max_points: int = Query(settings.max_points_per_channel, ge=100, le=20000),
):
    nd = _get(dataset_id)
    pick_list = [p for p in picks.split(",") if p] if picks else None
    return nd.get_window(
        start=start, duration=duration, picks=pick_list, max_points=max_points
    )
