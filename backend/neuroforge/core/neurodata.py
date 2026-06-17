# Internal data model: an MNE Raw plus BIDS entities, events and a provenance log.
#
# Raw can be lazy. When rehydrated from the store we hold the FIF path and only
# read samples off disk when something actually needs them -- listing the
# repository must not pull every recording into memory. Scalar metadata is cached
# in `summary` so the dataset list stays cheap even for un-loaded recordings.
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict

import numpy as np
import mne

from . import montage as mtg


@dataclass
class ProvenanceStep:
    op: str
    params: dict
    timestamp: float = field(default_factory=time.time)
    software: str = field(default_factory=lambda: f"mne {mne.__version__}")


@dataclass
class BidsEntities:
    subject: str = "01"
    session: str | None = None
    task: str | None = None
    run: str | None = None
    datatype: str = "eeg"

    def label(self) -> str:
        parts = [f"sub-{self.subject}"]
        if self.session:
            parts.append(f"ses-{self.session}")
        if self.task:
            parts.append(f"task-{self.task}")
        if self.run:
            parts.append(f"run-{self.run}")
        return "_".join(parts)


class NeuroData:
    def __init__(
        self,
        raw: mne.io.BaseRaw | None = None,
        *,
        entities: BidsEntities | None = None,
        source_format: str = "synthetic",
        source_path: str | None = None,
        extra: dict | None = None,
        dataset_id: str | None = None,
        fif_path: str | None = None,
        summary: dict | None = None,
        provenance: list[ProvenanceStep] | None = None,
        created_at: float | None = None,
    ):
        self.id = dataset_id or uuid.uuid4().hex[:12]
        self._raw = raw
        self._fif_path = fif_path
        self.summary = summary
        self.entities = entities or BidsEntities()
        self.source_format = source_format
        self.source_path = source_path
        self.extra = extra or {}
        self.created_at = created_at or time.time()
        self.provenance = provenance if provenance is not None else [
            ProvenanceStep("load", {"format": source_format, "path": source_path})
        ]

    @property
    def raw(self) -> mne.io.BaseRaw:
        if self._raw is None:
            if not self._fif_path:
                raise RuntimeError(f"dataset {self.id} has no data on disk")
            self._raw = mne.io.read_raw_fif(self._fif_path, preload=True, verbose="ERROR")
            from .cache import cache  # lazy import to avoid a cycle
            cache.touch(self)
        return self._raw

    @property
    def loaded(self) -> bool:
        return self._raw is not None

    @property
    def fif_path(self) -> str | None:
        return self._fif_path

    def _scalars(self) -> dict:
        # Compute once from raw (forces a load) and cache; cheap to serialise.
        if self.summary is None:
            r = self.raw
            counts: dict[str, int] = {}
            for t in r.get_channel_types():
                counts[t] = counts.get(t, 0) + 1
            self.summary = {
                "sfreq": float(r.info["sfreq"]),
                "n_channels": len(r.ch_names),
                "n_times": int(r.n_times),
                "duration": r.n_times / float(r.info["sfreq"]),
                "highpass": float(r.info["highpass"]),
                "lowpass": float(r.info["lowpass"]),
                "channel_type_counts": counts,
                "n_events": len(r.annotations),
            }
        return self.summary

    @property
    def sfreq(self) -> float:
        return self._scalars()["sfreq"]

    @property
    def n_channels(self) -> int:
        return self._scalars()["n_channels"]

    @property
    def n_times(self) -> int:
        return self._scalars()["n_times"]

    @property
    def duration(self) -> float:
        return self._scalars()["duration"]

    @property
    def ch_names(self) -> list[str]:
        return list(self.raw.ch_names)

    def add_provenance(self, op: str, params: dict) -> None:
        self.provenance.append(ProvenanceStep(op, params))

    def metadata_dict(self) -> dict:
        s = self._scalars()
        return {
            "id": self.id,
            "label": self.entities.label(),
            "entities": asdict(self.entities),
            "source_format": self.source_format,
            "source_path": self.source_path,
            "sfreq": s["sfreq"],
            "n_channels": s["n_channels"],
            "n_times": s["n_times"],
            "duration": s["duration"],
            "highpass": s["highpass"],
            "lowpass": s["lowpass"],
            "channel_type_counts": s["channel_type_counts"],
            "n_events": s["n_events"],
            "extra": self.extra,
            "provenance": [asdict(p) for p in self.provenance],
            "created_at": self.created_at,
            "persisted": self._fif_path is not None,
        }

    def channels_table(self) -> list[dict]:
        # channels.tsv-style description, with 2-D topo coords where the montage has them.
        types = self.raw.get_channel_types()
        pos2d = mtg.project_raw(self.raw)
        rows = []
        for name, ctype in zip(self.ch_names, types):
            x, y = pos2d.get(name, (None, None))
            rows.append({
                "name": name, "type": ctype.upper(),
                "units": "µV" if ctype == "eeg" else "n/a",
                "x": x, "y": y, "has_position": name in pos2d,
            })
        return rows

    def topomap_positions(self) -> list[dict]:
        pos2d = mtg.project_raw(self.raw)
        return [{"name": n, "x": x, "y": y} for n, (x, y) in pos2d.items()]

    def events(self) -> list[dict]:
        ann = self.raw.annotations
        return [
            {"onset": float(o), "duration": float(d), "description": str(desc)}
            for o, d, desc in zip(ann.onset, ann.duration, ann.description)
        ]

    def get_window(
        self,
        *,
        start: float = 0.0,
        duration: float = 10.0,
        picks: list[str] | None = None,
        max_points: int = 4000,
    ) -> dict:
        # Decimated window for the scrolling viewer; stays under max_points/channel.
        sf = self.sfreq
        start = max(0.0, min(start, self.duration))
        stop = min(self.duration, start + duration)
        s0 = int(start * sf)
        s1 = max(s0 + 1, int(stop * sf))

        sel = picks or self.raw.ch_names
        idx = [self.raw.ch_names.index(c) for c in sel if c in self.raw.ch_names]
        data, times = self.raw[idx, s0:s1]
        times = times.astype(float)

        step = max(1, int(np.ceil(data.shape[1] / max_points)))
        return {
            "start": start,
            "duration": stop - start,
            "sfreq": sf,
            "decimation": step,
            "times": times[::step].tolist(),
            "ch_names": [self.raw.ch_names[i] for i in idx],
            "data": (data[:, ::step] * 1e6).astype(float).tolist(),  # µV for display
            "units": "µV",
        }
