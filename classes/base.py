"""TargetClass dataclass — the registry entry for one kind of follow-up object."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Type

from pydantic import BaseModel

from core.target import Target


@dataclass
class Preset:
    """A named filter combination surfaced as a one-click button in the UI.

    A preset is purely a UI affordance: clicking it fills the corresponding
    filter inputs with ``values`` and leaves everything else alone. The user
    is free to edit any field afterwards.
    """

    name: str            # url slug, e.g. "fresh_unknowns"
    label: str           # button text
    description: str     # one-line explanation shown on hover and in docs
    values: Dict[str, Any]  # filter field name -> value


@dataclass
class TargetClass:
    """One class of follow-up object (e.g. NEO, Supernova).

    Each class module declares a ``TargetClass`` instance and registers it in
    ``classes.CLASSES``. The API and UI introspect the registry to build
    discovery endpoints, filter forms, presets, and docs.
    """

    name: str                                                       # url slug, e.g. "neo"
    label: str                                                      # human display, e.g. "Near-Earth Objects"
    description: str                                                # used in /classes responses and the docs page
    canonical_catalog: str                                          # "MPC", "TNS", "none"
    filter_model: Type[BaseModel]                                   # Pydantic model for query params
    sources: List[str]                                              # adapter names for transparency
    get_targets: Callable[[], List[Target]]                         # thread-safe cache snapshot
    apply_filters: Callable[[List[Target], BaseModel], List[Target]]  # class-specific filter logic
    presets: List[Preset] = field(default_factory=list)             # named filter combinations
