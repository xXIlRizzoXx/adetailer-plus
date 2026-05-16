"""Named tab-configuration presets, shared across all tabs.

A "preset" is a saved snapshot of every widget value in a single ADetailer
tab, identified by a user-chosen name. Presets live in
`<extension_root>/user_presets.json` and are loaded once per UI build.

Each tab gets a dropdown to pick a preset + Load/Save/Delete buttons. Saving
or deleting from any tab updates the dropdowns in every tab so the user
doesn't have to reload the UI to see fresh presets.

Like persistence.py, every I/O error is swallowed so a corrupted file or
permission issue can never break a generation.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

_EXT_ROOT = Path(__file__).resolve().parent.parent
_PRESETS_FILE = _EXT_ROOT / "user_presets.json"

# Reasonable preset name = printable, no path separators or quotes. Doesn't
# need to be airtight; this is just to keep the JSON keys + dropdown labels
# sane.
_VALID_NAME = re.compile(r"^[\w\- .,()\[\]+!?@#&]{1,80}$")


def _load_raw() -> dict[str, Any]:
    if not _PRESETS_FILE.is_file():
        return {}
    try:
        data = json.loads(_PRESETS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _write_raw(presets: dict[str, Any]) -> None:
    try:
        tmp = _PRESETS_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(presets, indent=2, default=str), encoding="utf-8")
        os.replace(tmp, _PRESETS_FILE)
    except OSError:
        pass


def load_presets() -> dict[str, dict[str, Any]]:
    """All known presets, mapping name -> {attr: value}."""
    raw = _load_raw()
    out: dict[str, dict[str, Any]] = {}
    for k, v in raw.items():
        if isinstance(v, dict) and isinstance(k, str):
            out[k] = v
    return out


def get_preset_names() -> list[str]:
    """Sorted list of preset names. Used to populate Gradio dropdowns."""
    return sorted(load_presets())


def is_valid_name(name: str) -> bool:
    """Whether `name` is acceptable as a preset key."""
    return bool(name) and bool(_VALID_NAME.match(name.strip()))


def save_preset(name: str, state: dict[str, Any]) -> bool:
    """Persist a single preset. Returns True on success.

    Drops `is_api` (transient marker, not a real user setting).
    """
    name = (name or "").strip()
    if not is_valid_name(name):
        return False
    presets = _load_raw()
    presets[name] = {k: v for k, v in state.items() if k != "is_api"}
    _write_raw(presets)
    return True


def delete_preset(name: str) -> bool:
    """Remove a preset by name. Returns True if it existed and was removed."""
    name = (name or "").strip()
    if not name:
        return False
    presets = _load_raw()
    if name not in presets:
        return False
    presets.pop(name, None)
    _write_raw(presets)
    return True


def get_preset(name: str) -> dict[str, Any]:
    """Return the preset's state dict, or {} if not found."""
    return load_presets().get((name or "").strip(), {})


def export_presets_json() -> str:
    """Return the entire preset library as a JSON string.

    Used by the UI export button to feed a `gr.File` download. The format
    matches the on-disk `user_presets.json` exactly, so a round-trip
    export → import is byte-identical (modulo key ordering).
    """
    presets = _load_raw()
    return json.dumps(presets, indent=2, default=str, sort_keys=True)


def import_presets_json(payload: str, *, overwrite: bool = False) -> tuple[int, int, list[str]]:
    """Merge an exported JSON payload into the local preset library.

    Parameters
    ----------
    payload : str
        Raw JSON text. Must decode to a dict[str, dict].
    overwrite : bool
        If True, incoming presets replace any local preset with the same
        name. If False, conflicting names are skipped and reported in the
        ``skipped`` list of the return tuple.

    Returns
    -------
    (added, replaced, skipped) : tuple[int, int, list[str]]
        - ``added``    — number of new preset names written.
        - ``replaced`` — number of existing presets overwritten (only > 0
          when ``overwrite=True``).
        - ``skipped``  — list of names skipped (conflicts when
          ``overwrite=False``, plus any names that fail `is_valid_name`).
    """
    try:
        incoming = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        return 0, 0, []
    if not isinstance(incoming, dict):
        return 0, 0, []

    current = _load_raw()
    added = 0
    replaced = 0
    skipped: list[str] = []
    for name, value in incoming.items():
        if not isinstance(name, str) or not isinstance(value, dict):
            continue
        clean_name = name.strip()
        if not is_valid_name(clean_name):
            skipped.append(name)
            continue
        if clean_name in current:
            if overwrite:
                current[clean_name] = {k: v for k, v in value.items() if k != "is_api"}
                replaced += 1
            else:
                skipped.append(clean_name)
            continue
        current[clean_name] = {k: v for k, v in value.items() if k != "is_api"}
        added += 1

    if added or replaced:
        _write_raw(current)
    return added, replaced, skipped


def rename_preset(old_name: str, new_name: str) -> tuple[bool, str]:
    """Rename a preset on disk.

    Returns (success, message). On failure `message` describes why so the
    UI can surface it (preset missing, invalid name, name already taken).
    """
    old_name = (old_name or "").strip()
    new_name = (new_name or "").strip()
    if not old_name:
        return False, "no preset selected"
    if not is_valid_name(new_name):
        return False, f"invalid name '{new_name}'"
    if new_name == old_name:
        return True, "no change"
    presets = _load_raw()
    if old_name not in presets:
        return False, f"preset '{old_name}' not found"
    if new_name in presets:
        return False, f"'{new_name}' already exists"
    presets[new_name] = presets.pop(old_name)
    _write_raw(presets)
    return True, "ok"
