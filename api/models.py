"""Pydantic models for API request/response schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TelescopeParams(BaseModel):
    """Query parameters describing the observer's telescope / location."""
    lat: float = Field(..., description="Latitude (degrees, north positive)")
    lon: float = Field(..., description="Longitude (degrees, east positive)")
    alt_m: float = Field(0, description="Altitude above sea level (metres)")
    limiting_mag: float = Field(18.0, description="Faintest detectable magnitude")
    min_altitude_deg: float = Field(20.0, description="Minimum target altitude")
    min_moon_sep_deg: float = Field(30.0, description="Minimum Moon separation")


class TargetResponse(BaseModel):
    """A single target in the API response."""
    designation: str
    source: str
    ra_deg: Optional[float] = None
    dec_deg: Optional[float] = None
    mag_v: Optional[float] = None
    mag_h: Optional[float] = None
    n_obs: int = 0
    arc_days: float = 0
    not_seen_days: float = 0
    neo_score: Optional[float] = None
    pha_score: Optional[float] = None
    impact_prob: Optional[float] = None
    predicted_ra_deg: Optional[float] = None
    predicted_dec_deg: Optional[float] = None
    predicted_epoch: Optional[str] = None
    motion_rate_arcsec_min: Optional[float] = None
    motion_pa_deg: Optional[float] = None
    predicted_mag: Optional[float] = None
    observable: Optional[bool] = None
    obs_window_start: Optional[str] = None
    obs_window_end: Optional[str] = None
    obs_window_hours: Optional[float] = None
    best_altitude_deg: Optional[float] = None
    best_airmass: Optional[float] = None
    moon_sep_deg: Optional[float] = None
    transit_time: Optional[str] = None
    priority_score: Optional[float] = None
    source_url: Optional[str] = None


class TonightResponse(BaseModel):
    """Response for GET /targets/tonight."""
    total: int
    telescope: Dict[str, Any]
    targets: List[TargetResponse]


class SourceStatusResponse(BaseModel):
    """Response for GET /sources/neocp etc."""
    source: str
    count: int
    last_fetched: Optional[str] = None
    targets: List[TargetResponse]


class HealthResponse(BaseModel):
    status: str
    sources: Dict[str, int]
    last_refresh: Optional[str] = None
