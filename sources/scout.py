"""JPL Scout adapter — enriches targets with hazard scoring."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests

from core.target import Target
from sources.base import SourceAdapter

SCOUT_URL = "https://ssd-api.jpl.nasa.gov/scout.api"


class ScoutAdapter(SourceAdapter):
    """
    Polls JPL Scout and normalizes each object into a Target.

    Scout evaluates NEOCP candidates and assigns them:
      - neoScore  (0-100): probability of being a real NEO
      - phaScore  (0-100): potentially hazardous asteroid score
      - neo1kmScore: probability of being > 1 km
    """

    name = "scout"

    def __init__(self, url: str = SCOUT_URL, timeout: int = 30) -> None:
        self.url = url
        self.timeout = timeout

    def fetch(self) -> List[Target]:
        try:
            resp = requests.get(self.url, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            print(f"[scout] fetch failed: {exc}")
            return []

        now = datetime.now(timezone.utc)
        targets: List[Target] = []

        for entry in data.get("data", []):
            try:
                targets.append(self._normalize(entry, now))
            except Exception as exc:
                print(f"[scout] skipping {entry.get('objectName', '?')}: {exc}")

        return targets

    def fetch_detail(self, designation: str) -> Optional[Target]:
        """Fetch detailed Scout data for a single object by designation."""
        try:
            resp = requests.get(
                self.url,
                params={"tdes": designation},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            entry = resp.json()
            return self._normalize(entry, datetime.now(timezone.utc))
        except Exception:
            return None

    # ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _normalize(entry: dict, now: datetime) -> Target:
        desig = str(entry.get("objectName", "")).strip()

        def _safe_float(key: str) -> Optional[float]:
            v = entry.get(key)
            if v is None:
                return None
            try:
                return float(v)
            except (ValueError, TypeError):
                return None

        # RA comes as "HH:MM" string from the summary endpoint
        ra_deg = None
        ra_raw = entry.get("ra")
        if ra_raw is not None:
            try:
                if ":" in str(ra_raw):
                    parts = str(ra_raw).split(":")
                    ra_deg = (float(parts[0]) + float(parts[1]) / 60) * 15.0
                else:
                    ra_deg = float(ra_raw)
            except (ValueError, IndexError):
                pass

        dec_deg = None
        dec_raw = entry.get("dec")
        if dec_raw is not None:
            try:
                dec_deg = float(dec_raw)
            except (ValueError, TypeError):
                pass

        return Target(
            designation=desig,
            source="scout",
            source_url=f"https://cneos.jpl.nasa.gov/scout/#/object/{desig}",
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            epoch=now,
            mag_v=_safe_float("Vmag"),
            mag_h=_safe_float("H"),
            n_obs=int(entry.get("nObs", 0)),
            arc_days=float(entry.get("arc", 0)),
            neo_score=_safe_float("neoScore"),
            pha_score=_safe_float("phaScore"),
            updated_at=now,
            raw=entry,
        )


def enrich_targets(targets: List[Target]) -> List[Target]:
    """
    Cross-reference a list of targets (typically from NEOCP) with Scout data.

    Merges Scout's hazard scores into matching targets.
    """
    adapter = ScoutAdapter()
    scout_targets = adapter.fetch()

    scout_by_desig: Dict[str, Target] = {t.designation: t for t in scout_targets}

    for target in targets:
        match = scout_by_desig.get(target.designation)
        if match:
            target.merge(match)

    return targets

