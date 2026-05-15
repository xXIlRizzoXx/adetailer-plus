"""Per-tab state persistence across WebUI restarts.

The state file is a plain JSON keyed by tab index (string). Each tab maps to
the dict of attr->value the user last submitted via the Generate button.

Storage location: `<extension_root>/user_state.json` (gitignored). We pick
the extension root by walking up from this file — works regardless of where
the extension is installed (Stability Matrix shared dir, A1111
extensions/, etc.).

Failures are swallowed. The plugin must never crash because we couldn't
read/write the cache file; in the worst case the user just doesn't get
their settings restored.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# extension_root = parent of the `adetailer/` package this file lives in.
_EXT_ROOT = Path(__file__).resolve().parent.parent
_STATE_FILE = _EXT_ROOT / "user_state.json"


def _load_raw() -> dict[str, Any]:
    if not _STATE_FILE.is_file():
        return {}
    try:
        data = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def load_state() -> dict[str, dict[str, Any]]:
    """Return per-tab saved state. Outer key = str(tab_index)."""
    raw = _load_raw()
    out: dict[str, dict[str, Any]] = {}
    for k, v in raw.items():
        if isinstance(v, dict):
            out[str(k)] = v
    return out


def save_tab_state(tab_index: int, state: dict[str, Any]) -> None:
    """Persist a single tab's state to disk.

    Writes the full file atomically: read existing -> mutate -> tmp file ->
    rename. Drops `is_api` (it's transient, tuple-vs-bool serialization
    causes infotext quirks).
    """
    try:
        current = _load_raw()
        cleaned = {k: v for k, v in state.items() if k != "is_api"}
        current[str(tab_index)] = cleaned

        tmp = _STATE_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(current, indent=2, default=str), encoding="utf-8")
        os.replace(tmp, _STATE_FILE)
    except OSError:
        # Disk full / permission denied / network drive flaked / ... — we
        # don't want a save failure to break the user's generation.
        pass
