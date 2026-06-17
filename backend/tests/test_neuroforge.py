# Test suite. Persistence is isolated to a temp dir via NEUROFORGE_DATA, set
# before any neuroforge import so the global settings pick it up.
import os
import math
import time
import tempfile

os.environ["NEUROFORGE_DATA"] = tempfile.mkdtemp(prefix="nf_test_")

import numpy as np
import pytest

from neuroforge.core import loaders, dsp, montage, pipeline, features, decoding, synthetic
from neuroforge.core.store import Store
from neuroforge.core.registry import Registry


def _syn(seconds=15, seed=11):
    return loaders.make_synthetic(seed=seed, n_seconds=seconds)


def test_synthetic_shape():
    raw, info = synthetic.generate(n_seconds=10, seed=0)
    assert raw.info["sfreq"] == 256
    assert len(raw.ch_names) == 32
    assert info["n_events"] > 0


def test_neurodata_window_and_metadata():
    nd = _syn(20, 4)
    w = nd.get_window(start=0, duration=5, max_points=500)
    assert len(w["times"]) <= 500
    assert len(w["data"]) == nd.n_channels
    md = nd.metadata_dict()
    assert md["n_channels"] == 32 and md["duration"] > 0


def test_montage_projection_in_disk():
    pos = montage.project_2d(montage.DEFAULT_32)
    assert len(pos) == 32
    for x, y in pos.values():
        assert math.hypot(x, y) < 1.6


def test_dsp_psd_band_topo():
    nd = _syn(15, 1)
    p = dsp.compute_psd(nd.raw)
    assert len(p["freqs"]) > 0 and len(p["psd_db"]) == 32
    bp = dsp.band_powers(nd.raw)
    assert {"alpha", "beta", "delta"} <= set(bp["bands"])
    tm = dsp.topomap_grid(nd.raw, fmin=8, fmax=13, resolution=20)
    assert tm["resolution"] == 20 and len(tm["positions"]) > 0


def test_pipeline_creates_derivative():
    nd = _syn(15, 7)
    new, qc = pipeline.run_pipeline(nd, [
        {"op": "filter", "params": {"l_freq": 1.0, "h_freq": 40.0}},
        {"op": "notch", "params": {"freq": 50}},
    ])
    assert new.id != nd.id
    assert qc["psd_after"]["mean"]
    assert any(p.op.startswith("prep:") for p in new.provenance)


def test_features_and_connectivity():
    nd = _syn(15, 2)
    f = features.channel_features(nd.raw)
    assert len(f["rows"]) == nd.n_channels and "higuchi" in f["columns"]
    c = features.connectivity(nd.raw, "plv", "alpha")
    m = c["matrix"]
    assert abs(m[0][1] - m[1][0]) < 1e-9          # symmetric
    assert 0.0 <= c["density"] <= 1.0


def test_decoding_metrics_valid():
    nd = _syn(30, 11)
    r = decoding.decode(nd.raw, classifier="lda", folds=3)
    assert 0.0 <= r["accuracy"] <= 1.0
    assert -1.0 <= r["kappa"] <= 1.0
    assert r["n_epochs"] > 10
    assert np.array(r["confusion"]).shape == (2, 2)


def test_store_roundtrip_and_lazy():
    d = tempfile.mkdtemp()
    store = Store(os.path.join(d, "t.db"), d)
    nd = _syn(10, 5)
    store.save(nd)
    assert nd.fif_path and os.path.exists(nd.fif_path)

    fresh = Store(os.path.join(d, "t.db"), d)
    items = {x.id: x for x in fresh.load_all()}
    assert nd.id in items
    got = items[nd.id]
    assert not got.loaded                          # lazy: nothing read yet
    assert got.metadata_dict()["n_channels"] == 32  # served from cached summary
    assert not got.loaded                          # still lazy
    assert got.raw.info["sfreq"] == nd.sfreq       # now reads the FIF
    assert got.loaded

    fresh.delete(nd.id)
    assert not os.path.exists(nd.fif_path)


def test_registry_survives_restart():
    d = tempfile.mkdtemp()
    reg = Registry()
    reg.attach(Store(os.path.join(d, "r.db"), d))
    nd = _syn(10, 3)
    reg.add(nd)

    reg2 = Registry()
    reg2.attach(Store(os.path.join(d, "r.db"), d))
    assert any(x.id == nd.id for x in reg2.all())
    assert reg2.tree()  # tree builds from cached summaries without loading FIFs


