"""Module 9 — data editor & annotation system.

Every edit forks a new :class:`NeuroData` derivative (non-destructive) with a
provenance step and a link to its parent — the seed of git-like versioning.
"""
from __future__ import annotations

import numpy as np
import mne
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.registry import registry
from ..core.neurodata import NeuroData, ProvenanceStep

router = APIRouter(prefix="/api/edit", tags=["edit"])


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


def _derive(parent: NeuroData, raw, op: str, params: dict) -> NeuroData:
    new = NeuroData(raw, entities=parent.entities, source_format=f"{parent.source_format} ▸ edit")
    new.provenance = list(parent.provenance) + [ProvenanceStep(f"edit:{op}", params)]
    new.extra = {**parent.extra, "parent": parent.id}
    registry.add(new)
    return new


class ChannelOps(BaseModel):
    drop: list[str] = []
    rename: dict[str, str] = {}
    reorder: list[str] | None = None


class CropOps(BaseModel):
    tmin: float = 0.0
    tmax: float | None = None


class VirtualOps(BaseModel):
    anode: str
    cathode: str
    name: str | None = None


class AnnotationOps(BaseModel):
    onset: float
    duration: float = 0.0
    description: str = "mark"


class MontageOps(BaseModel):
    montage: str = "standard_1020"


@router.get("/montages")
def montages():
    return {"montages": mne.channels.get_builtin_montages()}


@router.post("/{dataset_id}/montage")
def set_montage(dataset_id: str, ops: MontageOps):
    nd = _get(dataset_id)
    raw = nd.raw.copy()
    try:
        raw.set_montage(ops.montage, match_case=False, on_missing="warn", verbose="ERROR")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"could not apply montage: {e}")
    return _derive(nd, raw, "set_montage", {"montage": ops.montage}).metadata_dict()


@router.post("/{dataset_id}/channels")
def channels(dataset_id: str, ops: ChannelOps):
    nd = _get(dataset_id)
    raw = nd.raw.copy()
    if ops.drop:
        raw.drop_channels([c for c in ops.drop if c in raw.ch_names])
    if ops.rename:
        raw.rename_channels({k: v for k, v in ops.rename.items() if k in raw.ch_names})
    if ops.reorder:
        keep = [c for c in ops.reorder if c in raw.ch_names]
        if keep:
            raw.reorder_channels(keep)
    return _derive(nd, raw, "channels", ops.model_dump()).metadata_dict()


@router.post("/{dataset_id}/crop")
def crop(dataset_id: str, ops: CropOps):
    nd = _get(dataset_id)
    raw = nd.raw.copy().crop(tmin=max(0.0, ops.tmin),
                             tmax=ops.tmax if ops.tmax is not None else None)
    return _derive(nd, raw, "crop", ops.model_dump()).metadata_dict()


@router.post("/{dataset_id}/virtual")
def virtual(dataset_id: str, ops: VirtualOps):
    nd = _get(dataset_id)
    if ops.anode not in nd.raw.ch_names or ops.cathode not in nd.raw.ch_names:
        raise HTTPException(422, "anode/cathode not found")
    name = ops.name or f"{ops.anode}-{ops.cathode}"
    raw = mne.set_bipolar_reference(nd.raw.copy(), ops.anode, ops.cathode,
                                    ch_name=name, drop_refs=False, verbose="ERROR")
    return _derive(nd, raw, "virtual_channel", ops.model_dump()).metadata_dict()


@router.post("/{dataset_id}/annotation")
def annotation(dataset_id: str, ops: AnnotationOps):
    nd = _get(dataset_id)
    raw = nd.raw.copy()
    ann = raw.annotations
    onset = np.append(ann.onset, ops.onset)
    dur = np.append(ann.duration, ops.duration)
    desc = list(ann.description) + [ops.description]
    raw.set_annotations(mne.Annotations(onset=onset, duration=dur, description=desc))
    return _derive(nd, raw, "annotation", ops.model_dump()).metadata_dict()
