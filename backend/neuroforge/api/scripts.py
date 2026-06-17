# Module 11 — user scripting: save, list and run custom Python against a dataset.
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core import scripts
from ..core.scripts import ScriptStore, EXAMPLES
from ..core.registry import registry
from ..core.jobs import jobs
from ..config import settings

router = APIRouter(prefix="/api/scripts", tags=["scripts"])

_store: ScriptStore | None = None


def _ss() -> ScriptStore:
    global _store
    if _store is None:
        Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
        _store = ScriptStore(settings.db_path)
    return _store


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


class SaveRequest(BaseModel):
    name: str
    description: str = ""
    code: str
    id: str | None = None


class RunRequest(BaseModel):
    dataset_id: str | None = None        # single (back-compat)
    dataset_ids: list[str] = []          # batch / group
    code: str | None = None
    script_id: str | None = None
    params: dict = {}
    mode: str = "each"                    # when many datasets: "each" or "group"


@router.get("")
def list_scripts():
    return {"scripts": _ss().list(), "enabled": settings.scripts_enabled,
            "timeout_s": settings.script_timeout_s}


@router.get("/examples")
def examples():
    return {"examples": EXAMPLES}


@router.get("/{script_id}")
def get_script(script_id: str):
    s = _ss().get(script_id)
    if not s:
        raise HTTPException(404, "script not found")
    return s


@router.post("")
def save_script(req: SaveRequest):
    return _ss().save(req.name, req.description, req.code, script_id=req.id)


@router.delete("/{script_id}")
def delete_script(script_id: str):
    _ss().delete(script_id)
    return {"deleted": script_id}


@router.post("/run")
def run(req: RunRequest):
    if not settings.scripts_enabled:
        raise HTTPException(403, "scripting is disabled on this server")
    ids = req.dataset_ids or ([req.dataset_id] if req.dataset_id else [])
    if not ids:
        raise HTTPException(422, "no dataset selected")
    nds = [_get(i) for i in ids]
    code = req.code
    if req.script_id and not code:
        s = _ss().get(req.script_id)
        code = s["code"] if s else None
    if not code:
        raise HTTPException(422, "no code provided")

    if len(nds) == 1:
        job = jobs.submit("script", lambda: scripts.run_script(nds[0], code, req.params))
    elif req.mode == "group":
        job = jobs.submit("script-group", lambda: scripts.run_group(nds, code, req.params))
    else:
        job = jobs.submit("script-batch", lambda: scripts.run_batch(nds, code, req.params))
    return {"job_id": job.id}
