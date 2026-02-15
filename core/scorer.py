"""
Priority scoring engine — ranks targets by scientific value and urgency.

Each factor is normalized to [0, 1] and combined with configurable weights
from the telescope profile.
"""

from __future__ import annotations

import math
from typing import List

from core.target import Target
from core.telescope import TelescopeProfile


def score_targets(
    targets: List[Target],
    profile: TelescopeProfile,
) -> List[Target]:
    """
    Assign ``priority_score`` to each target and return the list sorted
    highest-priority first.

    Targets must already have observability fields populated.
    """
    w = profile.score_weights

    for t in targets:
        components: dict[str, float] = {}

        # 1. Urgency — days since last observation (more = higher)
        #    Normalize: 0 days → 0, ≥ 7 days → 1
        components["not_seen_days"] = _clamp(t.not_seen_days / 7.0)

        # 2. Orbit uncertainty — short arc = high value
        #    Normalize: 0 days → 1, ≥ 30 days → 0
        components["arc_days_inv"] = 1.0 - _clamp(t.arc_days / 30.0)

        # 3. NEO likelihood score (from NEOCP or Scout)
        #    Already 0-100 → scale to 0-1
        components["neo_score"] = (t.neo_score or 0) / 100.0

        # 4. PHA score (from Scout)
        components["pha_score"] = (t.pha_score or 0) / 100.0

        # 5. Impact probability (from Sentry)
        #    Use log10 scaling:  1e-9 → ~0,  1e-2 → ~1
        if t.impact_prob and t.impact_prob > 0:
            components["impact_prob"] = _clamp((math.log10(t.impact_prob) + 9) / 7.0)
        else:
            components["impact_prob"] = 0.0

        # 6. Observable window length
        #    Normalize: 0h → 0, ≥ 6h → 1
        hours = t.obs_window_hours or 0
        components["obs_window_hours"] = _clamp(hours / 6.0)

        # 7. Brightness margin (how much brighter than the limit)
        #    e.g. limit=19.5, target=17 → margin=2.5 → normalize
        if t.mag_v is not None:
            margin = profile.limiting_mag - t.mag_v
            components["brightness_margin"] = _clamp(margin / 5.0)
        else:
            components["brightness_margin"] = 0.0

        # Weighted sum
        total = 0.0
        weight_sum = 0.0
        for key, value in components.items():
            wt = w.get(key, 0.0)
            total += value * wt
            weight_sum += wt

        t.priority_score = round(total / weight_sum * 100, 1) if weight_sum > 0 else 0.0

    # Sort descending by priority
    targets.sort(key=lambda t: t.priority_score or 0, reverse=True)
    return targets


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))

