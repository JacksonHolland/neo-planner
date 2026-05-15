"""Pydantic models for API responses."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class TargetResponse(BaseModel):
    """One target as returned by ``GET /classes/{name}/targets``."""

    # identity
    designation: str
    source: str
    source_url: Optional[str] = None

    # classification
    target_class: Optional[str] = None
    catalogued: Optional[bool] = None
    catalog_match: Optional[str] = None

    # position
    ra_deg: Optional[float] = None
    dec_deg: Optional[float] = None
    epoch: Optional[str] = None
    observed_at: Optional[str] = None
    motion_rate_arcsec_min: Optional[float] = None
    motion_pa_deg: Optional[float] = None

    # brightness / orbit context
    mag_v: Optional[float] = None
    mag_h: Optional[float] = None
    n_obs: int = 0
    arc_days: float = 0.0
    not_seen_days: float = 0.0
    neo_score: Optional[float] = None
    pha_score: Optional[float] = None
    impact_prob: Optional[float] = None

    # observability (computed at request time)
    observable: Optional[bool] = None
    obs_window_start: Optional[str] = None
    obs_window_end: Optional[str] = None
    obs_window_hours: Optional[float] = None
    best_altitude_deg: Optional[float] = None
    best_airmass: Optional[float] = None
    best_az_deg: Optional[float] = None
    best_ha_hours: Optional[float] = None
    moon_sep_deg: Optional[float] = None
    transit_time: Optional[str] = None


class TargetsResponse(BaseModel):
    """Response for ``GET /classes/{name}/targets``."""

    total: int
    class_name: str
    targets: List[TargetResponse]


class ClassResponse(BaseModel):
    """Response for ``GET /classes`` (list) and ``GET /classes/{name}`` (detail)."""

    name: str
    label: str
    description: str
    canonical_catalog: str
    sources: List[str]
    filters_schema: Dict[str, Any]
