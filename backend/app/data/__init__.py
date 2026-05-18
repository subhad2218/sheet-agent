"""Data utilities: caching, indexing, and readers."""

from .cache import get_cached_preview, set_cached_preview, clear_cache
from .index import FileIndex, get_index, invalidate_index
from .readers import read_tabular_schema, read_document

__all__ = [
    "get_cached_preview",
    "set_cached_preview",
    "clear_cache",
    "FileIndex",
    "get_index",
    "invalidate_index",
    "read_tabular_schema",
    "read_document",
]
