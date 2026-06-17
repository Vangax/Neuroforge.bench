"""Module 4 — ERP / ERF finder & analyzer."""
from __future__ import annotations

import numpy as np
import mne
from mne.stats import permutation_cluster_test, spatio_temporal_cluster_test
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.registry import registry
from ..core import montage as mtg

router = APIRouter(prefix="/api/erp", tags=["erp"])


class ERPRequest(BaseModel):
    tmin: float = -0.2
    tmax: float = 0.6
    baseline_end: float = 0.0
    stats: bool = True


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


def _events(raw):
    try:
        return mne.events_from_annotations(raw, verbose="ERROR")
    except Exception:
        return np.empty((0, 3), int), {}


@router.get("/{dataset_id}/conditions")
def conditions(dataset_id: str):
    events, event_id = _events(_get(dataset_id).raw)
    out = []
    for name, code in event_id.items():
        out.append({"name": name, "code": int(code), "count": int(np.sum(events[:, 2] == code))})
    return {"conditions": out}


@router.post("/{dataset_id}/compute")
def compute(dataset_id: str, req: ERPRequest):
    raw = _get(dataset_id).raw
    events, event_id = _events(raw)
    if not event_id:
        raise HTTPException(422, "No events/annotations found for epoching")

    baseline = (None, req.baseline_end)
    epochs = mne.Epochs(raw, events, event_id, tmin=req.tmin, tmax=req.tmax,
                        baseline=baseline, picks="eeg", preload=True, verbose="ERROR")
    times = (epochs.times * 1000.0).round(1).tolist()  # ms

    conditions = []
    evokeds = {}
    for name in event_id:
        try:
            ev = epochs[name].average()
        except Exception:
            continue
        evokeds[name] = ev
        wave = (ev.data.mean(axis=0) * 1e6)
        gfp = (ev.data.std(axis=0) * 1e6)
        pk_i = int(np.argmax(np.abs(wave)))
        conditions.append({
            "name": name, "n": int(len(epochs[name])),
            "wave": wave.round(3).tolist(), "gfp": gfp.round(3).tolist(),
            "peak": {"latency_ms": times[pk_i], "amp_uv": float(wave[pk_i])},
        })

    result = {"times_ms": times, "conditions": conditions}

    # difference wave + topo + cluster stats for the two main conditions
    names = list(evokeds.keys())
    if len(names) >= 2:
        a_name, b_name = sorted(names)[:2]
        diff = mne.combine_evoked([evokeds[b_name], evokeds[a_name]], weights=[1, -1])
        dwave = diff.data.mean(axis=0) * 1e6
        ti = int(np.argmax(np.abs(dwave)))
        pos = mtg.project_raw(diff)
        topo_vals = diff.data[:, ti] * 1e6
        result["difference"] = {
            "name": f"{b_name} − {a_name}",
            "wave": dwave.round(3).tolist(),
            "peak": {"latency_ms": times[ti], "amp_uv": float(dwave[ti])},
            "topo": {
                "latency_ms": times[ti],
                "vmin": float(topo_vals.min()), "vmax": float(topo_vals.max()),
                "positions": [{"name": n, "x": pos[n][0], "y": pos[n][1], "value": float(topo_vals[i])}
                              for i, n in enumerate(diff.ch_names) if n in pos],
            },
        }
        if req.stats:
            result.update(_cluster_stats(epochs, a_name, b_name, times))

    return result


def _cluster_stats(epochs, a_name, b_name, times) -> dict:
    # spatio-temporal cluster permutation (channels x time) with EEG adjacency;
    # falls back to a channel-averaged 1-D test if adjacency isn't available.
    try:
        adjacency, _ = mne.channels.find_ch_adjacency(epochs.info, ch_type="eeg")
        Xa = epochs[a_name].get_data(copy=True).transpose(0, 2, 1) * 1e6  # (obs, time, ch)
        Xb = epochs[b_name].get_data(copy=True).transpose(0, 2, 1) * 1e6
        _, clusters, pvals, _ = spatio_temporal_cluster_test(
            [Xa, Xb], adjacency=adjacency, n_permutations=200, tail=0, seed=42,
            n_jobs=1, out_type="mask", verbose="ERROR")
        sig = []
        for cl, p in zip(clusters, pvals):
            if p < 0.05:
                tidx = np.where(cl.any(axis=1))[0]
                chidx = np.where(cl.any(axis=0))[0]
                if tidx.size:
                    sig.append({"start_ms": times[tidx[0]], "end_ms": times[tidx[-1]],
                                "p": float(p), "n_channels": int(chidx.size),
                                "channels": [epochs.ch_names[i] for i in chidx][:12]})
        return {"clusters": sig, "cluster_method": "spatio-temporal"}
    except Exception:
        try:
            a = epochs[a_name].get_data(copy=True).mean(axis=1) * 1e6
            b = epochs[b_name].get_data(copy=True).mean(axis=1) * 1e6
            _, clusters, pvals, _ = permutation_cluster_test(
                [a, b], n_permutations=256, tail=0, seed=42, out_type="mask", verbose="ERROR")
            sig = []
            for cl, p in zip(clusters, pvals):
                if p < 0.05:
                    idx = np.where(cl)[0]
                    if idx.size:
                        sig.append({"start_ms": times[idx[0]], "end_ms": times[idx[-1]], "p": float(p)})
            return {"clusters": sig, "cluster_method": "temporal (1-D fallback)"}
        except Exception as e:  # noqa: BLE001
            return {"clusters_error": str(e)}
