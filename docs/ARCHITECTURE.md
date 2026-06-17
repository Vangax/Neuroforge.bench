# NeuroForge — Architecture

## 1. Principles

1. **BIDS-native** — entities (`sub`/`ses`/`task`/`run`/`datatype`) are first-class.
2. **One object model** — every input format normalizes to `NeuroData`.
3. **Reproducible** — every transform appends a provenance step.
4. **Real computation** — DSP runs on MNE/SciPy; no mock numbers.
5. **Config-driven** — bands, limits, palette in one place; nothing hardcoded deep.
6. **Stable contract** — the frontend depends on the API shape, not internals, so the
   in-memory registry can become SQLite/Postgres without touching the UI.

## 2. The `NeuroData` object model

`backend/neuroforge/core/neurodata.py` wraps an MNE `Raw` (numerical truth) and attaches:

| Field | Purpose |
|-------|---------|
| `raw` | MNE `BaseRaw` — signals, info, montage, annotations |
| `entities` | `BidsEntities(subject, session, task, run, datatype)` |
| `source_format`, `source_path` | ingest provenance |
| `provenance[]` | `ProvenanceStep(op, params, timestamp, software)` — W3C-PROV-lite |
| `extra` | paradigm / arbitrary metadata |

Wire-facing views (JSON-serializable, consumed by the API):
`metadata_dict()`, `channels_table()` (BIDS `channels.tsv` flavor + 2-D topo coords),
`topomap_positions()`, `events()`, `get_window()` (decimated viewer window).

## 3. Module map (backend)

```
core/
  neurodata.py   NeuroData, BidsEntities, ProvenanceStep
  loaders.py     format registry + dispatch (M1) + synthetic factory
  synthetic.py   physiologically-plausible EEG generator
  dsp.py         compute_psd · band_powers · topomap_grid · apply_filter (M2/M5)
  montage.py     standard montages + azimuthal 2-D projection
  registry.py    in-memory dataset index + BIDS tree (→ DB target)
  pipeline.py    M3 — step catalog, bad-channel detection, run_pipeline (+ICA)
  features.py    M5 — Hjorth/entropy/Higuchi/DFA + PLV/PLI/wPLI/coh + graph
  decoding.py    M8 — CSP/Riemannian epoching + classifiers + metrics
  report.py      M10 — matplotlib HTML report + FIF/CSV/NPY/HDF5/EDF export
api/
  datasets.py    M1 — ingest, tree, formats, metadata, channels, events
  signal.py      M2 — time-domain windowed signal
  spectral.py    M2 — PSD, band power, topomap
  preprocess.py  M3   erp.py  M4   analyze.py  M5   mapper.py  M6
  benchmark.py   M7   bci.py  M8   edit.py     M9   report.py  M10
models/schemas.py  pydantic request/response contracts
config.py        bands, palette, viewer limits, CORS
main.py          app assembly (11 routers) + startup seeding (synthetic cohort)
```

## 4. Module map (frontend)

```
components/  Boot · HeroBurst (generative art) · SceneDecor (margin HUD) · hud (Panel/KV/Chip/Spinner)
modules/
  repository/  Repository — drop-zone, BIDS tree, metadata, channels, formats, synth forge
  visualize/   Visualize — SignalViewer · PSDPanel · Topomap · BandPower · Brain3D
  placeholder/ ModulePlaceholder — roadmap cards (M3–M10) with full spec
api/client.ts  typed client; probes /api/health, auto-falls-back to lib/synthetic
lib/           synthetic (offline engine) · format (inferno/color/time helpers)
styles/        tokens.css (design system) · hud.css (components)
```

## 5. Request flow (example: alpha topomap)

```
UI band="alpha" → api.topomap(id, 8, 13, 48)
   → GET /api/spectral/{id}/topomap
   → dsp.topomap_grid: raw.compute_psd(welch) → integrate 8–13 Hz per channel (dB)
       → montage.project_2d → scipy.griddata cubic interpolation onto a disk grid
   → JSON {grid, positions, vmin, vmax}
   → Topomap.tsx renders inferno heat + head outline + electrodes on <canvas>
```

## 6. Database schema (target for Module 1)

The registry interface (`add/get/all/tree`) is intentionally swappable. Target schema:

```
project(id, name, bids_root, created_at)
subject(id, project_id, label, age, sex, group, meta_json)
session(id, subject_id, label, acq_date, meta_json)
recording(id, session_id, task, run, datatype, sfreq, n_channels, n_times,
          duration, source_format, source_path, checksum, created_at)
channel(id, recording_id, name, type, units, x, y, z, status)
event(id, recording_id, onset, duration, trial_type, value)
derivative(id, recording_id, pipeline_id, path, provenance_json, created_at)
pipeline(id, name, spec_json, hash)            -- Module 3 templates
```

## 7. Extension points

- **File formats** — add an extension → reader entry in `loaders._REGISTRY`.
- **DSP / features** — add a function in `core/dsp.py`, expose via an `api/` router.
- **Visualizations** — drop a `<canvas>`/WebGL component into a module; consume the typed client.
- **Modules** — each new module is a backend router + a frontend module folder against the
  same `NeuroData` contract; `ModulePlaceholder` already reserves the UI slot.

## 8. Performance posture

- Viewer **decimates server-side** to ≤ `max_points_per_channel` (config) so 256ch@2kHz
  windows never flood the client.
- Heavy math stays in NumPy/SciPy/MNE (vectorized); GPU (CuPy) and Celery/RQ are
  declared optional in `requirements.txt` for the scaling path.
- Lazy/chunked reading and a real DB index are the Module-1 hardening items.
