"""Lightweight file-preview cache for the workspace.

Caches parsed preview results (schema, head rows) keyed by
(file path, mtime, row_limit) so repeated previews of large files
are instant.  Cache entries are stored as JSON in
<workspace>/.cache/previews/ and evicted automatically when the
source file changes or the global size budget is exceeded.
"""

from __future__ import annotations
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any


# Max on-disk cache size in bytes (~50 MB)
_MAX_CACHE_BYTES = 50 * 1024 * 1024


def _cache_dir(workspace: str) -> Path:
    d = Path(workspace) / ".cache" / "previews"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cache_key(path: str, n_rows: int) -> str:
    """Deterministic cache key from absolute path + row limit."""
    raw = f"{os.path.abspath(path)}::{n_rows}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _meta_path(cache_dir: Path, key: str) -> Path:
    return cache_dir / f"{key}.json"


def _entry_size(meta_path: Path) -> int:
    try:
        return meta_path.stat().st_size
    except OSError:
        return 0


def _evict_if_needed(cache_dir: Path, budget: int = _MAX_CACHE_BYTES):
    """LRU eviction: remove oldest files until total size <= budget."""
    files = sorted(
        (f for f in cache_dir.iterdir() if f.suffix == ".json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    total = sum(f.stat().st_size for f in files)
    while files and total > budget:
        oldest = files.pop()
        total -= oldest.stat().st_size
        try:
            oldest.unlink()
        except OSError:
            pass


def get_cached_preview(workspace: str, path: str, n_rows: int = 100) -> dict[str, Any] | None:
    """Return cached preview dict if fresh, else None."""
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return None

    cache_dir = _cache_dir(workspace)
    key = _cache_key(path, n_rows)
    meta = _meta_path(cache_dir, key)

    if not meta.exists():
        return None

    try:
        data = json.loads(meta.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

    # Freshness check: source mtime must match exactly
    if data.get("_source_mtime") != mtime:
        try:
            meta.unlink()
        except OSError:
            pass
        return None

    return data.get("preview")


def set_cached_preview(workspace: str, path: str, n_rows: int, preview: dict[str, Any]):
    """Store a preview dict in the on-disk cache."""
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return

    cache_dir = _cache_dir(workspace)
    _evict_if_needed(cache_dir)

    key = _cache_key(path, n_rows)
    meta = _meta_path(cache_dir, key)

    payload = {
        "_source_mtime": mtime,
        "_cached_at": time.time(),
        "preview": preview,
    }
    try:
        meta.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def clear_cache(workspace: str):
    """Remove all preview cache entries for a workspace."""
    cache_dir = _cache_dir(workspace)
    for f in cache_dir.iterdir():
        try:
            f.unlink()
        except OSError:
            pass
