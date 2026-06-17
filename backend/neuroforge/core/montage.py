# Montage geometry + 2-D topo projection. We project 3-D electrode positions to
# normalised 2-D here so the frontend can draw scalp maps itself.
# Projection: azimuthal-equidistant from the vertex (Cz), nose +Y, right ear +X
# (the conventional nose-up topomap orientation).
from __future__ import annotations

import numpy as np
import mne


# A solid 32-channel 10-20 set; every name exists in MNE's standard_1020.
DEFAULT_32 = [
    "Fp1", "Fp2", "AF3", "AF4",
    "F7", "F3", "Fz", "F4", "F8",
    "FC5", "FC1", "FC2", "FC6",
    "T7", "C3", "Cz", "C4", "T8",
    "CP5", "CP1", "CP2", "CP6",
    "P7", "P3", "Pz", "P4", "P8",
    "PO3", "POz", "PO4",
    "O1", "O2",
]


def standard_montage(kind: str = "standard_1020") -> mne.channels.DigMontage:
    return mne.channels.make_standard_montage(kind)


def _project(ch_pos: dict[str, np.ndarray]) -> dict[str, tuple[float, float]]:
    raw_xy: dict[str, tuple[float, float]] = {}
    radii = []
    for name, p in ch_pos.items():
        v = np.asarray(p, dtype=float)
        n = np.linalg.norm(v)
        if n == 0 or not np.all(np.isfinite(v)):
            continue
        ux, uy, uz = v / n
        theta = np.arccos(np.clip(uz, -1.0, 1.0))   # polar angle from the vertex
        phi = np.arctan2(uy, ux)
        x = theta * np.cos(phi)
        y = theta * np.sin(phi)
        raw_xy[name] = (x, y)
        radii.append(np.hypot(x, y))
    if not raw_xy:
        return {}
    ref = float(np.percentile(radii, 95)) or 1.0   # ring approaches the unit circle
    return {name: (x / ref, y / ref) for name, (x, y) in raw_xy.items()}


def project_2d(ch_names: list[str], kind: str = "standard_1020") -> dict[str, tuple[float, float]]:
    """Project channels onto the unit disk using a standard montage, by name."""
    pos = standard_montage(kind).get_positions()["ch_pos"]
    sel: dict[str, np.ndarray] = {}
    for name in ch_names:
        p = pos.get(name)
        if p is None:
            p = pos.get(name.capitalize())
        if p is not None:
            sel[name] = p
    return _project(sel)


def project_raw(inst) -> dict[str, tuple[float, float]]:
    """Prefer the recording's OWN electrode positions; fall back to name matching.

    This is what makes topographies work on real caps (BioSemi, custom montages),
    not just the synthetic standard_1020 layout.
    """
    try:
        montage = inst.get_montage()
    except Exception:
        montage = None
    if montage is not None:
        cp = montage.get_positions().get("ch_pos") or {}
        sel = {n: cp[n] for n in inst.ch_names
               if n in cp and cp[n] is not None and np.all(np.isfinite(cp[n]))}
        if len(sel) >= 3:
            return _project(sel)
    return project_2d(list(inst.ch_names))
