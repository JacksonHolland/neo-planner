"""Near-Earth Objects.

Sources:
- MPC NEOCP (catalogued candidates that need follow-up astrometry), enriched
  with JPL Scout (NEO/PHA scores, motion rate) and JPL Sentry (impact probability).
- Fink-flagged SSO candidates from the LSST Kafka stream (Julien's filter:
  pred.is_sso is False, singleton or single-night detection, no crossmatch,
  good quality flags).
- Fink-flagged SSO candidates from the ZTF Kafka stream (roid in {1, 2} =
  first ZTF detection or Fink SSO candidate, both un-catalogued).

Catalogued (canonical = MPC) means the target came from NEOCP. Un-catalogued
candidates come from raw Fink alerts and have not been ingested into MPC yet.
"""

from __future__ import annotations

import math
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from pydantic import BaseModel, Field

from classes import CLASSES
from classes.base import TargetClass
from core.target import Target
from sources.fink_lsst import start_fink_lsst_consumer
from sources.fink_ztf import start_fink_ztf_consumer
from sources.neocp import NEOCPAdapter
from sources.scout import enrich_targets
from sources.sentry import enrich_with_sentry

# ── Filter schema ─────────────────────────────────────────────────────

class NEOFilters(BaseModel):
    """Query params for ``GET /classes/neo/targets``."""

    # observer + telescope
    lat: float = Field(..., ge=-90, le=90, description="Observer latitude (deg)")
    lon: float = Field(..., ge=-180, le=180, description="Observer longitude (deg)")
    alt_m: float = Field(0, ge=-500, le=10000, description="Altitude above sea level (m)")
    limiting_mag: float = Field(20.0, ge=5, le=30, description="Faintest detectable magnitude")
    min_altitude_deg: float = Field(20.0, ge=0, le=89)
    min_moon_sep_deg: float = Field(30.0, ge=0, le=180)
    min_ha_hours: float = Field(-6.0, ge=-12, le=12)
    max_ha_hours: float = Field(6.0, ge=-12, le=12)
    min_az_deg: float = Field(0.0, ge=0, le=360)
    max_az_deg: float = Field(360.0, ge=0, le=360)
    plate_scale_arcsec: float = Field(2.0, gt=0)
    seeing_arcsec: float = Field(2.5, gt=0)
    max_trail_arcsec: float = Field(2.5, gt=0)

    # class-specific
    catalogued: Optional[bool] = Field(None, description="Filter to catalogued (MPC-listed) or un-catalogued candidates only")
    max_age_hours: float = Field(72.0, ge=0, description="Drop candidates whose observation is older than this")
    motion_rate_min: Optional[float] = Field(None, ge=0, description="Minimum on-sky motion rate (arcsec/min)")
    mag_h_max: Optional[float] = Field(None, description="Maximum absolute magnitude H (smaller = larger object)")
    n_targets: int = Field(20, ge=1, le=500)


# ── Cache ─────────────────────────────────────────────────────────────

_cache: List[Target] = []
_lock = threading.Lock()

NEOCP_POLL_SECONDS = int(os.getenv("NEOCP_POLL_SECONDS", "300"))


# ── NEOCP -> Scout -> Sentry chain (catalogued targets) ───────────────

def _refresh_neocp_chain() -> None:
    """Background loop: fetch NEOCP, enrich, replace catalogued entries in cache."""
    time.sleep(2)  # let the server finish booting
    while True:
        try:
            raw = NEOCPAdapter().fetch()
            enriched = enrich_targets(raw)
            enriched = enrich_with_sentry(enriched)
            now = datetime.now(timezone.utc)
            for t in enriched:
                t.target_class = "neo"
                t.catalogued = True
                t.catalog_match = t.designation
                t.observed_at = now
                if t.epoch is None:
                    t.epoch = now
            with _lock:
                _cache[:] = [t for t in _cache if not t.catalogued] + enriched
            print(f"[neo:neocp] refreshed; {len(enriched)} catalogued targets")
        except Exception as exc:
            print(f"[neo:neocp] refresh error: {exc}")
        time.sleep(NEOCP_POLL_SECONDS)


