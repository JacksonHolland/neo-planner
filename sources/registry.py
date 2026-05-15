"""Human-readable metadata for every data source and canonical catalog.

Class modules reference sources by slug. The API resolves each slug to
``{name, label, url}`` so the frontend can render labels and outbound
links pointing to the real source.
"""

from __future__ import annotations

from typing import Dict, TypedDict


class SourceInfo(TypedDict):
    name: str       # internal slug, e.g. "neocp"
    label: str      # human-readable name shown in the UI
    url: str        # canonical landing page for the source


SOURCES: Dict[str, SourceInfo] = {
    "neocp": {
        "name": "neocp",
        "label": "MPC NEOCP",
        "url": "https://www.minorplanetcenter.net/iau/NEO/toconfirm_tabular.html",
    },
    "scout": {
        "name": "scout",
        "label": "JPL Scout",
        "url": "https://cneos.jpl.nasa.gov/scout/",
    },
    "sentry": {
        "name": "sentry",
        "label": "JPL Sentry",
        "url": "https://cneos.jpl.nasa.gov/sentry/",
    },
    "fink_lsst": {
        "name": "fink_lsst",
        "label": "Fink LSST",
        "url": "https://lsst.fink-portal.org/",
    },
    "fink_ztf": {
        "name": "fink_ztf",
        "label": "Fink ZTF",
        "url": "https://fink-portal.org/",
    },
}


CATALOGS: Dict[str, SourceInfo] = {
    "MPC": {
        "name": "MPC",
        "label": "Minor Planet Center",
        "url": "https://www.minorplanetcenter.net/",
    },
    "TNS": {
        "name": "TNS",
        "label": "Transient Name Server",
        "url": "https://www.wis-tns.org/",
    },
}


def resolve_source(slug: str) -> SourceInfo:
    """Look up a source by slug. Falls back to slug-as-label if unknown."""
    if slug in SOURCES:
        return SOURCES[slug]
    return {"name": slug, "label": slug, "url": ""}


def resolve_catalog(name: str) -> SourceInfo:
    """Look up a canonical catalog by name. Falls back if unknown."""
    if name in CATALOGS:
        return CATALOGS[name]
    return {"name": name, "label": name, "url": ""}
