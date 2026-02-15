"""JPL Sentry adapter — objects with non-zero Earth impact probability."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests

from core.target import Target
from sources.base import SourceAdapter

SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api"


class SentryAdapter(SourceAdapter):
    """
    Polls JPL Sentry and returns objects with calculated impact probabilities.

    Sentry tracks ~2,000 objects whose orbits pass close enough to Earth
    that a future impact cannot be completely ruled out.
    """

    name = "sentry"

    def __init__(self, url: str = SENTRY_URL, timeout: int = 30) -> None:
        self.url = url
        self.timeout = timeout

    def fetch(self) -> List[Target]:
        try:
            resp = requests.get(self.url, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            print(f"[sentry] fetch failed: {exc}")
            return []

        now = datetime.now(timezone.utc)
        targets: List[Target] = []

        for entry in data.get("data", []):
            try:
                targets.append(self._normalize(entry, now))
            except Exception as exc:
                print(f"[sentry] skipping {entry.get('des', '?')}: {exc}")

        print(f"[sentry] fetched {len(targets)} objects with impact probability")
        return targets

    @staticmethod
    def _normalize(entry: dict, now: datetime) -> Target:
        desig = str(entry.get("des", "")).strip()

        ip_str = entry.get("ip")
        impact_prob: Optional[float] = None
        if ip_str is not None:
            try:
                impact_prob = float(ip_str)
            except (ValueError, TypeError):
                pass

        h_mag: Optional[float] = None
        h_str = entry.get("h")
        if h_str is not None:
            try:
                h_mag = float(h_str)
            except (ValueError, TypeError):
                pass

        return Target(
            designation=desig,
            source="sentry",
            source_url=f"https://cneos.jpl.nasa.gov/sentry/details.html#{desig}",
            mag_h=h_mag,
            impact_prob=impact_prob,
            updated_at=now,
            raw=entry,
        )


def enrich_with_sentry(targets: List[Target]) -> List[Target]:
    """
    Cross-reference targets with Sentry data.

    If any target's designation matches a Sentry object, populate
    its impact_prob field.
    """
    adapter = SentryAdapter()
    sentry_targets = adapter.fetch()

    sentry_by_desig: Dict[str, Target] = {}
    for st in sentry_targets:
        sentry_by_desig[st.designation] = st
        # Also index without spaces for fuzzy matching
        sentry_by_desig[st.designation.replace(" ", "")] = st

    matched = 0
    for target in targets:
        match = (
            sentry_by_desig.get(target.designation)
            or sentry_by_desig.get(target.designation.replace(" ", ""))
        )
        if match and match.impact_prob is not None:
            target.impact_prob = match.impact_prob
            matched += 1

    if matched:
        print(f"[sentry] {matched} targets matched Sentry impact list")

    return targets

