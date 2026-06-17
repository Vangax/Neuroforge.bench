# Test data

Drop sample recordings here to exercise NeuroForge on real files. Data files
(`*.edf`, `*.fif`, …) are git-ignored — they are not committed to the repo.

The backend test suite (`backend/tests/test_neuroforge.py`) looks for
`A_01_SE001_CB_Test08.edf` (a [BigP3BCI](https://doi.org/10.1038/s41597-024-03397-8)
P300-speller recording: 114 channels, 32 real EEG named `EEG_*`, plus speller/state
channels). If the file is present, the test verifies automatic EEG detection
(114 → 32), channel renaming and montage; if absent, that test is skipped.

Replace it with any MNE-readable file to try your own data.
