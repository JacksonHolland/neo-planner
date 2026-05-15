"""Supernovae.

Sources:
- Fink LSST ``fink_sn_near_galaxy_candidate_lsst``: alerts whose properties
  match supernovae near a host galaxy (Fink filter).
- Fink ZTF ``fink_sn_candidates_ztf``: ZTF's supernova candidate stream.

Catalogued (canonical = TNS) is determined by the presence of an
``xm.tns_fullname`` crossmatch in the alert.
"""

from __future__ import annotations

import math
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from pydantic import BaseModel, Field

from classes import CLASSES
from classes.base import Preset, TargetClass
from core.target import Target
from sources.fink_lsst import start_fink_lsst_consumer
from sources.fink_ztf import start_fink_ztf_consumer

# ── Filter schema ─────────────────────────────────────────────────────

class SupernovaFilters(BaseModel):
    """Query params for ``GET /classes/supernova/targets``."""

    lat: float = Field(..., ge=-90, le=90, title="Latitude (deg)",
                       description="Observer latitude, north positive")
    lon: float = Field(..., ge=-180, le=180, title="Longitude (deg)",
                       description="Observer longitude, east positive")
    alt_m: float = Field(0, ge=-500, le=10000, title="Altitude (m)",
                        description="Height above sea level")
    limiting_mag: float = Field(19.0, ge=5, le=30, title="Limiting magnitude",
                               description="Faintest detectable apparent magnitude")
    min_altitude_deg: float = Field(20.0, ge=0, le=89, title="Min altitude (deg)",
                                    description="Lowest acceptable altitude above the horizon")
    min_moon_sep_deg: float = Field(30.0, ge=0, le=180, title="Min Moon separation (deg)",
                                    description="Minimum angular separation from the Moon")
    min_ha_hours: float = Field(-6.0, ge=-12, le=12, title="Min hour angle (h)")
    max_ha_hours: float = Field(6.0, ge=-12, le=12, title="Max hour angle (h)")
    min_az_deg: float = Field(0.0, ge=0, le=360, title="Min azimuth (deg)")
    max_az_deg: float = Field(360.0, ge=0, le=360, title="Max azimuth (deg)")
    plate_scale_arcsec: float = Field(2.0, gt=0, title="Plate scale (arcsec/pix)")
    seeing_arcsec: float = Field(2.5, gt=0, title="Seeing FWHM (arcsec)")
    max_trail_arcsec: float = Field(2.5, gt=0, title="Max trail (arcsec)")

    catalogued: Optional[bool] = Field(
        None, title="In TNS catalog",
        description="True: only TNS-classified candidates. False: only un-classified candidates.",
    )
    max_age_hours: float = Field(
        168.0, ge=0, title="Max age (hours)",
        description="Drop candidates older than this (default = 7 days)",
    )
    n_targets: int = Field(20, ge=1, le=500, title="Number of targets")


# ── Cache ─────────────────────────────────────────────────────────────

_cache: List[Target] = []
_lock = threading.Lock()

_BAD_VALUES = {"Unknown", "Fail", "Fail 504", None, "", "null"}


# ── Fink LSST handler ────────────────────────────────────────────────

def _flux_njy_to_ab_mag(flux_njy: Optional[float]) -> Optional[float]:
    if flux_njy is None or flux_njy <= 0:
        return None
    return -2.5 * math.log10(flux_njy) + 31.4


def _on_fink_lsst_alert(alert: dict) -> Optional[Target]:
    ds = alert.get("diaSource") or {}
    do = alert.get("diaObject") or {}
    xm = alert.get("xm") or {}
    mjd = ds.get("midpointMjdTai")

    observed_at = None
    if mjd:
        from astropy.time import Time
        observed_at = Time(mjd, format="mjd", scale="tai").utc.to_datetime(timezone=timezone.utc)

    tns_name = xm.get("tns_fullname")
    catalogued = bool(tns_name) and tns_name not in _BAD_VALUES

    dia_object_id = ds.get("diaObjectId") or do.get("diaObjectId") or ds.get("diaSourceId", 0)

    return Target(
        designation=f"rubin_{dia_object_id}",
        source="fink_lsst",
        source_url=f"https://lsst.fink-portal.org/{dia_object_id}",
        target_class="supernova",
        catalogued=catalogued,
        catalog_match=tns_name if catalogued else None,
        ra_deg=ds.get("ra"),
        dec_deg=ds.get("dec"),
        epoch=observed_at,
        observed_at=observed_at,
        mag_v=_flux_njy_to_ab_mag(ds.get("psfFlux")),
        n_obs=do.get("nDiaSources") or 0,
        raw={
            "band": ds.get("band"),
            "snr": ds.get("snr"),
            "tns_type": xm.get("tns_type"),
            "tns_redshift": xm.get("tns_redshift"),
        },
    )


