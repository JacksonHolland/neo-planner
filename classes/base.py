"""TargetClass dataclass — the registry entry for one kind of follow-up object."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Type

from pydantic import BaseModel

from core.target import Target


@dataclass
class TargetClass:
    """One class of follow-up object (e.g. NEO, Supernova).

    Each class module declares a ``TargetClass`` instance and registers it in
    ``classes.CLASSES``. The API and UI introspect the registry to build
    discovery endpoints, filter forms, and docs.
    """

    name: str                                                       # url slug, e.g. "neo"
    label: str                                                      # human display, e.g. "Near-Earth Objects"
    description: str                                                # used in /classes responses and the docs page
    canonical_catalog: str                                          # "MPC", "TNS", "none"
    filter_model: Type[BaseModel]                                   # Pydantic model for query params
    sources: List[str]                                              # adapter names for transparency
    get_targets: Callable[[], List[Target]]                         # thread-safe cache snapshot
    apply_filters: Callable[[List[Target], BaseModel], List[Target]]  # class-specific filter logic
