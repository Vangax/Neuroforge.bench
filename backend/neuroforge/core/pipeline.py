# Preprocessing pipeline. A pipeline is an ordered list of {op, params}.
# run_pipeline applies them to a copy, logs provenance per step, and returns a new
# derivative plus QC (before/after PSD, detected bad channels, removed ICA comps).
from __future__ import annotations

import numpy as np
import mne

from .neurodata import NeuroData, ProvenanceStep
from . import dsp


# Catalog advertised to the UI's pipeline builder.
STEP_CATALOG = [
    {"op": "reference", "label": "Re-reference", "params": {"mode": "average"}},
    {"op": "filter", "label": "Band-pass filter", "params": {"l_freq": 1.0, "h_freq": 40.0}},
    {"op": "notch", "label": "Notch (line noise)", "params": {"freq": 50}},
    {"op": "resample", "label": "Resample", "params": {"sfreq": 128}},
    {"op": "detect_bads", "label": "Detect bad channels", "params": {"z": 4.0, "corr": 0.4}},
    {"op": "interpolate", "label": "Interpolate bads", "params": {}},
    {"op": "ica", "label": "ICA artifact removal", "params": {"n_components": 15, "method": "fastica", "eog_ch": "Fp1"}},
]


def detect_bad_channels(raw: mne.io.BaseRaw, z: float = 4.0, corr: float = 0.4) -> list[str]:
    """Relative outlier detection (variance + correlation) with a cap.

    Absolute thresholds nuke clean data (mean inter-channel correlation is ~0.2–0.4),
    so flag only statistical outliers and never more than 25% of channels.
    """
    data = raw.get_data(picks="eeg")
    names = [raw.ch_names[i] for i in mne.pick_types(raw.info, eeg=True)]
    var = np.var(data, axis=1)
    logv = np.log(var + 1e-30)
    zv = (logv - logv.mean()) / (logv.std() + 1e-12)
    C = np.corrcoef(data)
    np.fill_diagonal(C, 0.0)
    meanabs = np.nanmean(np.abs(C), axis=1)
    cz = (meanabs - np.median(meanabs)) / (meanabs.std() + 1e-12)
    bad = set(np.where(np.abs(zv) > z)[0]) | set(np.where(var < 1e-20)[0]) | set(np.where(cz < -2.5)[0])
    cap = max(1, int(0.25 * len(names)))
    return [names[i] for i in sorted(bad)[:cap]]


def _mean_psd(raw: mne.io.BaseRaw) -> dict:
    r = raw.copy()
    r.info["bads"] = []  # QC spectrum spans all channels regardless of marks
    p = dsp.compute_psd(r, fmin=1.0, fmax=min(45.0, r.info["sfreq"] / 2 - 1))
    arr = np.asarray(p["psd_db"])
    return {"freqs": p["freqs"], "mean": arr.mean(axis=0).tolist()}


def run_pipeline(nd: NeuroData, steps: list[dict]) -> tuple[NeuroData, dict]:
    raw = nd.raw.copy()
    psd_before = _mean_psd(raw)
    detected_bads: list[str] = []
    ica_excluded: list[int] = []
    applied: list[dict] = []

    for step in steps:
        op = step.get("op")
        p = step.get("params", {}) or {}
        try:
            if op == "reference":
                if p.get("mode", "average") == "average":
                    raw.set_eeg_reference("average", projection=False, verbose="ERROR")
                else:
                    raw.set_eeg_reference([p["channel"]], verbose="ERROR")
            elif op == "filter":
                raw.filter(p.get("l_freq"), p.get("h_freq"), verbose="ERROR")
            elif op == "notch":
                f = float(p.get("freq", 50)); nyq = raw.info["sfreq"] / 2
                raw.notch_filter([f * k for k in range(1, 5) if f * k < nyq], verbose="ERROR")
            elif op == "resample":
                raw.resample(float(p.get("sfreq", 128)), verbose="ERROR")
            elif op == "detect_bads":
                detected_bads = detect_bad_channels(raw, float(p.get("z", 4.0)), float(p.get("corr", 0.4)))
                raw.info["bads"] = sorted(set(raw.info["bads"]) | set(detected_bads))
            elif op == "interpolate":
                if raw.info["bads"]:
                    raw.interpolate_bads(reset_bads=True, verbose="ERROR")
            elif op == "ica":
                ica = mne.preprocessing.ICA(
                    n_components=int(p.get("n_components", 15)),
                    method=p.get("method", "fastica"), max_iter="auto", random_state=42, verbose="ERROR")
                ica.fit(raw)
                try:
                    eog, _ = ica.find_bads_eog(raw, ch_name=p.get("eog_ch", "Fp1"), verbose="ERROR")
                except Exception:
                    eog = []
                ica.exclude = eog
                ica_excluded = list(map(int, eog))
                ica.apply(raw, verbose="ERROR")
            else:
                continue
            applied.append({"op": op, "params": p})
        except Exception as e:  # noqa: BLE001 — surface step failures to QC
            applied.append({"op": op, "params": p, "error": str(e)})

    new = NeuroData(raw, entities=nd.entities, source_format=f"{nd.source_format} ▸ preprocessed")
    new.provenance = list(nd.provenance) + [ProvenanceStep(f"prep:{s['op']}", s.get("params", {})) for s in applied]
    new.extra = {**nd.extra, "parent": nd.id, "pipeline": applied}

    qc = {
        "new_id": new.id,
        "psd_before": psd_before,
        "psd_after": _mean_psd(raw),
        "detected_bads": detected_bads,
        "ica_excluded": ica_excluded,
        "applied": applied,
        "sfreq": new.sfreq,
        "n_channels": new.n_channels,
    }
    return new, qc