# ── Fink ZTF handler ──────────────────────────────────────────────────

def _on_fink_ztf_alert(alert: dict) -> Optional[Target]:
    cand = alert.get("candidate") or {}
    jd = cand.get("jd")
    observed_at = None
    if jd:
        from astropy.time import Time
        observed_at = Time(jd, format="jd", scale="utc").utc.to_datetime(timezone=timezone.utc)

    object_id = alert.get("objectId", "")
    tns_name = alert.get("tns_fullname")  # Fink-added top-level field for ZTF
    catalogued = bool(tns_name) and tns_name not in _BAD_VALUES

    return Target(
        designation=f"ztf_{object_id}",
        source="fink_ztf",
        source_url=f"https://fink-portal.org/{object_id}",
        target_class="supernova",
        catalogued=catalogued,
        catalog_match=tns_name if catalogued else None,
        ra_deg=cand.get("ra"),
        dec_deg=cand.get("dec"),
        epoch=observed_at,
        observed_at=observed_at,
        mag_v=cand.get("magpsf"),
        raw={
            "objectId": object_id,
            "fid": cand.get("fid"),
            "rb": cand.get("rb"),
        },
    )


# ── Filter logic ──────────────────────────────────────────────────────

def apply_filters(targets: List[Target], f: SupernovaFilters) -> List[Target]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=f.max_age_hours)
    out: List[Target] = []
    for t in targets:
        if f.catalogued is not None and t.catalogued != f.catalogued:
            continue
        if t.observed_at and t.observed_at < cutoff:
            continue
        if t.mag_v is not None and t.mag_v > f.limiting_mag:
            continue
        out.append(t)
    return out


def get_targets() -> List[Target]:
    with _lock:
        return list(_cache)


# ── Lifecycle ─────────────────────────────────────────────────────────

def start() -> None:
    """Boot the Fink LSST and ZTF SN consumers."""
    lsst_topics = os.getenv(
        "SUPERNOVA_FINK_LSST_TOPICS", "fink_sn_near_galaxy_candidate_lsst"
    ).split(",")
    start_fink_lsst_consumer(
        topics=[t.strip() for t in lsst_topics if t.strip()],
        on_alert=_on_fink_lsst_alert,
        cache=_cache,
        lock=_lock,
        name="supernova_fink_lsst",
    )

    ztf_topics = os.getenv("SUPERNOVA_FINK_ZTF_TOPICS", "fink_sn_candidates_ztf").split(",")
    start_fink_ztf_consumer(
        topics=[t.strip() for t in ztf_topics if t.strip()],
        on_alert=_on_fink_ztf_alert,
        cache=_cache,
        lock=_lock,
        name="supernova_fink_ztf",
    )


# ── Registration ──────────────────────────────────────────────────────

TARGET_CLASS = TargetClass(
    name="supernova",
    label="Supernovae",
    description=(
        "Supernova candidates near host galaxies. Catalogued candidates have a "
        "Transient Name Server (TNS) crossmatch supplied by Fink. Un-catalogued "
        "candidates come from Fink-flagged supernova streams on LSST and ZTF and "
        "have not yet been confirmed in TNS. The canonical catalog is TNS."
    ),
    canonical_catalog="TNS",
    filter_model=SupernovaFilters,
    sources=["fink_lsst", "fink_ztf"],
    get_targets=get_targets,
    apply_filters=apply_filters,
    presets=[
        Preset(
            name="tns_classified",
            label="TNS classified",
            description="Candidates already in the Transient Name Server — known type, useful for photometric follow-up.",
            values={"catalogued": True},
        ),
        Preset(
            name="unclassified",
            label="Unclassified",
            description="Recent SN candidates not yet in TNS — earliest chance to characterize.",
            values={"catalogued": False, "max_age_hours": 72},
        ),
        Preset(
            name="bright_only",
            label="Bright only",
            description="Within reach of sub-meter telescopes.",
            values={"limiting_mag": 18.5},
        ),
    ],
)

CLASSES["supernova"] = TARGET_CLASS
