"""Position extrapolation for moving targets.

Called by the API endpoint just before serializing each target so that
``ra_deg``, ``dec_deg``, and ``epoch`` reflect the best estimate at request
time. Uses a simple linear motion model based on ``motion_rate_arcsec_min``
and ``motion_pa_deg``. No-op for targets without a motion vector or without
an original measurement time.

Users see both the extrapolated position and the raw inputs
(``observed_at``, ``motion_rate_arcsec_min``, ``motion_pa_deg``) so they
can compute their own uncertainty model.
"""

from __future__ import annotations

import math
from datetime import datetime

from core.target import Target


def extrapolate_to_now(t: Target, now: datetime) -> None:
    """Update t.ra_deg, t.dec_deg, t.epoch in-place using the motion vector."""
    if t.ra_deg is None or t.dec_deg is None:
        return
    if t.observed_at is None:
        return
    if t.motion_rate_arcsec_min is None or t.motion_pa_deg is None:
        return

    dt_min = (now - t.observed_at).total_seconds() / 60.0
    if dt_min <= 0:
        return

    drift_arcsec = t.motion_rate_arcsec_min * dt_min
    drift_deg = drift_arcsec / 3600.0
    pa_rad = math.radians(t.motion_pa_deg)
    cos_dec = math.cos(math.radians(t.dec_deg)) or 1e-9

    t.ra_deg = (t.ra_deg + drift_deg * math.sin(pa_rad) / cos_dec) % 360.0
    t.dec_deg = max(-90.0, min(90.0, t.dec_deg + drift_deg * math.cos(pa_rad)))
    t.epoch = now
