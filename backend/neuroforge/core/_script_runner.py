# Child process that runs ONE user script and exits. Spawned by core.scripts.
# Reads a job (JSON) on stdin, writes the result (JSON) to job["out"].
# Isolation: separate process + parent-side timeout + (POSIX) memory cap. This is
# for trusted authenticated users; full untrusted sandboxing needs a container.
#
# Errors are classified so the platform never takes the blame for user mistakes:
#   error_type="system"  -> our setup / data loading failed
#   error_type="user"    -> the user's code raised
import sys
import io
import json
import types
import base64
import traceback


def _jsonable(v, _depth=0):
    import numpy as np
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    if isinstance(v, np.ndarray):
        flat = v.ravel()
        return {"__array__": list(v.shape), "values": [float(x) for x in flat[:5000]],
                "truncated": bool(flat.size > 5000)}
    if isinstance(v, dict):
        return {str(k): _jsonable(val, _depth + 1) for k, val in list(v.items())[:200]}
    if isinstance(v, (list, tuple, set)):
        return [_jsonable(x, _depth + 1) for x in list(v)[:5000]]
    try:
        import pandas as pd
        if isinstance(v, pd.DataFrame):
            return {"__dataframe__": list(v.columns.astype(str)),
                    "rows": v.head(500).astype(object).where(v.notna(), None).values.tolist()}
    except Exception:
        pass
    return str(v)


def main() -> None:
    job = json.loads(sys.stdin.read())
    out_path = job["out"]
    res: dict = {"ok": False}

    # ---- system phase: anything here failing is OUR problem, not the user's ----
    try:
        import numpy as np
        import scipy
        import pandas as pd
        import mne
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from neuroforge.core import dsp, features

        try:
            import resource
            mb = int(job.get("mem_mb", 2048))
            resource.setrlimit(resource.RLIMIT_AS, (mb * 1024 * 1024, mb * 1024 * 1024))
        except Exception:
            pass

        try:
            import sklearn  # noqa: F401 — exposed if present
        except Exception:
            sklearn = None

        mne.set_log_level("ERROR")
        nf = types.SimpleNamespace(
            compute_psd=dsp.compute_psd, band_powers=dsp.band_powers,
            topomap_grid=dsp.topomap_grid, apply_filter=dsp.apply_filter,
            channel_features=features.channel_features, connectivity=features.connectivity,
            aperiodic=features.aperiodic, microstates=features.microstates,
            hjorth=features.hjorth, higuchi_fd=features.higuchi_fd,
            dfa=features.dfa, perm_entropy=features.perm_entropy,
        )

        if "fifs" in job:  # group mode: many datasets at once
            raws = [mne.io.read_raw_fif(d["fif"], preload=True, verbose="ERROR") for d in job["fifs"]]
            datasets = [{"id": d.get("id"), "label": d.get("label")} for d in job["fifs"]]
            primary = raws[0] if raws else None
        else:               # single dataset
            primary = mne.io.read_raw_fif(job["fif"], preload=True, verbose="ERROR")
            raws, datasets = [primary], [{"id": job.get("id"), "label": job.get("label")}]

        ns: dict = {
            "np": np, "scipy": scipy, "pd": pd, "mne": mne, "plt": plt, "sklearn": sklearn,
            "nf": nf, "raw": primary, "raws": raws, "datasets": datasets,
            "params": job.get("params") or {}, "result": None,
        }
    except Exception:
        res = {"ok": False, "error_type": "system", "error": traceback.format_exc()[-3000:]}
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(res, f)
        return

    # ---- user phase: failures here are the user's code ----
    try:
        exec(job["code"], ns)
        result = ns.get("result")
        if result is None and callable(ns.get("run")):
            result = ns["run"](ns["raw"], ns["params"])

        figures = []
        for num in plt.get_fignums():
            buf = io.BytesIO()
            plt.figure(num).savefig(buf, format="png", dpi=100, bbox_inches="tight", facecolor="#0a0609")
            figures.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())

        res = {"ok": True, "result": _jsonable(result), "figures": figures[:8]}
    except Exception:
        tb = traceback.format_exc()
        hint = ""
        if "ModuleNotFoundError" in tb:
            hint = "\n\n(hint: that package isn't installed on the server)"
        res = {"ok": False, "error_type": "user", "error": tb[-3500:] + hint}

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(res, f)


if __name__ == "__main__":
    main()
