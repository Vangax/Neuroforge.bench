"""Request/response schemas. Kept light — most responses are computed dicts."""
from __future__ import annotations

from pydantic import BaseModel, Field


class SyntheticRequest(BaseModel):
    subject: str = "01"
    session: str | None = "01"
    task: str = "rest"
    run: str | None = None
    n_seconds: float = Field(60.0, ge=2.0, le=600.0)
    sfreq: float = Field(256.0, ge=64.0, le=2000.0)
    line_freq: float | None = 50.0
    seed: int | None = None


class FilterRequest(BaseModel):
    l_freq: float | None = Field(None, ge=0.0)
    h_freq: float | None = Field(None, ge=0.0)
    notch: float | None = Field(None, ge=0.0)


class WindowQuery(BaseModel):
    start: float = 0.0
    duration: float = 10.0
    picks: list[str] | None = None
    max_points: int = 4000


class HealthResponse(BaseModel):
    app: str
    version: str
    mne: str
    numpy: str
    n_datasets: int
