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
    plate_scale_arcsec: float = 2.0 # plate scale (arcsec per pixel)
    seeing_arcsec: float = 2.5      # typical seeing FWHM (arcsec)
    max_trail_arcsec: float = 2.5   # max acceptable trail length (arcsec)

    # ── Observing constraints ─────────────────────────────────────────
    min_altitude_deg: float = 20.0  # minimum target altitude above horizon
    max_sun_alt_deg: float = -18.0  # sun must be below this for "dark"
    min_moon_sep_deg: float = 30.0  # minimum angular distance from Moon
    min_ha_hours: float = -6.0      # western hour-angle limit (hours)
    max_ha_hours: float = 6.0       # eastern hour-angle limit (hours)
    min_az_deg: float = 0.0         # minimum azimuth (0 = no constraint)
    max_az_deg: float = 360.0       # maximum azimuth (360 = no constraint)

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
    code=None,
    lat=42.6097,
    lon=-71.4844,
    alt_m=180,
    aperture_m=0.6,
    limiting_mag=19.5,
    fov_arcmin=20,
    min_altitude_deg=20,
    max_sun_alt_deg=-18,
    min_moon_sep_deg=30,
)

