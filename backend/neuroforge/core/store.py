# Durable storage: metadata in SQLite, raw data as FIF on disk. Datasets and
# their derivatives survive restarts. The registry writes through to this.
from __future__ import annotations

import json
import os
import sqlite3
import hashlib
import logging
from dataclasses import asdict
from pathlib import Path

import mne

from .neurodata import NeuroData, BidsEntities, ProvenanceStep

log = logging.getLogger("neuroforge.store")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id            TEXT PRIMARY KEY,
    label         TEXT,
    subject       TEXT,
    session       TEXT,
    task          TEXT,
    run           TEXT,
    datatype      TEXT,
    source_format TEXT,
    source_path   TEXT,
    fif_path      TEXT,
    parent_id     TEXT,
    summary_json  TEXT,
    extra_json    TEXT,
    prov_json     TEXT,
    checksum      TEXT,
    created_at    REAL
);
"""


class Store:
    def __init__(self, db_path: str, data_dir: str):
        self.db_path = db_path
        self.raw_dir = Path(data_dir) / "raw"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute(_SCHEMA)
        self._db.commit()

    def save(self, nd: NeuroData) -> None:
        # Write the FIF once (path is stable per id), then upsert the row.
        fif = self.raw_dir / f"{nd.id}_raw.fif"
        if nd.fif_path != str(fif):
            nd.raw.save(str(fif), overwrite=True, verbose="ERROR")
            nd._fif_path = str(fif)

        s = nd._scalars()
        e = nd.entities
        checksum = hashlib.sha256(nd.raw.get_data().tobytes()).hexdigest()[:16]
        self._db.execute(
            "INSERT OR REPLACE INTO datasets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                nd.id, e.label(), e.subject, e.session, e.task, e.run, e.datatype,
                nd.source_format, nd.source_path, nd.fif_path, nd.extra.get("parent"),
                json.dumps(s), json.dumps(nd.extra),
                json.dumps([asdict(p) for p in nd.provenance]),
                checksum, nd.created_at,
            ),
        )
        self._db.commit()
        nd._raw = None  # data is safe on disk now; free RAM, reload lazily when needed

    def load_all(self) -> list[NeuroData]:
        out: list[NeuroData] = []
        for r in self._db.execute("SELECT * FROM datasets ORDER BY created_at"):
            if not r["fif_path"] or not os.path.exists(r["fif_path"]):
                log.warning("dropping %s: FIF missing at %s", r["id"], r["fif_path"])
                continue
            ent = BidsEntities(
                subject=r["subject"], session=r["session"], task=r["task"],
                run=r["run"], datatype=r["datatype"] or "eeg",
            )
            prov = [ProvenanceStep(**p) for p in json.loads(r["prov_json"] or "[]")]
            out.append(NeuroData(
                None, entities=ent, source_format=r["source_format"], source_path=r["source_path"],
                extra=json.loads(r["extra_json"] or "{}"), dataset_id=r["id"],
                fif_path=r["fif_path"], summary=json.loads(r["summary_json"] or "null"),
                provenance=prov, created_at=r["created_at"],
            ))
        return out

    def delete(self, dataset_id: str) -> None:
        row = self._db.execute("SELECT fif_path FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if row and row["fif_path"] and os.path.exists(row["fif_path"]):
            try:
                os.unlink(row["fif_path"])
            except OSError:
                pass
        self._db.execute("DELETE FROM datasets WHERE id=?", (dataset_id,))
        self._db.commit()

    def count(self) -> int:
        return self._db.execute("SELECT COUNT(*) AS n FROM datasets").fetchone()["n"]
