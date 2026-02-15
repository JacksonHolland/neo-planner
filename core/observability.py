"""
Observability engine — determines if and when a target is visible
from a given telescope tonight.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple

import astropy.units as u
from astropy.coordinates import AltAz, EarthLocation, SkyCoord, get_body
from astropy.time import Time

from core.target import Target
from core.telescope import TelescopeProfile

# We avoid importing astroplan at module level because it pulls in
# optional heavy deps.  The functions below use astropy directly,
# which is lighter and gives us full control.


# ── Public API ────────────────────────────────────────────────────────

def compute_observability(
    target: Target,
    profile: TelescopeProfile,
    night_date: Optional[datetime] = None,
    time_resolution_min: int = 10,
) -> Target:
    """
    Fill the target's observability fields in-place and return it.

    Parameters
    ----------
    target : Target
        Must have ``ra_deg`` and ``dec_deg`` set.
    profile : TelescopeProfile
        Observatory location and constraints.
    night_date : datetime, optional
        The evening of the night to check.  Defaults to *tonight* (UTC).
    time_resolution_min : int
        Step size in minutes for the altitude scan.

    Returns
    -------
    Target
        The same object, with observability fields populated.
    """
    if target.ra_deg is None or target.dec_deg is None:
        target.observable = False
        return target

    location = EarthLocation(
        lat=profile.lat * u.deg,
        lon=profile.lon * u.deg,
        height=profile.alt_m * u.m,
    )

    # Determine tonight's dark window
    if night_date is None:
        night_date = datetime.now(timezone.utc)

    dark_start, dark_end = _dark_window(location, night_date, profile.max_sun_alt_deg)
    if dark_start is None or dark_end is None:
        target.observable = False
        return target

    # Build a time grid across the dark window
    step = time_resolution_min * u.min
    times = _time_grid(dark_start, dark_end, step)
    if len(times) == 0:
        target.observable = False
        return target

    # Compute target altitude across the night
    target_coord = SkyCoord(ra=target.ra_deg * u.deg, dec=target.dec_deg * u.deg)
    altaz_frame = AltAz(obstime=times, location=location)
    target_altaz = target_coord.transform_to(altaz_frame)
    altitudes = target_altaz.alt.deg  # numpy array

    # Moon position (for separation check)
    moon_coord = get_body("moon", times[len(times) // 2], location)
    moon_sep = target_coord.separation(moon_coord).deg

    # Find observable window (altitude > min AND moon far enough)
    above = altitudes >= profile.min_altitude_deg
    moon_ok = moon_sep >= profile.min_moon_sep_deg

    if not above.any() or not moon_ok:
        target.observable = False
        target.moon_sep_deg = round(float(moon_sep), 1)
        return target

    # Observable indices
    obs_mask = above  # moon_ok is scalar, already checked
    obs_indices = [i for i, v in enumerate(obs_mask) if v]

    if not obs_indices:
        target.observable = False
        target.moon_sep_deg = round(float(moon_sep), 1)
        return target

    window_start_t = times[obs_indices[0]]
    window_end_t = times[obs_indices[-1]]
    window_hours = (window_end_t - window_start_t).to(u.hour).value

    best_idx = int(altitudes[obs_mask].argmax())
    best_alt = float(altitudes[obs_indices[best_idx]])
    best_airmass = _airmass(best_alt)

    # Transit (highest point)
    transit_idx = int(altitudes.argmax())
    transit_t = times[transit_idx]

    target.observable = True
    target.obs_window_start = window_start_t.to_datetime(timezone=timezone.utc)
    target.obs_window_end = window_end_t.to_datetime(timezone=timezone.utc)
    target.obs_window_hours = round(window_hours, 2)
    target.best_altitude_deg = round(best_alt, 1)
    target.best_airmass = round(best_airmass, 2)
    target.moon_sep_deg = round(float(moon_sep), 1)
    target.transit_time = transit_t.to_datetime(timezone=timezone.utc)

    return target


def filter_observable(
    targets: List[Target],
    profile: TelescopeProfile,
    night_date: Optional[datetime] = None,
) -> List[Target]:
    """
    Compute observability for all targets and return only those that are
    observable tonight *and* bright enough for the telescope.
    """
    results: List[Target] = []
    for t in targets:
        compute_observability(t, profile, night_date)

        if not t.observable:
            continue

        # Brightness check
        if t.mag_v is not None and t.mag_v > profile.limiting_mag:
            t.observable = False
            continue

        results.append(t)

    return results


# ── Internal helpers ──────────────────────────────────────────────────

def _dark_window(
    location: EarthLocation,
    evening: datetime,
    max_sun_alt: float,
) -> Tuple[Optional[Time], Optional[Time]]:
    """
    Find the start and end of astronomical darkness for a given evening.

    Scans from 17:00 local-ish to 07:00 next morning in 15-min steps
    looking for sun altitude < max_sun_alt.
    """
    # Start scan at noon UTC on the given date (safe for any timezone)
    base = Time(datetime(evening.year, evening.month, evening.day, 12, 0, 0, tzinfo=timezone.utc))
    scan_times = base + (range(0, 24 * 4)) * (15 * u.min)  # 15-min steps for 24 hours

    sun = get_body("sun", scan_times, location)
    altaz = AltAz(obstime=scan_times, location=location)
    sun_alts = sun.transform_to(altaz).alt.deg

    dark = sun_alts < max_sun_alt

    if not dark.any():
        return None, None

    dark_indices = [i for i, v in enumerate(dark) if v]
    return scan_times[dark_indices[0]], scan_times[dark_indices[-1]]


def _time_grid(start: Time, end: Time, step: u.Quantity) -> Time:
    """Build an evenly-spaced Time array from start to end."""
    n_steps = int(((end - start).to(u.min) / step.to(u.min)).decompose().value)
    if n_steps <= 0:
        return Time([])
    return start + (range(n_steps + 1)) * step


def _airmass(altitude_deg: float) -> float:
    """Approximate airmass from altitude (Pickering 2002)."""
    if altitude_deg <= 0:
        return 99.0
    import math
    return 1.0 / math.sin(math.radians(altitude_deg + 244.0 / (165.0 + 47.0 * altitude_deg ** 1.1)))