# ── Fink LSST: Julien's SSO candidate filter ──────────────────────────

_LSST_BAD_VALUES = {"Unknown", "Fail", "Fail 504", None, "", "null"}

_LSST_QUALITY_FLAGS = (
    "isDipole", "shape_flag", "forced_PsfFlux_flag", "psfFlux_flag",
    "centroid_flag", "apFlux_flag", "pixelFlags_interpolated", "pixelFlags_cr",
    "forced_PsfFlux_flag_edge", "pixelFlags_bad", "pixelFlags_saturated",
    "pixelFlags_streakCenter",
)


def _lsst_passes_quality(dia_source: dict) -> bool:
    for flag in _LSST_QUALITY_FLAGS:
        if dia_source.get(flag):
            return False
    flux = dia_source.get("psfFlux")
    flux_err = dia_source.get("psfFluxErr")
    if flux is not None and flux < 0:
        return False
    if flux is not None and flux_err and flux_err > 0 and flux / flux_err < 6:
        return False
    return True


def _lsst_has_known_counterpart(xm: dict) -> bool:
    simbad = xm.get("simbad_otype")
    if simbad and simbad not in _LSST_BAD_VALUES:
        return True
    gaia = xm.get("gaiadr3_DR3Name")
    if gaia and gaia not in _LSST_BAD_VALUES:
        plx, e_plx = xm.get("gaiadr3_Plx"), xm.get("gaiadr3_e_Plx")
        if plx and e_plx and e_plx > 0 and plx / e_plx > 5:
            return True
    vsx = xm.get("vsx_Type")
    if vsx and vsx not in _LSST_BAD_VALUES:
        return True
    return False


def _is_new_sso_candidate_lsst(alert: dict) -> bool:
    """Julien Peloton's recommended filter for fresh, uncatalogued SSO candidates."""
    pred = alert.get("pred") or {}
    if pred.get("is_sso"):
        return False

    ds = alert.get("diaSource") or {}
    do = alert.get("diaObject") or {}
    misc = alert.get("misc") or {}
    xm = alert.get("xm") or {}

    n_dia = do.get("nDiaSources") or 0
    current_mjd = ds.get("midpointMjdTai", 0)
    first_mjd = misc.get("firstDiaSourceMjdTaiFink")
    age_days = (current_mjd - first_mjd) if (current_mjd and first_mjd) else 0
    singleton_or_fresh = (n_dia == 0) or (n_dia > 0 and age_days < 1)

    return (
        singleton_or_fresh
        and not _lsst_has_known_counterpart(xm)
        and _lsst_passes_quality(ds)
    )


def _flux_njy_to_ab_mag(flux_njy: Optional[float]) -> Optional[float]:
    if flux_njy is None or flux_njy <= 0:
        return None
    return -2.5 * math.log10(flux_njy) + 31.4


def _on_fink_lsst_alert(alert: dict) -> Optional[Target]:
    if not _is_new_sso_candidate_lsst(alert):
        return None

    ds = alert.get("diaSource") or {}
    do = alert.get("diaObject") or {}
    prv = alert.get("prvDiaSources") or []
    mjd = ds.get("midpointMjdTai")

    observed_at = None
    if mjd:
        from astropy.time import Time
        observed_at = Time(mjd, format="mjd", scale="tai").utc.to_datetime(timezone=timezone.utc)

    trail_length = ds.get("trailLength")
    motion_rate = None
    if trail_length and trail_length > 0:
        motion_rate = trail_length * 60.0 / 30.0  # Rubin 30 s visit -> arcsec/min

    dia_object_id = ds.get("diaObjectId") or do.get("diaObjectId") or ds.get("diaSourceId", 0)

    return Target(
        designation=f"rubin_{dia_object_id}",
        source="fink_lsst",
        source_url=f"https://lsst.fink-portal.org/{dia_object_id}",
        target_class="neo",
        catalogued=False,
        ra_deg=ds.get("ra"),
        dec_deg=ds.get("dec"),
        epoch=observed_at,
        observed_at=observed_at,
        mag_v=_flux_njy_to_ab_mag(ds.get("psfFlux")),
        n_obs=(do.get("nDiaSources") or 0) + (len(prv) if prv else 0),
        motion_rate_arcsec_min=motion_rate,
        motion_pa_deg=ds.get("trailAngle"),
        raw={
            "band": ds.get("band"),
            "snr": ds.get("snr"),
            "trailLength": trail_length,
            "extendedness": ds.get("extendedness"),
        },
    )


