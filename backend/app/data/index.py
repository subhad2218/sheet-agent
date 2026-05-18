"""Lightweight workspace file index.

Provides fast aggregate queries over the workspace without
re-scanning the filesystem on every request.
"""

from __future__ import annotations
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator


@dataclass
class FileEntry:
    path: str
    name: str
    size_bytes: int
    mtime: float
    ext: str


@dataclass
class WorkspaceSnapshot:
    scanned_at: float
    total_files: int
    total_bytes: int
    by_ext: dict[str, list[FileEntry]] = field(default_factory=dict)
    entries: list[FileEntry] = field(default_factory=list)


class FileIndex:
    """Simple in-memory file index with on-demand refresh."""

    def __init__(self, workspace: str, ttl_seconds: float = 5.0):
        self.workspace = Path(workspace)
        self.ttl = ttl_seconds
        self._snapshot: WorkspaceSnapshot | None = None
        self._last_scan: float = 0.0

    def _is_stale(self) -> bool:
        return time.monotonic() - self._last_scan > self.ttl

    def _scan(self) -> WorkspaceSnapshot:
        entries: list[FileEntry] = []
        by_ext: dict[str, list[FileEntry]] = {}
        total_bytes = 0

        for root, _dirs, files in os.walk(self.workspace):
            for name in files:
                full = Path(root) / name
                try:
                    stat = full.stat()
                except OSError:
                    continue
                rel = str(full.relative_to(self.workspace)).replace("\\", "/")
                ext = full.suffix.lower().lstrip(".")
                entry = FileEntry(
                    path=rel,
                    name=name,
                    size_bytes=stat.st_size,
                    mtime=stat.st_mtime,
                    ext=ext,
                )
                entries.append(entry)
                total_bytes += stat.st_size
                by_ext.setdefault(ext, []).append(entry)

        snapshot = WorkspaceSnapshot(
            scanned_at=time.time(),
            total_files=len(entries),
            total_bytes=total_bytes,
            by_ext=by_ext,
            entries=entries,
        )
        self._snapshot = snapshot
        self._last_scan = time.monotonic()
        return snapshot

    def get(self) -> WorkspaceSnapshot:
        if self._snapshot is None or self._is_stale():
            return self._scan()
        return self._snapshot

    def find(self, pattern: str = "*") -> Iterator[FileEntry]:
        """Glob-like search over cached entries."""
        snap = self.get()
        # Simple wildcard matching
        if pattern == "*":
            yield from snap.entries
            return
        import fnmatch
        for e in snap.entries:
            if fnmatch.fnmatch(e.name, pattern) or fnmatch.fnmatch(e.path, pattern):
                yield e

    def invalidate(self):
        """Force a rescan on next access."""
        self._last_scan = 0.0
        self._snapshot = None


# Global singleton per workspace path
_index_cache: dict[str, FileIndex] = {}


def get_index(workspace: str) -> FileIndex:
    if workspace not in _index_cache:
        _index_cache[workspace] = FileIndex(workspace)
    return _index_cache[workspace]


def invalidate_index(workspace: str):
    idx = _index_cache.get(workspace)
    if idx:
        idx.invalidate()
