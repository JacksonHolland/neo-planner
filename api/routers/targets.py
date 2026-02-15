"""
/targets routes — tonight's targets, detail, and export.
"""

from __future__ import annotations

import copy
import sys
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Response

# Ensure project root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api.models import TargetResponse, TonightResponse
from core.ephemeris import enrich_ephemeris
from core.observability import filter_observable
from core.scorer import score_targets
from core.target import Target
from core.telescope import TelescopeProfile
from format_converter import to_mpc80, to_ades_psv, to_ades_xml, to_json as to_json_export

router = APIRouter(prefix="/targets", tags=["targets"])


def _get_cache():
    """Import cache lazily to avoid circular imports."""
    from api.main import _target_cache
    return _target_cache


def _target_to_response(t: Target) -> TargetResponse:
    return TargetResponse(**{
        k: (v.isoformat() if hasattr(v, "isoformat") else v)
        for k, v in t.to_dict().items()
        if k in TargetResponse.__fields__
    })


def _build_profile(
    lat: float,
    lon: float,
    alt_m: float = 0,
    limiting_mag: float = 18.0,
    min_altitude_deg: float = 20.0,
    min_moon_sep_deg: float = 30.0,
) -> TelescopeProfile:
    return TelescopeProfile(
        lat=lat,
        lon=lon,
        alt_m=alt_m,
        limiting_mag=limiting_mag,
        min_altitude_deg=min_altitude_deg,
        min_moon_sep_deg=min_moon_sep_deg,
    )


# ── GET /targets/tonight ─────────────────────────────────────────────

@router.get("/tonight", response_model=TonightResponse)
def tonight(
    lat: float = Query(..., description="Latitude (degrees)"),
    lon: float = Query(..., description="Longitude (degrees)"),
    alt_m: float = Query(0, description="Altitude (metres)"),
    limiting_mag: float = Query(18.0, description="Faintest magnitude"),
    min_altitude_deg: float = Query(20.0, description="Min target altitude"),
    min_moon_sep_deg: float = Query(30.0, description="Min Moon separation"),
    limit: int = Query(50, ge=1, le=500),
):
    """
    Return tonight's observable NEO targets ranked by priority.

    Provide your telescope location and specs as query params.
    """
    cache = _get_cache()
    if not cache["targets"]:
        raise HTTPException(status_code=503, detail="No targets loaded yet — sources still initializing")

    profile = _build_profile(lat, lon, alt_m, limiting_mag, min_altitude_deg, min_moon_sep_deg)

    # Deep-copy so we don't mutate the cache
    targets = [copy.deepcopy(t) for t in cache["targets"]]

    observable = filter_observable(targets, profile)
    ranked = score_targets(observable, profile)

    # Enrich with ephemeris (predicted positions at observation time)
    enrich_ephemeris(ranked[:limit], profile)

    return TonightResponse(
        total=len(ranked),
        telescope=profile.to_dict(),
        targets=[_target_to_response(t) for t in ranked[:limit]],
    )


# ── GET /targets/all ─────────────────────────────────────────────────

@router.get("/all", response_model=TonightResponse)
def all_targets(
    limit: int = Query(100, ge=1, le=500),
):
    """Return all cached targets (no observability filtering)."""
    cache = _get_cache()
    targets = cache["targets"][:limit]
    return TonightResponse(
        total=len(cache["targets"]),
        telescope={},
        targets=[_target_to_response(t) for t in targets],
    )


# ── GET /targets/export ──────────────────────────────────────────────

@router.get("/export")
def export_targets(
    format: str = Query("json", description="Export format: mpc80, ades-psv, ades-xml, json, csv"),
    lat: float = Query(...),
    lon: float = Query(...),
    alt_m: float = Query(0),
    limiting_mag: float = Query(18.0),
    min_altitude_deg: float = Query(20.0),
    min_moon_sep_deg: float = Query(30.0),
    limit: int = Query(200, ge=1, le=5000),
):
    """Export tonight's targets in various formats (MPC 80-col, ADES, JSON, CSV)."""
    import pandas as pd

    cache = _get_cache()
    if not cache["targets"]:
        raise HTTPException(status_code=503, detail="No targets loaded yet")

    profile = _build_profile(lat, lon, alt_m, limiting_mag, min_altitude_deg, min_moon_sep_deg)
    targets = [copy.deepcopy(t) for t in cache["targets"]]
    observable = filter_observable(targets, profile)
    ranked = score_targets(observable, profile)[:limit]

    if not ranked:
        raise HTTPException(status_code=404, detail="No observable targets found")

    # Convert to DataFrame for format_converter
    rows = [t.to_dict() for t in ranked]
    df = pd.DataFrame(rows)

    if format == "json":
        import json
        content = json.dumps(rows, indent=2, default=str)
        return Response(content=content, media_type="application/json")
    elif format == "csv":
        content = df.to_csv(index=False)
        return Response(content=content, media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=neo_targets.csv"})
    elif format == "mpc80":
        content = to_mpc80(df)
        return Response(content=content, media_type="text/plain",
                        headers={"Content-Disposition": "attachment; filename=neo_targets.txt"})
    elif format == "ades-psv":
        content = to_ades_psv(df)
        return Response(content=content, media_type="text/plain",
                        headers={"Content-Disposition": "attachment; filename=neo_targets.psv"})
    elif format == "ades-xml":
        content = to_ades_xml(df)
        return Response(content=content, media_type="application/xml",
                        headers={"Content-Disposition": "attachment; filename=neo_targets.xml"})
    else:
        raise HTTPException(status_code=400, detail=f"Unknown format: {format}")


# ── GET /targets/{designation}/finder ─────────────────────────────────

@router.get("/{designation}/finder")
def target_finder(
    designation: str,
    fov: float = Query(15, description="Field of view in arcminutes"),
    mag_limit: float = Query(15, description="Star magnitude limit"),
):
    """Generate an SVG finder chart for a target."""
    from core.finder import generate_finder_svg

    cache = _get_cache()
    match = None
    for t in cache["targets"]:
        if t.designation == designation:
            match = t
            break

    if match is None:
        raise HTTPException(status_code=404, detail=f"Target not found: {designation}")

    ra = match.predicted_ra_deg if match.predicted_ra_deg is not None else match.ra_deg
    dec = match.predicted_dec_deg if match.predicted_dec_deg is not None else match.dec_deg

    if ra is None or dec is None:
        raise HTTPException(status_code=400, detail="Target has no position data")

    try:
        svg = generate_finder_svg(
            ra_deg=ra,
            dec_deg=dec,
            fov_arcmin=fov,
            star_mag_limit=mag_limit,
            designation=designation,
        )
        return Response(content=svg, media_type="image/svg+xml")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Finder chart generation failed: {exc}")


# ── GET /targets/{designation} ────────────────────────────────────────

@router.get("/{designation}", response_model=TargetResponse)
def target_detail(
    designation: str,
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    limiting_mag: float = Query(18.0),
):
    """
    Get detail for a single target by designation.

    If lat/lon are provided, includes observability from that location.
    """
    cache = _get_cache()
    match = None
    for t in cache["targets"]:
        if t.designation == designation:
            match = copy.deepcopy(t)
            break

    if match is None:
        raise HTTPException(status_code=404, detail=f"Target not found: {designation}")

    if lat is not None and lon is not None:
        from core.observability import compute_observability
        profile = _build_profile(lat, lon, limiting_mag=limiting_mag)
        compute_observability(match, profile)

    return _target_to_response(match)
