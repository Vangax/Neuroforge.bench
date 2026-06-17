# DSP on MNE/SciPy: PSD (Welch/multitaper), band power, scalp-grid interpolation
# for topographies, and filtering.
from __future__ import annotations

import numpy as np
import mne
from scipy.interpolate import griddata

from ..config import DEFAULT_BANDS
from . import montage as mtg

# np.trapz was renamed to np.trapezoid in NumPy 2.0 (old name removed)
_trapz = np.trapezoid if hasattr(np, "trapezoid") else np.trapz


def compute_psd(
    raw: mne.io.BaseRaw,
    *,
    fmin: float = 0.5,
    fmax: float = 45.0,
    method: str = "welch",
    picks: list[str] | None = None,
) -> dict:
    """Welch or multitaper PSD. Returns freqs (Hz) and psd in dB (n_ch, n_freq)."""
    fmax = min(fmax, raw.info["sfreq"] / 2.0 - 1.0)
    kwargs = dict(fmin=fmin, fmax=fmax, picks=picks, verbose="ERROR")
    if method == "welch":
        n_fft = int(min(raw.n_times, raw.info["sfreq"] * 4))
        spec = raw.compute_psd(method="welch", n_fft=n_fft, **kwargs)
    else:
        spec = raw.compute_psd(method="multitaper", **kwargs)

    psd, freqs = spec.get_data(return_freqs=True)
    psd_db = 10.0 * np.log10(np.maximum(psd, 1e-30))
    return {
        "freqs": freqs.astype(float).tolist(),
        "psd_db": psd_db.astype(float).tolist(),
        "ch_names": spec.ch_names,
        "method": method,
        "units": "dB (10·log10 V²/Hz)",
    }


def band_powers(
    raw: mne.io.BaseRaw,
    *,
    bands: dict[str, tuple[float, float]] | None = None,
    picks: list[str] | None = None,
    relative: bool = False,
) -> dict:
    """Absolute (or relative) band power per channel via integrated Welch PSD."""
    bands = bands or DEFAULT_BANDS
    nyq = raw.info["sfreq"] / 2.0
    top = min(max(b[1] for b in bands.values()) + 5, nyq - 1)
    spec = raw.compute_psd(method="welch", fmin=0.5, fmax=top, picks=picks,
                           verbose="ERROR")
    psd, freqs = spec.get_data(return_freqs=True)

    total = _trapz(psd, freqs, axis=1)
    out: dict[str, list[float]] = {}
    for name, (lo, hi) in bands.items():
        mask = (freqs >= lo) & (freqs < hi)
        if not mask.any():
            out[name] = [0.0] * psd.shape[0]
            continue
        bp = _trapz(psd[:, mask], freqs[mask], axis=1)
        if relative:
            bp = bp / np.maximum(total, 1e-30)
        out[name] = bp.astype(float).tolist()

    return {
        "bands": out,
        "ch_names": spec.ch_names,
        "relative": relative,
        "band_defs": {k: list(v) for k, v in bands.items()},
    }


def topomap_grid(
    raw: mne.io.BaseRaw,
    *,
    fmin: float = 8.0,
    fmax: float = 13.0,
    resolution: int = 48,
    picks: list[str] | None = None,
) -> dict:
    """Interpolated scalp grid of band power for a topographic map.

    Returns a ``resolution × resolution`` grid (NaN outside the head disk),
    plus electrode positions/values so the frontend can overlay sensors.
    """
    spec = raw.compute_psd(method="welch", fmin=max(0.5, fmin - 2),
                           fmax=min(fmax + 2, raw.info["sfreq"] / 2 - 1),
                           picks=picks, verbose="ERROR")
    psd, freqs = spec.get_data(return_freqs=True)
    mask = (freqs >= fmin) & (freqs < fmax)
    if not mask.any():
        mask = slice(None)
    values = _trapz(psd[:, mask], freqs[mask], axis=1)
    values = 10.0 * np.log10(np.maximum(values, 1e-30))

    pos2d = mtg.project_raw(raw)
    names, xs, ys, vals = [], [], [], []
    for name, v in zip(spec.ch_names, values):
        if name in pos2d:
            x, y = pos2d[name]
            names.append(name); xs.append(x); ys.append(y); vals.append(float(v))
    if len(names) < 4:
        return {"grid": [], "positions": [], "resolution": resolution}

    xs = np.array(xs); ys = np.array(ys); vals = np.array(vals)
    lin = np.linspace(-1.3, 1.3, resolution)
    gx, gy = np.meshgrid(lin, lin)
    grid = griddata((xs, ys), vals, (gx, gy), method="cubic")
    nn = griddata((xs, ys), vals, (gx, gy), method="nearest")
    grid = np.where(np.isnan(grid), nn, grid)
    grid[np.hypot(gx, gy) > 1.15] = np.nan  # clip outside the head

    finite = grid[np.isfinite(grid)]
    return {
        "grid": np.where(np.isfinite(grid), grid, None).tolist(),
        "resolution": resolution,
        "extent": [-1.3, 1.3, -1.3, 1.3],
        "vmin": float(finite.min()) if finite.size else 0.0,
        "vmax": float(finite.max()) if finite.size else 1.0,
        "band": [fmin, fmax],
        "positions": [
            {"name": n, "x": float(x), "y": float(y), "value": float(v)}
            for n, x, y, v in zip(names, xs, ys, vals)
        ],
    }


def apply_filter(
    raw: mne.io.BaseRaw,
    *,
    l_freq: float | None = None,
    h_freq: float | None = None,
    notch: float | None = None,
) -> mne.io.BaseRaw:
    """Return a filtered copy (zero-phase FIR). Non-destructive."""
    out = raw.copy()
    if notch:
        nyq = out.info["sfreq"] / 2.0
        freqs = [notch * k for k in range(1, 5) if notch * k < nyq]
        out.notch_filter(freqs, verbose="ERROR")
    if l_freq or h_freq:
        out.filter(l_freq, h_freq, verbose="ERROR")
    return out
