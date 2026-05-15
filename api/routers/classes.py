"""``/classes`` router — discovery + per-class observable targets."""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from api.models import ClassResponse, PresetResponse, SourceInfo, TargetResponse, TargetsResponse
from classes import CLASSES
from classes.base import TargetClass
from core.observability import filter_observable
from core.position import extrapolate_to_now
from core.target import Target
from core.telescope import TelescopeProfile
from sources.registry import resolve_catalog, resolve_source

router = APIRouter(prefix="/classes", tags=["classes"])


def _class_response(c: TargetClass) -> ClassResponse:
    return ClassResponse(
        name=c.name,
        label=c.label,
        description=c.description,
        canonical_catalog=SourceInfo(**resolve_catalog(c.canonical_catalog)),
        sources=[SourceInfo(**resolve_source(s)) for s in c.sources],
        filters_schema=c.filter_model.model_json_schema(),
        presets=[
            PresetResponse(name=p.name, label=p.label, description=p.description, values=p.values)
            for p in c.presets
        ],
    )


def _target_response(t: Target) -> TargetResponse:
    payload = {}
    for k, v in t.to_dict().items():
        if k in TargetResponse.model_fields:
            payload[k] = v
    return TargetResponse(**payload)


def _profile_from_filters(f) -> TelescopeProfile:
    """Build a TelescopeProfile from a class's filter model.

    Every filter model has the standard observability fields; this is the
    one place we map them to the engine's profile.
    """
    return TelescopeProfile(
        lat=f.lat,
        lon=f.lon,
        alt_m=f.alt_m,
        limiting_mag=f.limiting_mag,
        min_altitude_deg=f.min_altitude_deg,
        min_moon_sep_deg=f.min_moon_sep_deg,
        min_ha_hours=f.min_ha_hours,
        max_ha_hours=f.max_ha_hours,
        min_az_deg=f.min_az_deg,
        max_az_deg=f.max_az_deg,
        plate_scale_arcsec=f.plate_scale_arcsec,
        seeing_arcsec=f.seeing_arcsec,
        max_trail_arcsec=f.max_trail_arcsec,
    )


@router.get("", response_model=List[ClassResponse])
def list_classes() -> List[ClassResponse]:
    """List every registered class. Drives the UI class picker."""
    return [_class_response(c) for c in CLASSES.values()]


@router.get("/{name}", response_model=ClassResponse)
def get_class(name: str) -> ClassResponse:
    """Detail for one class, including its full filter schema."""
    if name not in CLASSES:
        raise HTTPException(status_code=404, detail=f"unknown class: {name}")
    return _class_response(CLASSES[name])


@router.get("/{name}/targets", response_model=TargetsResponse)
def get_targets(name: str, request: Request) -> TargetsResponse:
    """Observable, filtered targets for the named class."""
    if name not in CLASSES:
        raise HTTPException(status_code=404, detail=f"unknown class: {name}")
    cls = CLASSES[name]

    try:
        filters = cls.filter_model(**dict(request.query_params))
    except ValidationError as exc:
        errors = []
        for e in exc.errors():
            loc = [str(p) for p in e.get("loc", []) if p != "__root__"]
            field = ".".join(loc) if loc else None
            schema_field = (cls.filter_model.model_fields.get(field) if field else None)
            label = (schema_field.title if schema_field and schema_field.title else field)
            errors.append({
                "field": field,
                "label": label,
                "message": e.get("msg", "invalid value"),
            })
        raise HTTPException(status_code=422, detail={"errors": errors})

    targets = cls.get_targets()
    targets = cls.apply_filters(targets, filters)

    profile = _profile_from_filters(filters)
    targets = [copy.deepcopy(t) for t in targets]
    observable = filter_observable(targets, profile)

    now = datetime.now(timezone.utc)
    for t in observable:
        extrapolate_to_now(t, now)

    observable = observable[: filters.n_targets]
    return TargetsResponse(
        total=len(observable),
        class_name=name,
        targets=[_target_response(t) for t in observable],
    )
