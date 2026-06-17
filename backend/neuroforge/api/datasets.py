"""Module 1 — datasets: ingestion, repository tree, metadata, events."""
from __future__ import annotations

import os
import re
import tempfile

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from ..core import loaders
from ..core.registry import registry
from ..core.neurodata import BidsEntities
from ..models.schemas import SyntheticRequest
from ..config import settings

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


def _bids_safe(stem: str) -> str:
    # BIDS entity labels are alphanumeric; keep it readable, cap length
    return re.sub(r"[^A-Za-z0-9]", "", stem)[:40] or "run"


@router.get("")
def list_datasets():
    return {"datasets": [nd.metadata_dict() for nd in registry.all()]}


@router.get("/tree")
def dataset_tree():
    return {"tree": registry.tree()}


@router.get("/formats")
def formats():
    return {"formats": loaders.supported_formats()}


@router.post("/synthetic")
def create_synthetic(req: SyntheticRequest):
    nd = loaders.make_synthetic(
        subject=req.subject, session=req.session, task=req.task, run=req.run,
        seed=req.seed, n_seconds=req.n_seconds, sfreq=req.sfreq,
        line_freq=req.line_freq,
    )
    registry.add(nd)
    return nd.metadata_dict()


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    subject: str = Form("imported"),
    session: str | None = Form(None),
    task: str | None = Form(None),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if loaders.detect_format(file.filename or "") is None:
        raise HTTPException(400, f"Unsupported format: {ext or '?'}")

    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"file exceeds the {settings.max_upload_mb} MB limit")

    suffix = ext or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    stem = os.path.splitext(os.path.basename(file.filename or "run"))[0]
    try:
        ent = BidsEntities(subject=subject or "imported", session=session or None,
                           task=task or _bids_safe(stem))
        nd = loaders.load_file(tmp_path, entities=ent)
    except NotImplementedError as e:
        raise HTTPException(501, str(e))
    except Exception as e:  # noqa: BLE001 — surface loader errors to the UI
        raise HTTPException(422, f"Failed to read {file.filename}: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    nd.source_path = file.filename
    registry.add(nd)
    return nd.metadata_dict()


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    return _get(dataset_id).metadata_dict()


@router.get("/{dataset_id}/channels")
def get_channels(dataset_id: str):
    nd = _get(dataset_id)
    return {"channels": nd.channels_table(), "positions": nd.topomap_positions()}


@router.get("/{dataset_id}/events")
def get_events(dataset_id: str):
    return {"events": _get(dataset_id).events()}


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str):
    _get(dataset_id)
    registry.remove(dataset_id)
    return {"deleted": dataset_id}
