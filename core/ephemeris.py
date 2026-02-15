"""
Ephemeris engine — queries JPL Horizons for predicted positions
at the actual observation time.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from core.target import Target
from core.telescope import TelescopeProfile


def compute_ephemeris(target: Target, profile: TelescopeProfile) -> Target:
    """
    Query JPL Horizons for predicted RA/Dec, motion rate, and magnitude
    at the target's transit time (or observable window midpoint).

    Updates ephemeris fields on the target in-place. Falls back gracefully
    if the object is not in Horizons or the query fails.
    """
    # Determine the time to query for
    query_time = _best_query_time(target)
    if query_time is None:
        return target

    try:
        from astroquery.jplhorizons import Horizons

        # NEOCP designations need special handling — Horizons uses
        # the designation as a "smallbody" search with DES= prefix
        obj = Horizons(
            id=target.designation,
            location=f"{profile.lon},{profile.lat},{profile.alt_m / 1000.0}",
            epochs=query_time.jd if hasattr(query_time, "jd") else _to_jd(query_time),
            id_type="smallbody",
        )

        eph = obj.ephemerides()

        if eph is None or len(eph) == 0:
            return target

        row = eph[0]

        target.predicted_ra_deg = float(row["RA"])
        target.predicted_dec_deg = float(row["DEC"])
        target.predicted_epoch = query_time if isinstance(query_time, datetime) else query_time.to_datetime(timezone=timezone.utc)

        # Motion rate: dRA*cosD and dDEC are in arcsec/hr in Horizons
        dra = float(row.get("RA_rate", 0))   # arcsec/hr
        ddec = float(row.get("DEC_rate", 0)) # arcsec/hr
        total_rate_hr = math.sqrt(dra**2 + ddec**2)
        target.motion_rate_arcsec_min = round(total_rate_hr / 60.0, 3)

        # Position angle of motion (degrees, N through E)
        if total_rate_hr > 0:
            pa = math.degrees(math.atan2(dra, ddec)) % 360
            target.motion_pa_deg = round(pa, 1)

        # Predicted magnitude
        v_mag = row.get("V")
        if v_mag is not None:
            try:
                target.predicted_mag = round(float(v_mag), 2)
            except (ValueError, TypeError):
                pass

    except Exception as exc:
        # Common: designation not yet in Horizons database
        # Fall back silently — NEOCP position is still valid as approximate
        print(f"[ephemeris] {target.designation}: {exc}")

    return target


def enrich_ephemeris(targets: List[Target], profile: TelescopeProfile) -> List[Target]:
    """Compute ephemeris for a list of observable targets."""
    for t in targets:
        compute_ephemeris(t, profile)
    return targets


def _best_query_time(target: Target) -> Optional[datetime]:
    """Pick the best time to query ephemeris for."""
    if target.transit_time:
        return target.transit_time
    if target.obs_window_start and target.obs_window_end:
        mid = target.obs_window_start + (target.obs_window_end - target.obs_window_start) / 2
        return mid
    return None


def _to_jd(dt: datetime) -> float:
    """Convert a datetime to Julian Date."""
    from astropy.time import Time
    return Time(dt).jd

