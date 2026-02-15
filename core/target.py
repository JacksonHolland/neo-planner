"""Common Target schema — every alert source normalizes into this."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class Target:
    """A single NEO / asteroid candidate that may warrant follow-up."""

    # ── Identity ──────────────────────────────────────────────────────
    designation: str                # e.g. "ZTF10Bb" or "2025 HK53"
    source: str                     # adapter that produced this ("neocp", "scout", …)
    source_url: Optional[str] = None

    # ── Sky position (current / predicted) ────────────────────────────
    ra_deg: Optional[float] = None  # right ascension  [0, 360)
    dec_deg: Optional[float] = None # declination      [-90, 90]
    epoch: Optional[datetime] = None

    # ── Brightness ────────────────────────────────────────────────────
    mag_v: Optional[float] = None   # predicted apparent visual magnitude
    mag_h: Optional[float] = None   # absolute magnitude (size proxy)

    # ── Orbit quality ─────────────────────────────────────────────────
    n_obs: int = 0                  # number of observations so far
    arc_days: float = 0.0           # observational arc (days)
    not_seen_days: float = 0.0      # days since last observation

    # ── Scoring (filled by enrichment / cross-reference) ──────────────
    neo_score: Optional[float] = None   # 0–100  probability of being a real NEO
    pha_score: Optional[float] = None   # potentially hazardous asteroid score
    impact_prob: Optional[float] = None # Earth impact probability

    # ── Observability (filled by observability engine) ────────────────
    observable: Optional[bool] = None
    obs_window_start: Optional[datetime] = None
    obs_window_end: Optional[datetime] = None
    obs_window_hours: Optional[float] = None
    best_altitude_deg: Optional[float] = None
    best_airmass: Optional[float] = None
    moon_sep_deg: Optional[float] = None
    transit_time: Optional[datetime] = None

    # ── Priority (filled by scorer) ───────────────────────────────────
    priority_score: Optional[float] = None

    # ── Metadata ──────────────────────────────────────────────────────
    updated_at: Optional[datetime] = None
    raw: Dict[str, Any] = field(default_factory=dict)

    # ── Helpers ───────────────────────────────────────────────────────

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a JSON-friendly dict."""
        d: Dict[str, Any] = {}
        for k, v in self.__dict__.items():
            if k == "raw":
                continue  # skip bulky raw payload by default
            if isinstance(v, datetime):
                d[k] = v.isoformat()
            else:
                d[k] = v
        return d

    def merge(self, other: "Target") -> None:
        """
        Merge scoring / enrichment data from *other* into this target.

        Used when the same object appears in multiple sources (e.g. NEOCP
        and Scout).  Non-None values in *other* overwrite None values here;
        lists are concatenated.
        """
        for attr in (
            "neo_score", "pha_score", "impact_prob",
            "mag_v", "mag_h", "n_obs", "arc_days", "not_seen_days",
        ):
            other_val = getattr(other, attr, None)
            if other_val is not None and getattr(self, attr, None) is None:
                setattr(self, attr, other_val)

        # Always take the richer raw payload
        if other.raw:
            self.raw.setdefault("_enrichment", {})[other.source] = other.raw