# ── Fink ZTF: SSO candidates (roid 1 or 2) ────────────────────────────

def _on_fink_ztf_alert(alert: dict) -> Optional[Target]:
    roid = alert.get("roid")
    if roid not in (1, 2):
        return None

    cand = alert.get("candidate") or {}
    jd = cand.get("jd")
    observed_at = None
    if jd:
        from astropy.time import Time
        observed_at = Time(jd, format="jd", scale="utc").utc.to_datetime(timezone=timezone.utc)

    object_id = alert.get("objectId", "")
    rate_arcsec_per_day = cand.get("ssmagnr")  # ZTF doesn't expose motion rate directly; leave None
    _ = rate_arcsec_per_day  # explicit unused for clarity

    return Target(
        designation=f"ztf_{object_id}",
        source="fink_ztf",
        source_url=f"https://fink-portal.org/{object_id}",
        target_class="neo",
        catalogued=False,
        ra_deg=cand.get("ra"),
        dec_deg=cand.get("dec"),
        epoch=observed_at,
        observed_at=observed_at,
        mag_v=cand.get("magpsf"),
        raw={
            "objectId": object_id,
            "roid": roid,
            "fid": cand.get("fid"),
            "rb": cand.get("rb"),
        },
    )


# ── Filter logic ──────────────────────────────────────────────────────

def apply_filters(targets: List[Target], f: NEOFilters) -> List[Target]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=f.max_age_hours)
    out: List[Target] = []
    for t in targets:
        if f.catalogued is not None and t.catalogued != f.catalogued:
            continue
        if t.observed_at and t.observed_at < cutoff:
            continue
        if f.motion_rate_min is not None and (t.motion_rate_arcsec_min or 0) < f.motion_rate_min:
            continue
        if f.mag_h_max is not None and (t.mag_h is None or t.mag_h > f.mag_h_max):
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
    """Boot the NEOCP poller and the Fink LSST/ZTF consumers."""
    threading.Thread(target=_refresh_neocp_chain, daemon=True, name="neo_neocp").start()

    lsst_topics = os.getenv("NEO_FINK_LSST_TOPICS", "fink_uniform_sample_lsst").split(",")
    start_fink_lsst_consumer(
        topics=[t.strip() for t in lsst_topics if t.strip()],
        on_alert=_on_fink_lsst_alert,
        cache=_cache,
        lock=_lock,
        name="neo_fink_lsst",
    )

    ztf_topics = os.getenv(
        "NEO_FINK_ZTF_TOPICS",
        "fink_sso_fink_candidates_ztf,fink_sso_ztf_candidates_ztf",
    ).split(",")
    start_fink_ztf_consumer(
        topics=[t.strip() for t in ztf_topics if t.strip()],
        on_alert=_on_fink_ztf_alert,
        cache=_cache,
        lock=_lock,
        name="neo_fink_ztf",
    )


# ── Registration ──────────────────────────────────────────────────────

TARGET_CLASS = TargetClass(
    name="neo",
    label="Near-Earth Objects",
    description=(
        "Near-Earth asteroids and comets. Catalogued candidates come from the MPC "
        "NEO Confirmation Page enriched with JPL Scout (NEO/PHA scores, motion rate) "
        "and JPL Sentry (impact probability). Un-catalogued candidates come from "
        "Fink-flagged SSO alerts on the LSST and ZTF Kafka streams; they have not "
        "yet been ingested by MPC. The canonical catalog is MPC."
    ),
    canonical_catalog="MPC",
    filter_model=NEOFilters,
    sources=["neocp", "scout", "sentry", "fink_lsst", "fink_ztf"],
    get_targets=get_targets,
    apply_filters=apply_filters,
)

CLASSES["neo"] = TARGET_CLASS
