# NeuroForge — Roadmap

The MVP ships Modules 1 & 2 end-to-end. Remaining modules slot against the same
`NeuroData` model and API contract — each is a backend router + a frontend module folder.
Order favors building on the existing DSP core and unblocking research workflows fastest.

## Now (MVP — done)
All 10 modules are implemented end-to-end (GUI + API) at MVP depth:
- **M1** Loader/BIDS · **M2** Visualization · **M3** Preprocessing (incl. ICA) ·
  **M4** ERP (incl. cluster permutation) · **M5** Features + connectivity/graph ·
  **M6** Cross-session mapper · **M7** Benchmarking · **M8** BCI (CSP/Riemann decoding) ·
  **M9** Editor/annotation (versioned derivatives) · **M10** Reporting + multi-format export.

The items below are **remaining depth** within each module, not unbuilt modules.

## Next (hardening + highest impact)
1. **M1.5 persistence** — swap the in-memory registry for SQLite (schema in
   `ARCHITECTURE.md §6`), add checksums, gap detection, memory-mapped lazy reads,
   `mne-bids` read/write + `bids-validator`.
2. **M3 Preprocessing Pipeline** — wire `core/dsp.apply_filter` into a visual pipeline
   builder; add re-referencing, resampling, bad-channel/segment detection, ICA (Picard)
   + ICLabel, Autoreject, PREP; live before/after preview; JSON/YAML templates; QC report.
3. **M4 ERP/ERF** — epoching around the existing annotations (oddball is already seeded),
   averaging + grand average, peak/area latency, cluster-based permutation tests,
   butterfly + topo-at-cursor, GFP.

## Then (analysis depth)
4. **M5 Signal Analyzer** — Hjorth, entropies, Higuchi/DFA, spectral edge/median,
   coherence/PLV/PLI/wPLI, Granger/DTF/PDC, graph metrics, ERSP/ITC. (Band power lives in
   `core/dsp` already.)
5. **M6 Cross-Session Mapper** — DTW alignment, montage/MNI normalization, ICC/test-retest,
   mixed-effects, leave-one-subject-out, normative modeling; project dashboard + filtering.
6. **M9 Data Editor / Annotation** — virtual channels (bipolar/Laplacian/PCA), crop/concat,
   event editing, multi-track annotations, git-like dataset versioning + audit trail.

## Later (benchmarking, BCI, output)
7. **M7 Benchmarking** — EEGBCI/MOABB/OpenNeuro loaders, pipeline/algorithm comparison,
   SNR, noise covariance, simulated ground truth, hash-based reproducibility, leaderboards.
8. **M8 BCI Workbench** — CSP/FBCSP/CSSP, Riemannian tangent-space, EEGNet/DeepConvNet/LSTM,
   LDA/SVM/RF/XGBoost, kappa/AUC/ITR, **pylsl** real-time loop (<50 ms), simulated playback.
9. **M10 Reporting / Export** — Jinja2 HTML/PDF, BIDS-compliant derivatives, FIF/SET/EDF/
   HDF5/CSV export, vector + MP4/GIF figures, Python API + Jupyter widgets, plugin system,
   REST remote processing.

## Platform / cross-cutting
- **Desktop packaging** — wrap the same web build in **Tauri** (Rust, light) with the
  FastAPI engine as a sidecar; installers for Windows/macOS/Linux.
- **Real-time** — WebSocket channel + LSL inlet for streaming acquisition and feedback.
- **Scale** — CuPy/Numba acceleration, Celery/RQ + Redis for distributed batch jobs.
- **Compliance** — at-rest encryption, audit logs, de-identification, RBAC for multi-user.
- **Testing/CI** — pytest (backend) + Vitest/Playwright (frontend) to >80% coverage,
  GitHub Actions.

## Connectivity matrix (which modules feed which)
```
M1 ──> everything (NeuroData)
M2 <── M1            (visualize loaded data)
M3 ──> M2,M4,M5,M8   (clean data for view/analysis/decode)
M4 <── M3, uses M2 topo + M5 stats
M5 ──> M6,M7,M8      (features)
M6 <── M1,M5         (multi-subject)
M7 <── M1,M3,M5,M8   (benchmark pipelines)
M8 <── M3,M5         (decode), ──> real-time
M9 ──> M1            (edited datasets re-enter the repository)
M10 <── all          (report/export anything)
```
