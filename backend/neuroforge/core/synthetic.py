# Synthetic EEG so the app works without real recordings. Pink-noise background,
# posterior alpha with a slow eyes-open/closed envelope, frontal blinks, optional
# mains noise, and an oddball event track for ERP. Returns a real RawArray on a
# standard_1020 montage, so all downstream MNE ops work on it unchanged.
from __future__ import annotations

import numpy as np
import mne

from .montage import DEFAULT_32


# Channels where each generator source projects most strongly.
_POSTERIOR = {"P7", "P3", "Pz", "P4", "P8", "PO3", "POz", "PO4", "O1", "O2"}
_FRONTAL = {"Fp1", "Fp2", "AF3", "AF4", "F7", "F3", "Fz", "F4", "F8"}


def _pink_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    """1/f noise via spectral shaping of white noise."""
    white = rng.standard_normal(n)
    spec = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n)
    freqs[0] = freqs[1] if len(freqs) > 1 else 1.0
    spec = spec / np.sqrt(freqs)
    out = np.fft.irfft(spec, n=n)
    return out / (np.std(out) or 1.0)


def generate(
    *,
    n_seconds: float = 60.0,
    sfreq: float = 256.0,
    ch_names: list[str] | None = None,
    line_freq: float | None = 50.0,
    seed: int | None = None,
) -> tuple[mne.io.RawArray, dict]:
    """Return (raw, info_dict). ``info_dict`` carries paradigm details."""
    rng = np.random.default_rng(seed)
    ch_names = list(ch_names or DEFAULT_32)
    n_ch = len(ch_names)
    n = int(round(n_seconds * sfreq))
    t = np.arange(n) / sfreq

    data = np.zeros((n_ch, n), dtype=np.float64)

    # Slow alpha envelope: waxing/waning + a couple of "eyes-closed" boosts.
    alpha_env = 0.6 + 0.4 * np.sin(2 * np.pi * 0.05 * t)
    for c0, c1 in [(0.15, 0.30), (0.62, 0.80)]:
        a, b = int(c0 * n), int(c1 * n)
        alpha_env[a:b] *= 2.2

    alpha_f = 10.0
    for i, name in enumerate(ch_names):
        sig = 8.0 * _pink_noise(n, rng)  # µV-scale background

        post = 1.0 if name in _POSTERIOR else 0.18
        phase = rng.uniform(0, 2 * np.pi)
        sig += post * 14.0 * alpha_env * np.sin(2 * np.pi * alpha_f * t + phase)

        # Frontal theta (~6 Hz) and broadband beta.
        front = 1.0 if name in _FRONTAL else 0.3
        sig += front * 4.0 * np.sin(2 * np.pi * 6.0 * t + rng.uniform(0, 6.28))
        sig += 2.0 * _pink_noise(n, rng) * np.sin(2 * np.pi * 20.0 * t)

        data[i] = sig

    # Eye blinks: ~0.25 Hz Poisson-ish, biphasic bumps in frontal channels.
    n_blinks = int(n_seconds * 0.25)
    blink_times = np.sort(rng.uniform(0, n_seconds, n_blinks))
    blink_kernel_t = np.linspace(-0.2, 0.4, int(0.6 * sfreq))
    blink = np.exp(-((blink_kernel_t) ** 2) / (2 * 0.06 ** 2))
    for i, name in enumerate(ch_names):
        gain = {"Fp1": 1.0, "Fp2": 1.0, "AF3": 0.7, "AF4": 0.7,
                "F7": 0.4, "F8": 0.4, "Fz": 0.3}.get(name, 0.05)
        if gain <= 0.05:
            continue
        for bt in blink_times:
            s0 = int((bt - 0.2) * sfreq)
            s1 = s0 + blink.size
            if s0 < 0 or s1 > n:
                continue
            data[i, s0:s1] += gain * 90.0 * blink * rng.uniform(0.8, 1.2)

    # Mains line noise.
    if line_freq:
        for h in (1, 2):
            amp = 3.0 / h
            data += amp * np.sin(2 * np.pi * line_freq * h * t)[None, :]

    # Convert µV -> V for MNE.
    data *= 1e-6

    info = mne.create_info(ch_names, sfreq, ch_types="eeg")
    raw = mne.io.RawArray(data, info, verbose="ERROR")
    raw.set_montage("standard_1020", on_missing="ignore", verbose="ERROR")

    # Oddball event track: 85% standard, 15% target, ~1.2 s SOA.
    soa = 1.2
    onsets = np.arange(2.0, n_seconds - 1.0, soa)
    descs = np.where(rng.random(onsets.size) < 0.15, "stim/target", "stim/standard")
    annot = mne.Annotations(onset=onsets, duration=np.zeros_like(onsets),
                            description=list(descs))
    raw.set_annotations(annot)

    paradigm = {
        "paradigm": "auditory-oddball (synthetic)",
        "n_events": int(onsets.size),
        "line_freq": line_freq,
        "notes": "Synthetic data — posterior alpha, frontal blinks, mains noise.",
    }
    return raw, paradigm
