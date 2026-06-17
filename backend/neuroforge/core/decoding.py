# Offline BCI decoding. Epoch into fixed windows, label each by posterior alpha
# power (median split), decode with CSP or Riemannian features + a classifier.
# Returns accuracy, Cohen's kappa, AUC, ITR and a confusion matrix.
from __future__ import annotations

import numpy as np
from scipy.signal import welch
import mne
from mne.decoding import CSP
from sklearn.pipeline import Pipeline
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.svm import SVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import accuracy_score, cohen_kappa_score, roc_auc_score, confusion_matrix

from . import montage as mtg

POSTERIOR = ["O1", "O2", "Oz", "POz", "PO3", "PO4", "P3", "P4", "Pz", "P7", "P8"]


def _epochs_alpha_state(raw: mne.io.BaseRaw, win: float = 1.0, overlap: float = 0.5):
    has_eeg = len(mne.pick_types(raw.info, eeg=True)) > 0
    raw = raw.copy().pick("eeg" if has_eeg else "data")
    if len(raw.ch_names) < 2:
        raise ValueError("need at least 2 channels to decode")
    ep = mne.make_fixed_length_epochs(raw, duration=win, overlap=overlap, preload=True, verbose="ERROR")
    X = ep.get_data(copy=True)
    sf = raw.info["sfreq"]
    post = [raw.ch_names.index(c) for c in POSTERIOR if c in raw.ch_names] or list(range(X.shape[1]))
    pows = []
    for e in X:
        f, pxx = welch(e[post], fs=sf, nperseg=min(e.shape[1], int(sf)))
        mask = (f >= 8) & (f <= 13)
        pows.append(float(pxx[:, mask].mean()) if mask.any() else 0.0)
    y = (np.array(pows) > np.median(pows)).astype(int)
    if len(np.unique(y)) < 2 or X.shape[0] < 10:
        raise ValueError("not enough variability / epochs to train a decoder")
    return X, y, ep.ch_names


def _classifier(name: str) -> Pipeline:
    csp = lambda: CSP(n_components=6, reg="ledoit_wolf", log=True)  # noqa: E731
    if name == "svm":
        return Pipeline([("csp", csp()), ("clf", SVC(kernel="rbf", probability=True))])
    if name == "rf":
        return Pipeline([("csp", csp()), ("clf", RandomForestClassifier(n_estimators=200, random_state=0))])
    if name == "riemann":
        from pyriemann.estimation import Covariances
        from pyriemann.tangentspace import TangentSpace
        return Pipeline([("cov", Covariances("oas")), ("ts", TangentSpace()),
                         ("clf", LogisticRegression(max_iter=1000))])
    return Pipeline([("csp", csp()), ("clf", LinearDiscriminantAnalysis())])


def decode(raw: mne.io.BaseRaw, classifier: str = "lda", folds: int = 5) -> dict:
    X, y, ch_names = _epochs_alpha_state(raw)
    counts = np.bincount(y)
    n_splits = int(max(2, min(folds, counts.min())))
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    clf = _classifier(classifier)

    y_pred = cross_val_predict(clf, X, y, cv=cv)
    acc = float(accuracy_score(y, y_pred))
    kappa = float(cohen_kappa_score(y, y_pred))
    try:
        proba = cross_val_predict(clf, X, y, cv=cv, method="predict_proba")[:, 1]
        auc = float(roc_auc_score(y, proba))
    except Exception:
        proba = y_pred.astype(float)
        auc = float("nan")
    cm = confusion_matrix(y, y_pred).tolist()

    folds_acc = []
    for tr, te in cv.split(X, y):
        clf.fit(X[tr], y[tr])
        folds_acc.append(float(clf.score(X[te], y[te])))

    # information transfer rate (bits/min), 1 decision per window
    N, win = 2, 1.0
    a = min(max(acc, 1e-6), 1 - 1e-6)
    bits = np.log2(N) + a * np.log2(a) + (1 - a) * np.log2((1 - a) / (N - 1))
    itr = float(max(bits, 0.0) * (60.0 / win))

    patterns = None
    if classifier != "riemann":
        try:
            csp = CSP(n_components=4, reg="ledoit_wolf", log=True)
            csp.fit(X, y)
            pos = mtg.project_raw(raw.copy().pick(ch_names))
            patterns = [{
                "comp": k,
                "values": [{"name": nm, "x": pos[nm][0], "y": pos[nm][1], "value": float(csp.patterns_[k, i])}
                           for i, nm in enumerate(ch_names) if nm in pos],
            } for k in range(2)]
        except Exception:
            patterns = None

    return {
        "classifier": classifier, "task": "alpha-state (posterior α median split)",
        "accuracy": acc, "kappa": kappa, "auc": auc, "itr": itr,
        "confusion": cm, "folds_acc": folds_acc, "n_folds": n_splits,
        "n_epochs": int(len(y)), "classes": ["low-α", "high-α"],
        "control": y_pred.astype(int).tolist(), "truth": y.astype(int).tolist(),
        "proba": [round(float(p), 3) for p in proba],
        "patterns": patterns,
    }
