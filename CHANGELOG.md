# Changelog

## 0.1.0 — first public release

First end-to-end release: a BIDS-native, MNE-powered brain-data platform with a
FastAPI backend, a React/WebGL HUD frontend, a Python client, and a test suite.

### Modules
- **M1 Universal Loader / BIDS repository** — EDF/BDF/GDF/BrainVision/EEGLAB/FIFF/EGI
  via MNE; synthetic generator; subject/session tree; durable SQLite + FIF store.
- **M2 Interactive visualization** — multichannel viewer, Welch/multitaper PSD,
  inferno topomap, 3D head, band-power matrix, real-time scroll.
- **M3 Preprocessing** — visual pipeline (re-ref/filter/notch/resample/bad-channels/ICA),
  before/after QC, non-destructive derivatives.
- **M4 ERP/ERF** — epoching, condition averages, GFP, peaks, difference waves,
  **spatio-temporal cluster permutation** stats, difference topographies.
- **M5 Signal analyzer** — Hjorth/entropy/Higuchi/DFA, spectral metrics,
  PLV/PLI/wPLI/coherence + connectogram + graph metrics, **aperiodic 1/f (specparam)**,
  **EEG microstates**.
- **M6 Cross-session mapper** — cohort dashboard, datasets×channels map, similarity.
- **M7 Benchmarking** — pipeline shootout, data-quality QC, reproducibility hash.
- **M8 BCI workbench** — CSP / Riemannian decoding, accuracy/κ/AUC/ITR, confusion, CSP maps.
- **M9 Data editor** — channel/crop/annotation edits, **set-montage**, versioned derivatives.
- **M10 Reporting/export** — HTML report, FIF/CSV/NumPy/HDF5/EDF export.
- **M11 Code Lab** — run custom Python in an isolated subprocess, across one or many
  datasets (each/group), `nf.*` engine helpers, save/reuse scripts.

### Platform
- Background **job queue** for heavy ops; **token + RBAC** auth (opt-in); structured
  logging + request IDs; **LRU memory** cache + lazy FIF loading; upload limits +
  integrity checks; `/api/system`; **Python client SDK**; Docker + compose + GitHub CI.

### Real-data handling
- **Automatic channel detection**: identifies real EEG among mixed channels (e.g. a
  114-channel BigP3BCI EDF → 32 EEG, renamed from `EEG_*`, montaged; the rest typed
  stim/misc), so analyses use the right channels automatically.
- Topographies use the **recording's own electrode positions** (any cap), not a fixed layout.
- Imports are named from the source filename.

### Known limitations (see README → Production readiness)
Single-node in-process job queue; scripting isolation is for trusted users; no source
localization / mne-bids / ICLabel yet; single very large files still load fully.
