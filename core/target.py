"""Common Target schema — every source produces and every class caches these."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Optional


@dataclass
class Target:
    """A single follow-up target."""

    # Identity
    designation: str
    source: str
    source_url: Optional[str] = None

    # Classification (set by the class module / its ingestion handlers)
    target_class: Optional[str] = None
    catalogued: Optional[bool] = None
    catalog_match: Optional[str] = None

    # Sky position — best current estimate. Updated by core.position.extrapolate_to_now
    # at request time when a motion vector is known.
    ra_deg: Optional[float] = None
    dec_deg: Optional[float] = None
    epoch: Optional[datetime] = None
    observed_at: Optional[datetime] = None

    # Brightness
    mag_v: Optional[float] = None
    mag_h: Optional[float] = None

    # Orbit-quality context (when supplied by the source)
    n_obs: int = 0
    arc_days: float = 0.0
    not_seen_days: float = 0.0

    # Hazard scoring (NEO-specific, set by Scout/Sentry enrichment)
    neo_score: Optional[float] = None
    pha_score: Optional[float] = None
    impact_prob: Optional[float] = None

    # Motion vector (when known)
    motion_rate_arcsec_min: Optional[float] = None
    motion_pa_deg: Optional[float] = None

    # Observability — filled at request time by core.observability.filter_observable
    observable: Optional[bool] = None
    obs_window_start: Optional[datetime] = None
    obs_window_end: Optional[datetime] = None
    obs_window_hours: Optional[float] = None
    best_altitude_deg: Optional[float] = None
    best_airmass: Optional[float] = None
    best_az_deg: Optional[float] = None
    best_ha_hours: Optional[float] = None
    moon_sep_deg: Optional[float] = None
    transit_time: Optional[datetime] = None

    # Metadata
    updated_at: Optional[datetime] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a JSON-friendly dict (drops the raw payload)."""
        out: Dict[str, Any] = {}
        for k, v in self.__dict__.items():
            if k == "raw":
                continue
            out[k] = v.isoformat() if isinstance(v, datetime) else v
        return out

    def merge(self, other: "Target") -> None:
        """Merge enrichment data from another Target (same designation, different source)."""
        for attr in (
            "neo_score", "pha_score", "impact_prob",
            "mag_v", "mag_h",
            "motion_rate_arcsec_min", "motion_pa_deg",
            "catalog_match",
        ):
            other_val = getattr(other, attr, None)
            if other_val is not None and getattr(self, attr, None) is None:
                setattr(self, attr, other_val)

        for attr in ("n_obs", "arc_days", "not_seen_days"):
            other_val = getattr(other, attr, None)
            if other_val and not getattr(self, attr, None):
                setattr(self, attr, other_val)

        if other.raw:
            self.raw.setdefault("_enrichment", {})[other.source] = other.raw
