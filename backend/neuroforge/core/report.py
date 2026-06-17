# Reporting + export. Render figures server-side (matplotlib Agg) into a
# self-contained HTML report; export datasets to FIF / CSV / NumPy / HDF5 / EDF.
from __future__ import annotations

import io
import base64
import hashlib
import platform
import tempfile
import os

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import mne  # noqa: E402

from . import dsp  # noqa: E402

_BG = "#0a0609"


def _fig_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, facecolor=_BG, bbox_inches="tight")
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _style(ax):
    ax.set_facecolor(_BG)
    for s in ax.spines.values():
        s.set_color("#7c5526")
    ax.tick_params(colors="#c4b3ab", labelsize=8)
    ax.title.set_color("#ffd884")
    ax.xaxis.label.set_color("#c4b3ab")
    ax.yaxis.label.set_color("#c4b3ab")


def build_report(nd) -> str:
    raw = nd.raw
    meta = nd.metadata_dict()

    # PSD figure
    p = dsp.compute_psd(raw, fmin=1.0, fmax=min(45, raw.info["sfreq"] / 2 - 1))
    arr = np.asarray(p["psd_db"])
    fig1, ax = plt.subplots(figsize=(6, 2.6))
    for row in arr:
        ax.plot(p["freqs"], row, color="#ff2f5e", alpha=0.10, lw=0.6)
    ax.plot(p["freqs"], arr.mean(0), color="#ffc85a", lw=1.6)
    ax.set_title("Power spectral density"); ax.set_xlabel("Hz"); ax.set_ylabel("dB")
    _style(ax)
    psd_img = _fig_b64(fig1)

    # topomap figure (alpha)
    topo_img = ""
    try:
        eeg = raw.copy().pick("eeg")
        bp = dsp.band_powers(eeg, picks=None)
        vals = np.array(bp["bands"]["alpha"])
        fig2, ax2 = plt.subplots(figsize=(2.8, 2.8))
        mne.viz.plot_topomap(vals, eeg.info, axes=ax2, show=False, cmap="inferno", contours=4)
        ax2.set_title("Alpha topography", color="#ffd884", fontsize=9)
        fig2.patch.set_facecolor(_BG)
        topo_img = _fig_b64(fig2)
    except Exception:
        topo_img = ""

    rows = "".join(
        f"<tr><td>{k}</td><td>{v}</td></tr>"
        for k, v in [
            ("Dataset", meta["label"]), ("ID", meta["id"]), ("Source", meta["source_format"]),
            ("Sampling rate", f"{meta['sfreq']} Hz"), ("Channels", meta["n_channels"]),
            ("Duration", f"{meta['duration']:.1f} s"), ("Events", meta["n_events"]),
            ("Passband", f"{meta['highpass']:.1f}–{meta['lowpass']:.1f} Hz"),
        ]
    )
    prov = "".join(f"<li><b>{s['op']}</b> <code>{s['params']}</code></li>" for s in meta["provenance"])

    return f"""<!doctype html><html><head><meta charset='utf-8'><style>
    body{{background:{_BG};color:#c4b3ab;font-family:'Share Tech Mono',monospace;padding:24px;}}
    h1{{color:#ffd884;letter-spacing:.3em;font-weight:400}} h2{{color:#ff6f93;font-size:13px;letter-spacing:.2em;border-bottom:1px solid #7c5526;padding-bottom:4px}}
    table{{border-collapse:collapse;width:100%;font-size:12px}} td{{border-bottom:1px solid #2a1d20;padding:3px 8px}} td:first-child{{color:#7d6c66;text-transform:uppercase;font-size:10px}}
    img{{max-width:100%;border:1px solid #2a1d20;margin:8px 0}} code{{color:#ffb22e}} li{{margin:2px 0}}
    .grid{{display:flex;gap:16px;flex-wrap:wrap}} .card{{flex:1;min-width:280px}}
    </style></head><body>
    <h1>NEUROFORGE&nbsp;&middot;&nbsp;ANALYSIS REPORT</h1>
    <p style='color:#7d6c66'>desktop imperium · auto-generated · {platform.node()}</p>
    <h2>Dataset</h2><table>{rows}</table>
    <div class='grid'><div class='card'><h2>Spectrum</h2><img src='{psd_img}'></div>
    <div class='card'><h2>Topography</h2>{f"<img src='{topo_img}'>" if topo_img else "<p>n/a</p>"}</div></div>
    <h2>Provenance</h2><ul>{prov}</ul>
    </body></html>"""


def export_dataset(nd, fmt: str) -> tuple[bytes, str, str]:
    raw = nd.raw
    base = nd.entities.label()
    fmt = fmt.lower()

    if fmt == "csv":
        import pandas as pd
        data = raw.get_data() * 1e6
        df = pd.DataFrame(data.T, columns=raw.ch_names)
        df.insert(0, "time_s", raw.times)
        return df.to_csv(index=False).encode(), f"{base}.csv", "text/csv"

    if fmt == "npy":
        buf = io.BytesIO(); np.save(buf, raw.get_data())
        return buf.getvalue(), f"{base}.npy", "application/octet-stream"

    if fmt == "hdf5":
        import h5py
        buf = io.BytesIO()
        with h5py.File(buf, "w") as f:
            f.create_dataset("data", data=raw.get_data(), compression="gzip")
            f.attrs["sfreq"] = raw.info["sfreq"]
            f.attrs["ch_names"] = list(raw.ch_names)
        return buf.getvalue(), f"{base}.h5", "application/x-hdf5"

    # file-based writers (fif / edf)
    suffix = {"fif": "_raw.fif", "edf": ".edf"}.get(fmt)
    if suffix is None:
        raise ValueError(f"Unsupported export format: {fmt}")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    try:
        if fmt == "fif":
            raw.save(tmp.name, overwrite=True, verbose="ERROR")
            media = "application/octet-stream"
        else:
            mne.export.export_raw(tmp.name, raw, fmt="edf", overwrite=True, verbose="ERROR")
            media = "application/octet-stream"
        with open(tmp.name, "rb") as fh:
            data = fh.read()
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
    return data, base + suffix, media


def environment() -> dict:
    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "numpy": np.__version__,
        "mne": mne.__version__,
    }


def repro_hash(nd) -> str:
    h = hashlib.sha256()
    h.update(nd.raw.get_data().tobytes())
    return h.hexdigest()[:16]
