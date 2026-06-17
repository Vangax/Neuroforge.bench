"""NeuroForge Python client — drive the platform from your own scripts / notebooks.

    pip install requests numpy
    from neuroforge_client import NeuroForge
    nf = NeuroForge("http://localhost:8000")          # token=... if auth is on
    ds = nf.datasets()
    nf.upload("subject01_rest.edf")                   # your own file
    w  = nf.window(ds[0]["id"], 0, 10)                # numpy arrays
    acc = nf.decode(ds[0]["id"], "lda")               # waits on the job
    out = nf.run_code("result = {'n': len(raw.ch_names)}", [d["id"] for d in ds], mode="each")
"""
from __future__ import annotations

import os
import time

import requests
import numpy as np


class NeuroForge:
    def __init__(self, base_url: str = "http://localhost:8000", token: str | None = None, timeout: int = 120):
        self.base = base_url.rstrip("/")
        self.timeout = timeout
        self.s = requests.Session()
        if token:
            self.s.headers["Authorization"] = f"Bearer {token}"

    # --- transport ---------------------------------------------------------
    def _get(self, path: str, **params):
        r = self.s.get(self.base + path, params=params, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, json=None, files=None, data=None):
        r = self.s.post(self.base + path, json=json, files=files, data=data, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    # --- meta --------------------------------------------------------------
    def health(self):
        return self._get("/api/health")

    def system(self):
        return self._get("/api/system")

    # --- datasets (M1) -----------------------------------------------------
    def datasets(self):
        return self._get("/api/datasets")["datasets"]

    def tree(self):
        return self._get("/api/datasets/tree")["tree"]

    def dataset(self, ds_id: str):
        return self._get(f"/api/datasets/{ds_id}")

    def channels(self, ds_id: str):
        return self._get(f"/api/datasets/{ds_id}/channels")

    def events(self, ds_id: str):
        return self._get(f"/api/datasets/{ds_id}/events")["events"]

    def upload(self, path: str, subject: str = "imported", session: str | None = None, task: str | None = None):
        with open(path, "rb") as f:
            data = {"subject": subject}
            if session:
                data["session"] = session
            if task:
                data["task"] = task
            return self._post("/api/datasets/upload", files={"file": (os.path.basename(path), f)}, data=data)

    def synthetic(self, **kwargs):
        return self._post("/api/datasets/synthetic", json=kwargs)

    # --- visualization / spectral (M2) ------------------------------------
    def window(self, ds_id: str, start: float = 0.0, duration: float = 10.0, picks=None, as_numpy: bool = True):
        params = {"start": start, "duration": duration}
        if picks:
            params["picks"] = ",".join(picks)
        w = self._get(f"/api/signal/{ds_id}/window", **params)
        if as_numpy:
            w["data"] = np.asarray(w["data"])
            w["times"] = np.asarray(w["times"])
        return w

    def psd(self, ds_id: str, fmin: float = 0.5, fmax: float = 45.0, method: str = "welch"):
        return self._get(f"/api/spectral/{ds_id}/psd", fmin=fmin, fmax=fmax, method=method)

    def band_power(self, ds_id: str, relative: bool = False):
        return self._get(f"/api/spectral/{ds_id}/bandpower", relative=str(relative).lower())

    def topomap(self, ds_id: str, fmin: float = 8.0, fmax: float = 13.0, resolution: int = 48):
        return self._get(f"/api/spectral/{ds_id}/topomap", fmin=fmin, fmax=fmax, resolution=resolution)

    # --- analysis (M5) -----------------------------------------------------
    def features(self, ds_id: str):
        return self._get(f"/api/analyze/{ds_id}/features")

    def connectivity(self, ds_id: str, method: str = "plv", band: str = "alpha"):
        return self._get(f"/api/analyze/{ds_id}/connectivity", method=method, band=band)

    def aperiodic(self, ds_id: str):
        return self._get(f"/api/analyze/{ds_id}/aperiodic")

    def microstates(self, ds_id: str, n_states: int = 4):
        return self._get(f"/api/analyze/{ds_id}/microstates", n_states=n_states)

    # --- jobs --------------------------------------------------------------
    def job(self, job_id: str):
        return self._get(f"/api/jobs/{job_id}")

    def wait(self, job_id: str, poll: float = 0.5, timeout: float = 600):
        end = time.time() + timeout
        while time.time() < end:
            j = self.job(job_id)
            if j["status"] == "done":
                return j.get("result")
            if j["status"] == "error":
                raise RuntimeError(j.get("error") or "job failed")
            time.sleep(poll)
        raise TimeoutError("job timed out")

    # --- heavy ops (M3/M7/M8) — submit then wait --------------------------
    def preprocess(self, ds_id: str, steps: list[dict]):
        return self.wait(self._post(f"/api/preprocess/{ds_id}/run", json={"steps": steps})["job_id"])

    def decode(self, ds_id: str, classifier: str = "lda", folds: int = 5):
        return self.wait(self._post(f"/api/bci/{ds_id}/decode", json={"classifier": classifier, "folds": folds})["job_id"])

    def benchmark(self, ds_id: str):
        return self.wait(self._get(f"/api/bench/{ds_id}/pipelines")["job_id"])

    # --- custom code (M11) -------------------------------------------------
    def run_code(self, code: str, dataset_ids, params: dict | None = None, mode: str = "each"):
        body: dict = {"code": code, "params": params or {}, "mode": mode}
        if isinstance(dataset_ids, str):
            body["dataset_id"] = dataset_ids
        elif len(dataset_ids) == 1:
            body["dataset_id"] = dataset_ids[0]
        else:
            body["dataset_ids"] = list(dataset_ids)
        return self.wait(self._post("/api/scripts/run", json=body)["job_id"])

    # --- export (M10) ------------------------------------------------------
    def export(self, ds_id: str, fmt: str = "fif", out_path: str | None = None) -> str:
        r = self.s.get(f"{self.base}/api/report/{ds_id}/export", params={"fmt": fmt}, timeout=self.timeout)
        r.raise_for_status()
        path = out_path or f"{ds_id}.{fmt}"
        with open(path, "wb") as f:
            f.write(r.content)
        return path
