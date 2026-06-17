# LRU cap on how many recordings hold their samples in RAM at once. Datasets are
# lazy (raw reloads from FIF on access); this evicts the least-recently-used one's
# in-memory data so memory stays bounded no matter how many datasets are loaded.
# Only datasets backed by a FIF are evicted (so nothing unrecoverable is dropped).
from __future__ import annotations

from collections import OrderedDict
from threading import RLock

from ..config import settings


class RawCache:
    def __init__(self, max_loaded: int | None = None):
        self.max = max_loaded or settings.max_loaded_datasets
        self._order: "OrderedDict[str, object]" = OrderedDict()
        self._lock = RLock()

    def touch(self, nd) -> None:
        if not nd.fif_path:
            return  # in-memory-only; can't safely evict
        with self._lock:
            self._order.pop(nd.id, None)
            self._order[nd.id] = nd
            while len(self._order) > self.max:
                _id, victim = self._order.popitem(last=False)
                victim._raw = None  # drop samples; they reload from disk on demand

    def loaded_ids(self) -> list[str]:
        return list(self._order.keys())


cache = RawCache()
