"""Class registry. Each class module appends to ``CLASSES`` on import.

``start_all()`` boots every class's background source threads. The API
imports this module once on startup, which triggers each class registration
and source-thread launch.
"""

from __future__ import annotations

from typing import Dict

from classes.base import TargetClass

CLASSES: Dict[str, TargetClass] = {}


def start_all() -> None:
    """Import every class module and start its background ingestion threads."""
    from classes import neo, supernova  # noqa: F401  (registers on import)

    neo.start()
    supernova.start()
