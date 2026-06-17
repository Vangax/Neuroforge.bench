# NeuroForge Python client

Drive NeuroForge from your own scripts or Jupyter notebooks — load your data,
run analyses, decode, and pull results back as NumPy. The backend must be running
(`cd backend && python run.py`).

```bash
pip install requests numpy
```

```python
from neuroforge_client import NeuroForge

nf = NeuroForge("http://localhost:8000")      # token="..." if the server has auth on

# load your own recording (any MNE-readable format)
meta = nf.upload("sub-01_task-rest.edf")
print(meta["label"], meta["channel_type_counts"])   # e.g. real EEG auto-detected

ds = nf.datasets()
did = ds[0]["id"]

# data as numpy
w = nf.window(did, start=0, duration=10)             # w["data"]: (n_ch, n_samp)
psd = nf.psd(did, fmin=1, fmax=40)

# modern analyses
ap = nf.aperiodic(did)                               # 1/f exponent + peaks
ms = nf.microstates(did, n_states=4)                 # maps, coverage, transitions

# heavy ops run as jobs; these wait and return the result
clean = nf.preprocess(did, [{"op": "filter", "params": {"l_freq": 1, "h_freq": 40}},
                            {"op": "ica", "params": {"n_components": 15}}])
acc = nf.decode(did, "lda")
print("decoding accuracy:", acc["accuracy"])

# run your OWN code on one or many datasets (isolated subprocess on the server)
out = nf.run_code(
    "import numpy as np; result = {'rms': float(np.sqrt((raw.get_data()**2).mean()))}",
    [d["id"] for d in ds], mode="each",
)

# export a BIDS-friendly derivative
nf.export(did, "fif", "clean_raw.fif")
```

Everything here maps 1:1 to the REST API (full OpenAPI at `http://localhost:8000/docs`),
so you can also call it from any language.
