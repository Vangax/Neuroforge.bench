"""Module 7 — benchmarking & validation suite."""
from __future__ import annotations

import time

import numpy as np
from fastapi import APIRouter, HTTPException

from ..core.registry import registry
from ..core import pipeline, dsp, report
from ..core.jobs import jobs

router = APIRouter(prefix="/api/bench", tags=["bench"])


def _get(dataset_id: str):
    try:
        return registry.get(dataset_id)
    except KeyError:
        raise HTTPException(404, f"Dataset {dataset_id} not found")


def _alpha_snr(raw) -> float:
    """Alpha-band SNR (dB): α power vs flanking θ/β power, posterior mean."""
    p = dsp.compute_psd(raw, fmin=2.0, fmax=min(35, raw.info["sfreq"] / 2 - 1))
    f = np.asarray(p["freqs"])
    psd = 10 ** (np.asarray(p["psd_db"]) / 10.0)
    mean = psd.mean(axis=0)
    alpha = mean[(f >= 8) & (f <= 13)].mean()
    flank = mean[((f >= 5) & (f < 8)) | ((f > 13) & (f <= 20))].mean()
    return float(10 * np.log10(alpha / (flank + 1e-30)))


VARIANTS = [
    ("raw (no preprocessing)", []),
    ("high-pass 1 Hz", [{"op": "filter", "params": {"l_freq": 1.0, "h_freq": None}}]),
    ("hp 1 Hz + notch", [{"op": "filter", "params": {"l_freq": 1.0, "h_freq": 40.0}},
                         {"op": "notch", "params": {"freq": 50}}]),
    ("hp + notch + ICA", [{"op": "filter", "params": {"l_freq": 1.0, "h_freq": 40.0}},
                          {"op": "notch", "params": {"freq": 50}},
                          {"op": "ica", "params": {"n_components": 15, "method": "fastica", "eog_ch": "Fp1"}}]),
]


@router.get("/{dataset_id}/pipelines")
def pipelines(dataset_id: str):
    nd = _get(dataset_id)

    def task():
        results = []
        for name, steps in VARIANTS:
            t0 = time.perf_counter()
            if steps:
                new, qc = pipeline.run_pipeline(nd, steps)  # core; not persisted
                raw = new.raw
                n_ica = len(qc.get("ica_excluded", []))
            else:
                raw = nd.raw
                n_ica = 0
            dt = (time.perf_counter() - t0) * 1000.0
            results.append({
                "name": name, "alpha_snr_db": round(_alpha_snr(raw), 2),
                "time_ms": round(dt, 1), "ica_removed": n_ica, "sfreq": raw.info["sfreq"],
            })
        best = max(results, key=lambda r: r["alpha_snr_db"])["name"]
        return {
            "dataset": nd.entities.label(), "results": results, "best": best,
            "environment": report.environment(), "repro_hash": report.repro_hash(nd),
        }

    return {"job_id": jobs.submit("benchmark", task).id}


@router.get("/{dataset_id}/quality")
def quality(dataset_id: str):
    raw = _get(dataset_id).raw.copy().pick("eeg")
    data = raw.get_data()
    C = np.corrcoef(data)
    return {
        "ch_names": raw.ch_names,
        "correlation": np.round(C, 3).tolist(),
        "mean_abs_corr": float(np.mean(np.abs(C[np.triu_indices(len(raw.ch_names), 1)]))),
        "alpha_snr_db": round(_alpha_snr(raw), 2),
    }
