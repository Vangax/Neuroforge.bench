# Feature extraction: time-domain (Hjorth, entropy, Higuchi, DFA), spectral, and
# connectivity (PLV/PLI/wPLI/coherence from band-limited analytic signals) plus
# basic graph metrics.
from __future__ import annotations

import math

import numpy as np
from scipy import signal as sps
from scipy.stats import skew, kurtosis
import mne

from ..config import DEFAULT_BANDS
from . import montage as mtg


def hjorth(x: np.ndarray) -> tuple[float, float, float]:
    dx = np.diff(x)
    ddx = np.diff(dx)
    v0 = np.var(x) + 1e-30
    v1 = np.var(dx) + 1e-30
    v2 = np.var(ddx) + 1e-30
    mob = np.sqrt(v1 / v0)
    comp = np.sqrt(v2 / v1) / (mob + 1e-30)
    return float(v0), float(mob), float(comp)


def higuchi_fd(x: np.ndarray, kmax: int = 10) -> float:
    n = len(x); lk = []
    for k in range(1, kmax + 1):
        lm = []
        for m in range(k):
            idx = np.arange(m, n, k)
            if len(idx) < 2:
                continue
            lmk = np.sum(np.abs(np.diff(x[idx]))) * (n - 1) / (((len(idx) - 1)) * k)
            lm.append(lmk)
        if lm:
            lk.append((np.log(np.mean(lm) + 1e-30), np.log(1.0 / k)))
    if len(lk) < 2:
        return 0.0
    y, xx = zip(*lk)
    return float(np.polyfit(xx, y, 1)[0])


