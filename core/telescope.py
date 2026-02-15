"""Telescope profile — parameterizes all filtering for a given site."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class TelescopeProfile:
    """Description of a follow-up telescope / observing site."""

    # ── Identity ──────────────────────────────────────────────────────
    name: str = "My Telescope"
    code: Optional[str] = None      # MPC observatory code, e.g. "244"

    # ── Location ──────────────────────────────────────────────────────
    lat: float = 0.0                # geodetic latitude  (degrees, north +)
    lon: float = 0.0                # geodetic longitude (degrees, east  +)
    alt_m: float = 0.0              # altitude above sea level (metres)

    # ── Optics ────────────────────────────────────────────────────────
    aperture_m: float = 0.2         # primary mirror / lens diameter (metres)
    limiting_mag: float = 18.0      # faintest detectable magnitude
    fov_arcmin: float = 30.0        # field of view diameter (arcminutes)

    # ── Observing constraints ─────────────────────────────────────────
    min_altitude_deg: float = 20.0  # minimum target altitude above horizon
    max_sun_alt_deg: float = -12.0  # sun must be below this for "dark"
    min_moon_sep_deg: float = 30.0  # minimum angular distance from Moon

    # ── Scoring weights (user-tunable) ────────────────────────────────
    score_weights: Dict[str, float] = field(default_factory=lambda: {
        "not_seen_days": 1.0,
        "arc_days_inv": 1.0,
        "neo_score": 1.0,
        "pha_score": 1.5,
        "impact_prob": 3.0,
        "obs_window_hours": 0.5,
        "brightness_margin": 0.3,
    })

    # ── Helpers ───────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}

    @classmethod
    def from_dict(cls, d: dict) -> "TelescopeProfile":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ── Preset profiles ──────────────────────────────────────────────────

WALLACE = TelescopeProfile(
    name="Wallace Astrophysical Observatory",
    code="244",
    lat=42.6138,
    lon=-71.4889,
    alt_m=180,
    aperture_m=0.6,
    limiting_mag=19.5,
    fov_arcmin=20,
    min_altitude_deg=20,
    max_sun_alt_deg=-12,
    min_moon_sep_deg=30,
)