def test_api_endpoints():
    from fastapi.testclient import TestClient
    from neuroforge.main import app
    with TestClient(app) as c:
        assert c.get("/api/health").json()["n_datasets"] >= 3
        ds = c.get("/api/datasets").json()["datasets"]
        did = ds[0]["id"]
        assert c.get(f"/api/signal/{did}/window?duration=2").status_code == 200
        assert c.get(f"/api/spectral/{did}/topomap?resolution=16").status_code == 200
        assert c.get("/api/preprocess/catalog").status_code == 200
        assert c.get("/api/bci/classifiers").status_code == 200


def test_loaders_format_registry():
    fmts = {f["ext"]: f["status"] for f in loaders.supported_formats()}
    assert fmts[".edf"] == "ready" and fmts[".fif"] == "ready"
    with pytest.raises(NotImplementedError):
        loaders.load_file("x.nwb")


def _wait(jm, jid, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        j = jm.get(jid)
        if j and j.status in ("done", "error"):
            return j
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def test_job_manager():
    from neuroforge.core.jobs import JobManager
    jm = JobManager(workers=1)
    ok = jm.submit("t", lambda: 21 * 2)
    assert _wait(jm, ok.id).result == 42
    bad = jm.submit("t", lambda: 1 / 0)
    assert _wait(jm, bad.id).status == "error"


def test_security_roles():
    from fastapi import HTTPException
    from neuroforge.core.security import require, auth
    dep = require("analyst")
    auth.enabled = False
    assert dep(None) == "admin"                 # disabled -> open
    auth.enabled, auth.tokens = True, {"a": "admin", "v": "viewer"}
    with pytest.raises(HTTPException):
        dep(None)                               # missing token -> 401
    with pytest.raises(HTTPException):
        dep("Bearer v")                         # viewer < analyst -> 403
    assert dep("Bearer a") == "admin"
    auth.enabled, auth.tokens = False, {}        # restore for other tests


def test_api_async_job_and_system():
    from fastapi.testclient import TestClient
    from neuroforge.main import app
    with TestClient(app) as c:
        did = c.get("/api/datasets").json()["datasets"][0]["id"]
        r = c.post(f"/api/preprocess/{did}/run",
                   json={"steps": [{"op": "filter", "params": {"l_freq": 1.0, "h_freq": 40.0}}]})
        assert r.status_code == 200
        jid = r.json()["job_id"]
        end = time.time() + 15
        jr = {}
        while time.time() < end:
            jr = c.get(f"/api/jobs/{jid}").json()
            if jr["status"] in ("done", "error"):
                break
            time.sleep(0.05)
        assert jr["status"] == "done"
        assert "dataset" in jr["result"] and "qc" in jr["result"]

        sysr = c.get("/api/system").json()
        assert sysr["datasets"] >= 3 and "jobs" in sysr and "auth_enabled" in sysr


def test_script_store():
    from neuroforge.core.scripts import ScriptStore
    ss = ScriptStore(os.path.join(tempfile.mkdtemp(), "sc.db"))
    s = ss.save("t", "desc", "result = 1")
    assert s["id"] and s["name"] == "t"
    assert any(x["id"] == s["id"] for x in ss.list())
    assert ss.get(s["id"])["code"] == "result = 1"
    ss.delete(s["id"])
    assert ss.get(s["id"]) is None


def test_script_run_subprocess():
    from neuroforge.core import scripts
    from neuroforge.core.store import Store
    d = tempfile.mkdtemp()
    Store(os.path.join(d, "s.db"), d).save(nd := _syn(10, 8))  # sets fif_path
    out = scripts.run_script(nd, "result = {'n': len(raw.ch_names), 'sf': raw.info['sfreq']}", {})
    assert out["ok"] is True and out["result"]["n"] == 32
    bad = scripts.run_script(nd, "1/0", {})
    assert bad["ok"] is False and "error" in bad


def test_api_script_run():
    from fastapi.testclient import TestClient
    from neuroforge.main import app
    with TestClient(app) as c:
        did = c.get("/api/datasets").json()["datasets"][0]["id"]
        assert c.get("/api/scripts").status_code == 200
        r = c.post("/api/scripts/run",
                   json={"dataset_id": did, "code": "result = {'m': float(raw.get_data().mean())}"})
        assert r.status_code == 200
        jid = r.json()["job_id"]
        end, jr = time.time() + 30, {}
        while time.time() < end:
            jr = c.get(f"/api/jobs/{jid}").json()
            if jr["status"] in ("done", "error"):
                break
            time.sleep(0.1)
        assert jr["status"] == "done" and jr["result"]["ok"] is True
        assert "m" in jr["result"]["result"]


def test_raw_cache_eviction():
    from neuroforge.core.cache import RawCache
    from neuroforge.core.store import Store
    d = tempfile.mkdtemp()
    store = Store(os.path.join(d, "c.db"), d)
    nds = [_syn(8, 30 + i) for i in range(3)]
    for nd in nds:
        store.save(nd)          # persisted; samples freed to disk
    rc = RawCache(max_loaded=2)
    for nd in nds:
        _ = nd.raw              # reload from disk
        rc.touch(nd)
    assert len(rc.loaded_ids()) == 2
    assert nds[0]._raw is None  # least-recently-used was evicted


def test_aperiodic_1f():
    from neuroforge.core import features
    a = features.aperiodic(_syn(20, 11).raw)
    assert len(a["exponent"]) == 32
    assert a["mean"]["exponent"] > 0          # 1/f: power falls with frequency
    assert len(a["mean_psd_db"]) == len(a["freqs"])


def test_microstates():
    from neuroforge.core import features
    m = features.microstates(_syn(20, 11).raw, n_states=4)
    assert len(m["maps"]) == 4 and len(m["maps"][0]["positions"]) > 0
    assert abs(sum(m["coverage"]) - 1.0) < 1e-6      # every sample labelled
    assert 0.0 <= m["gev"] <= 1.0
    assert len(m["transitions"]) == 4 and len(m["transitions"][0]) == 4


def test_script_batch_group_and_errors():
    from neuroforge.core import scripts
    from neuroforge.core.store import Store
    d = tempfile.mkdtemp()
    store = Store(os.path.join(d, "g.db"), d)
    a, b = _syn(8, 1), _syn(8, 2)
    store.save(a); store.save(b)

    rb = scripts.run_batch([a, b], "result = {'n': len(raw.ch_names)}")
    assert rb["mode"] == "each" and rb["n"] == 2 and rb["ok"]
    assert rb["runs"][0]["result"]["n"] == 32

    rg = scripts.run_group([a, b], "result = {'k': len(raws), 'helper': nf.band_powers(raws[0])['relative']}")
    assert rg["ok"] and rg["result"]["k"] == 2

    err = scripts.run_script(a, "this is not valid python !!")
    assert err["ok"] is False and err["error_type"] == "user"


def test_montage_endpoint_and_project_raw():
    from neuroforge.core.registry import registry
    from neuroforge.core import montage
    from neuroforge.api import edit as editmod
    nd = _syn(8, 5)
    registry.add(nd)
    assert "standard_1020" in editmod.montages()["montages"]
    out = editmod.set_montage(nd.id, editmod.MontageOps(montage="standard_1020"))
    assert out["id"] != nd.id and out["n_channels"] == 32
    # project_raw uses the recording's own positions
    pos = montage.project_raw(nd.raw)
    assert len(pos) == 32


def test_erp_spatiotemporal_clusters():
    from neuroforge.core.registry import registry
    from neuroforge.api import erp as erpmod
    nd = _syn(30, 12)
    registry.add(nd)
    res = erpmod.compute(nd.id, erpmod.ERPRequest())
    assert res["conditions"] and "times_ms" in res
    if "difference" in res:
        assert "cluster_method" in res        # spatio-temporal (or 1-D fallback)


def test_real_edf_channel_detection():
    # BigP3BCI: 114 channels, 32 real EEG (prefixed EEG_) + speller/state channels
    from pathlib import Path
    from neuroforge.core import loaders, features
    p = Path(__file__).resolve().parents[2] / "test" / "A_01_SE001_CB_Test08.edf"
    if not p.exists():
        pytest.skip("BigP3BCI test file not present")
    nd = loaders.load_file(str(p))
    det = nd.extra["channel_detection"]
    assert det["n_total"] == 114
    assert det["n_eeg"] == 32 and det["auto_detected"] is True
    assert "Fz" in nd.raw.ch_names and "EEG_Fz" not in nd.raw.ch_names   # renamed
    assert len(nd.topomap_positions()) >= 30                              # real montage
    assert len(features.channel_features(nd.raw)["rows"]) == 32           # analysis uses the 32 EEG