def dfa(x: np.ndarray, n_scales: int = 12) -> float:
    x = np.cumsum(x - np.mean(x))
    n = len(x)
    scales = np.unique(np.logspace(0.7, np.log10(n // 4), n_scales).astype(int))
    f = []
    for s in scales:
        if s < 4:
            continue
        m = n // s
        seg = x[: m * s].reshape(m, s)
        t = np.arange(s)
        rms = []
        for row in seg:
            c = np.polyfit(t, row, 1)
            rms.append(np.sqrt(np.mean((row - np.polyval(c, t)) ** 2)))
        f.append((np.log(s), np.log(np.mean(rms) + 1e-30)))
    if len(f) < 2:
        return 0.0
    a, b = zip(*f)
    return float(np.polyfit(a, b, 1)[0])


def perm_entropy(x: np.ndarray, order: int = 3, delay: int = 1) -> float:
    n = len(x)
    patterns = {}
    for i in range(n - delay * (order - 1)):
        vec = tuple(np.argsort(x[i: i + delay * order: delay]))
        patterns[vec] = patterns.get(vec, 0) + 1
    counts = np.array(list(patterns.values()), dtype=float)
    p = counts / counts.sum()
    return float(-np.sum(p * np.log2(p)) / np.log2(math.factorial(order)))


def analysis_picks(raw: mne.io.BaseRaw) -> mne.io.BaseRaw:
    # prefer EEG; fall back to all data channels for non-EEG recordings
    has_eeg = len(mne.pick_types(raw.info, eeg=True)) > 0
    out = raw.copy().pick("eeg" if has_eeg else "data")
    if len(out.ch_names) == 0:
        raise ValueError("no analysable channels in this recording")
    return out


def channel_features(raw: mne.io.BaseRaw) -> dict:
    raw = analysis_picks(raw)
    data = raw.get_data() * 1e6  # µV
    sf = raw.info["sfreq"]
    psd = raw.compute_psd(method="welch", fmin=0.5, fmax=min(45, sf / 2 - 1), verbose="ERROR")
    pdat, freqs = psd.get_data(return_freqs=True)

    rows = []
    for i, name in enumerate(raw.ch_names):
        x = data[i]
        act, mob, comp = hjorth(x)
        spec = pdat[i]
        cum = np.cumsum(spec) / (np.sum(spec) + 1e-30)
        sef95 = float(freqs[np.searchsorted(cum, 0.95)] if cum[-1] >= 0.95 else freqs[-1])
        medf = float(freqs[np.searchsorted(cum, 0.5)])
        peakf = float(freqs[int(np.argmax(spec))])
        rows.append({
            "name": name,
            "mean": float(np.mean(x)), "sd": float(np.std(x)), "rms": float(np.sqrt(np.mean(x ** 2))),
            "skew": float(skew(x)), "kurtosis": float(kurtosis(x)),
            "mobility": mob, "complexity": comp,
            "zcr": float(np.mean(np.abs(np.diff(np.sign(x))) > 0)),
            "higuchi": higuchi_fd(x), "dfa": dfa(x), "perm_entropy": perm_entropy(x),
            "sef95": sef95, "median_freq": medf, "peak_freq": peakf,
        })

    columns = ["name", "rms", "sd", "skew", "kurtosis", "mobility", "complexity",
               "zcr", "higuchi", "dfa", "perm_entropy", "sef95", "median_freq", "peak_freq"]
    return {"rows": rows, "columns": columns}


def aperiodic(raw: mne.io.BaseRaw, fmin: float = 1.0, fmax: float = 40.0) -> dict:
    # specparam/FOOOF-style split: fit the 1/f aperiodic component (offset + exponent)
    # in log-log, then read oscillatory peaks off the flattened residual. The aperiodic
    # exponent is a popular marker (E/I balance, arousal). Fixed mode (no knee).
    raw = analysis_picks(raw)
    sf = raw.info["sfreq"]
    spec = raw.compute_psd(method="welch", fmin=fmin, fmax=min(fmax, sf / 2 - 1), verbose="ERROR")
    psd, freqs = spec.get_data(return_freqs=True)
    logf = np.log10(freqs)
    logp = np.log10(psd + 1e-30)

    exps, offs, r2s, fits = [], [], [], []
    for row in logp:
        chi, b = np.polyfit(logf, row, 1)          # row ≈ b + chi*log10(f)
        fit = b + chi * logf
        ss_res = float(np.sum((row - fit) ** 2))
        ss_tot = float(np.sum((row - row.mean()) ** 2)) + 1e-30
        exps.append(float(-chi)); offs.append(float(b)); r2s.append(1 - ss_res / ss_tot)
        fits.append(fit)

    mean_logp = logp.mean(axis=0)
    mean_fit = np.asarray(fits).mean(axis=0)
    resid = mean_logp - mean_fit                    # flattened spectrum
    idx, _ = sps.find_peaks(resid, height=0.05, distance=2)
    order = np.argsort(resid[idx])[::-1] if len(idx) else []
    peaks = [{"cf": float(freqs[i]), "power": float(resid[i])} for i in np.asarray(idx)[order][:8]]

    pos = mtg.project_raw(raw)
    return {
        "channels": raw.ch_names,
        "exponent": exps, "offset": offs, "r2": r2s,
        "positions": [{"name": n, "x": pos[n][0], "y": pos[n][1], "value": exps[i]}
                      for i, n in enumerate(raw.ch_names) if n in pos],
        "freqs": freqs.tolist(),
        "mean_psd_db": (10 * mean_logp).tolist(),
        "mean_aperiodic_db": (10 * mean_fit).tolist(),
        "peaks": peaks,
        "mean": {"exponent": float(np.mean(exps)), "offset": float(np.mean(offs)), "r2": float(np.mean(r2s))},
    }


_MS_LETTERS = ["A", "B", "C", "D", "E", "F", "G"]


def microstates(raw: mne.io.BaseRaw, n_states: int = 4, seed: int = 42) -> dict:
    # EEG microstates via polarity-invariant modified k-means on GFP-peak maps
    # (Pascual-Marqui / Koenig). Returns the canonical maps + coverage, mean
    # duration, occurrence, transitions and a back-fitted label sequence.
    raw = analysis_picks(raw)
    if len(raw.ch_names) < 4:
        raise ValueError("need >= 4 channels for microstates")
    raw = raw.copy().set_eeg_reference("average", projection=False, verbose="ERROR")
    data = raw.get_data()                       # n_ch x n_times (avg-referenced)
    sf = raw.info["sfreq"]
    gfp = data.std(axis=0)

    peaks, _ = sps.find_peaks(gfp, distance=max(1, int(sf * 0.01)))
    if len(peaks) < n_states * 5:
        peaks = np.arange(0, data.shape[1], max(1, int(sf * 0.02)))

    V = data[:, peaks].T
    V = V - V.mean(axis=1, keepdims=True)
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-30)

    rng = np.random.default_rng(seed)
    maps = Vn[rng.choice(len(Vn), n_states, replace=False)].copy()
    for _ in range(100):
        labels = np.argmax(np.abs(Vn @ maps.T), axis=1)
        new = maps.copy()
        for k in range(n_states):
            members = Vn[labels == k]
            if len(members) == 0:
                continue
            _, _, vt = np.linalg.svd(members, full_matrices=False)  # 1st eigenvector ~ polarity-free mean
            new[k] = vt[0] / (np.linalg.norm(vt[0]) + 1e-30)
        if np.allclose(np.abs(np.sum(new * maps, axis=1)), 1.0, atol=1e-7):
            maps = new
            break
        maps = new

    # back-fit every sample (winner = max |cosine| with a map)
    dm = data - data.mean(axis=0, keepdims=True)
    dn = dm / (np.linalg.norm(dm, axis=0, keepdims=True) + 1e-30)
    corr = np.abs(maps @ dn)                     # K x n_times
    seq = np.argmax(corr, axis=0)
    gev = float(np.sum(gfp ** 2 * np.max(corr, axis=0) ** 2) / (np.sum(gfp ** 2) + 1e-30))

    coverage = [float(np.mean(seq == k)) for k in range(n_states)]
    durations: list[list[int]] = [[] for _ in range(n_states)]
    cur, run = int(seq[0]), 1
    for s in seq[1:]:
        if s == cur:
            run += 1
        else:
            durations[cur].append(run); cur, run = int(s), 1
    durations[cur].append(run)
    total_s = data.shape[1] / sf
    mean_dur = [float(np.mean(d) / sf * 1000) if d else 0.0 for d in durations]   # ms
    occ = [float(len(d) / total_s) for d in durations]                            # per second

    trans = np.zeros((n_states, n_states))
    for a, b in zip(seq[:-1], seq[1:]):
        if a != b:
            trans[a, b] += 1
    trans = trans / (trans.sum(axis=1, keepdims=True) + 1e-30)

    pos = mtg.project_raw(raw)
    letters = _MS_LETTERS[:n_states]
    map_out = [{
        "label": letters[k],
        "positions": [{"name": n, "x": pos[n][0], "y": pos[n][1], "value": float(maps[k, i])}
                      for i, n in enumerate(raw.ch_names) if n in pos],
    } for k in range(n_states)]

    step = max(1, len(seq) // 1500)
    return {
        "n_states": n_states, "letters": letters, "gev": gev,
        "coverage": coverage, "mean_duration_ms": mean_dur, "occurrence_per_s": occ,
        "transitions": trans.tolist(), "maps": map_out,
        "sequence": seq[::step].astype(int).tolist(),
    }


def connectivity(raw: mne.io.BaseRaw, method: str = "plv", band: str = "alpha") -> dict:
    raw = analysis_picks(raw)
    lo, hi = DEFAULT_BANDS.get(band, (8.0, 13.0))
    flt = raw.copy().filter(lo, hi, verbose="ERROR")
    data = flt.get_data()
    names = flt.ch_names
    n = len(names)
    sf = flt.info["sfreq"]

    M = np.zeros((n, n))
    if method == "coh":
        for i in range(n):
            for j in range(i + 1, n):
                f, cxy = sps.coherence(data[i], data[j], fs=sf, nperseg=int(min(sf * 2, data.shape[1])))
                mask = (f >= lo) & (f <= hi)
                M[i, j] = M[j, i] = float(np.mean(cxy[mask])) if mask.any() else 0.0
    else:
        analytic = sps.hilbert(data, axis=1)
        phase = np.angle(analytic)
        for i in range(n):
            for j in range(i + 1, n):
                d = phase[i] - phase[j]
                if method == "plv":
                    v = np.abs(np.mean(np.exp(1j * d)))
                elif method == "pli":
                    v = np.abs(np.mean(np.sign(np.sin(d))))
                else:  # wpli
                    im = np.sin(d)
                    v = np.abs(np.mean(im)) / (np.mean(np.abs(im)) + 1e-30)
                M[i, j] = M[j, i] = float(v)

    # graph metrics on a thresholded (top 25%) binary graph
    tri = M[np.triu_indices(n, 1)]
    thr = float(np.percentile(tri, 75)) if tri.size else 0.0
    A = (M >= thr).astype(float); np.fill_diagonal(A, 0)
    deg = A.sum(axis=1)
    clustering = []
    for i in range(n):
        nb = np.where(A[i] > 0)[0]
        if len(nb) < 2:
            clustering.append(0.0); continue
        sub = A[np.ix_(nb, nb)]
        clustering.append(float(sub.sum() / (len(nb) * (len(nb) - 1))))

    pos = mtg.project_raw(raw)
    nodes = [{
        "name": nm, "x": pos.get(nm, (0, 0))[0], "y": pos.get(nm, (0, 0))[1],
        "degree": float(deg[i]), "clustering": clustering[i], "strength": float(M[i].sum()),
    } for i, nm in enumerate(names)]

    return {
        "method": method, "band": band, "band_hz": [lo, hi],
        "matrix": M.tolist(), "names": names, "nodes": nodes,
        "threshold": thr,
        "global_clustering": float(np.mean(clustering)),
        "density": float(A.sum() / (n * (n - 1))) if n > 1 else 0.0,
    }
