"""MPC NEO Confirmation Page adapter — the primary starting source."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

import requests

from core.target import Target
from sources.base import SourceAdapter

NEOCP_URL = "https://www.minorplanetcenter.net/Extended_Files/neocp.json"


class NEOCPAdapter(SourceAdapter):
    """
    Polls the MPC NEOCP JSON feed and normalizes each candidate into a Target.

    The NEOCP is a live list of ~50-100 objects that need follow-up
    observations from other telescopes.  No auth required.
    """

    name = "neocp"

    def __init__(self, url: str = NEOCP_URL, timeout: int = 30) -> None:
        self.url = url
        self.timeout = timeout

    def fetch(self) -> List[Target]:
        try:
            resp = requests.get(self.url, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            print(f"[neocp] fetch failed: {exc}")
            return []

        now = datetime.now(timezone.utc)
        targets: List[Target] = []

        for entry in data:
            try:
                targets.append(self._normalize(entry, now))
            except Exception as exc:
                print(f"[neocp] skipping entry {entry.get('Temp_Desig', '?')}: {exc}")

        return targets

    # ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _normalize(entry: dict, now: datetime) -> Target:
        desig = entry.get("Temp_Desig", "").strip()
        score = entry.get("Score")

        return Target(
            designation=desig,
            source="neocp",
            source_url=f"https://www.minorplanetcenter.net/db_search/show_object?utf8=✓&object_id={desig}",
            ra_deg=float(entry["R.A."]) if entry.get("R.A.") is not None else None,
            dec_deg=float(entry["Decl."]) if entry.get("Decl.") is not None else None,
            epoch=now,
            mag_v=float(entry["V"]) if entry.get("V") is not None else None,
            mag_h=float(entry["H"]) if entry.get("H") is not None else None,
            n_obs=int(entry.get("NObs", 0)),
            arc_days=float(entry.get("Arc", 0)),
            not_seen_days=float(entry.get("Not_Seen_dys", 0)),
            neo_score=float(score) if score is not None else None,
            updated_at=now,
            raw=entry,
        )

