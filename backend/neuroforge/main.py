# FastAPI app: wiring, middleware, RBAC, lifespan. Heavy ops run via the job queue.
from __future__ import annotations

import time
import uuid
import logging
import platform
from contextlib import asynccontextmanager

import numpy as np
import mne
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .core import loaders
from .core.registry import registry
from .core.store import Store
from .core.jobs import jobs
from .core.security import auth, require
from .api import (
    datasets, signal, spectral, preprocess, erp, analyze,
    mapper, benchmark, bci, edit, report, jobs as jobs_api, scripts as scripts_api,
)
from .models.schemas import HealthResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("neuroforge")


def _seed() -> None:
    # 2 subjects, a few sessions/tasks. Only runs on a fresh (empty) store.
    for s in (
        dict(subject="01", session="01", task="rest", seed=11),
        dict(subject="01", session="02", task="oddball", seed=12),
        dict(subject="02", session="01", task="rest", seed=21),
    ):
        registry.add(loaders.make_synthetic(
            subject=s["subject"], session=s["session"], task=s["task"],
            seed=s["seed"], n_seconds=60.0, sfreq=256.0,
        ))


@asynccontextmanager
async def lifespan(app: FastAPI):
    mne.set_log_level("ERROR")
    registry.attach(Store(settings.db_path, settings.data_dir))
    if settings.seed_synthetic and not registry.all():
        _seed()
    log.info("ready | datasets=%d | auth=%s | data=%s",
             len(registry.all()), "on" if auth.enabled else "off", settings.data_dir)
    yield


app = FastAPI(
    title=f"{settings.app_name} API",
    version=settings.version,
    description="Universal brain-data platform — BIDS-native, reproducible.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def access_log(request: Request, call_next):
    rid = uuid.uuid4().hex[:8]
    request.state.rid = rid
    t0 = time.perf_counter()
    response = await call_next(request)
    dt = (time.perf_counter() - t0) * 1000
    response.headers["X-Request-ID"] = rid
    log.info("rid=%s %s %s -> %s %.0fms", rid, request.method, request.url.path,
             response.status_code, dt)
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    rid = getattr(request.state, "rid", "?")
    log.exception("rid=%s unhandled", rid)
    return JSONResponse(
        status_code=500,
        content={"error": {"type": type(exc).__name__, "detail": str(exc), "request_id": rid}},
    )


# RBAC: reads need viewer; compute/edit need analyst. No-op when auth is disabled.
_read = [Depends(require("viewer"))]
_write = [Depends(require("analyst"))]
app.include_router(datasets.router, dependencies=_read)
app.include_router(signal.router, dependencies=_read)
app.include_router(spectral.router, dependencies=_read)
app.include_router(erp.router, dependencies=_read)
app.include_router(analyze.router, dependencies=_read)
app.include_router(mapper.router, dependencies=_read)
app.include_router(report.router, dependencies=_read)
app.include_router(jobs_api.router, dependencies=_read)
app.include_router(preprocess.router, dependencies=_write)
app.include_router(benchmark.router, dependencies=_write)
app.include_router(bci.router, dependencies=_write)
app.include_router(edit.router, dependencies=_write)
app.include_router(scripts_api.router, dependencies=_write)   # M11 — runs user code


@app.get("/api/health", response_model=HealthResponse, tags=["meta"])
def health():
    return HealthResponse(
        app=settings.app_name, version=settings.version,
        mne=mne.__version__, numpy=np.__version__, n_datasets=len(registry.all()),
    )


@app.get("/api/system", tags=["meta"])
def system():
    return {
        "app": settings.app_name, "version": settings.version,
        "python": platform.python_version(), "platform": platform.platform(),
        "mne": mne.__version__, "numpy": np.__version__,
        "datasets": len(registry.all()), "data_dir": settings.data_dir,
        "auth_enabled": auth.enabled, "scripts_enabled": settings.scripts_enabled,
        "jobs": jobs.stats(),
    }


@app.get("/", tags=["meta"])
def root():
    return {"app": settings.app_name, "version": settings.version,
            "docs": "/docs", "health": "/api/health"}
