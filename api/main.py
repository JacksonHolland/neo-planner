"""
FastAPI application — NEO Follow-Up Target Planner API.

Aggregates alerts from multiple sources, filters for observability,
and serves ranked targets to telescopes and citizen scientists.
"""

from __future__ import annotations

import sys
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

# Ensure project root is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import HOST, PORT, NEOCP_POLL_SECONDS
from api.models import HealthResponse
from api.routers import targets, sources

from core.target import Target
from sources.neocp import NEOCPAdapter
from sources.scout import enrich_targets
from sources.sentry import enrich_with_sentry

# ── In-memory target cache ────────────────────────────────────────────
_target_cache: Dict[str, Any] = {
    "targets": [],
    "last_refresh": None,
}


def _refresh_targets() -> None:
    """Fetch from all sources, enrich, and update the cache."""
    global _target_cache

    adapter = NEOCPAdapter()
    raw = adapter.fetch()
    enriched = enrich_targets(raw)
    enriched = enrich_with_sentry(enriched)

    _target_cache["targets"] = enriched
    _target_cache["last_refresh"] = datetime.now(timezone.utc).isoformat()
    print(f"[refresh] {len(enriched)} targets loaded at {_target_cache['last_refresh']}")


def _poll_loop() -> None:
    """Background thread that refreshes sources periodically."""
    while True:
        try:
            _refresh_targets()
        except Exception as exc:
            print(f"[refresh] error: {exc}")
        time.sleep(NEOCP_POLL_SECONDS)


# ── FastAPI app ───────────────────────────────────────────────────────

app = FastAPI(
    title="NEO Target Planner API",
    description=(
        "Aggregates NEO alerts from MPC NEOCP, JPL Scout, and other sources. "
        "Filters for observability from any telescope location. "
        "Returns ranked follow-up targets in multiple formats."
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # wide open for citizen scientists
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(targets.router)
app.include_router(sources.router)


@app.on_event("startup")
def startup():
    _refresh_targets()
    t = threading.Thread(target=_poll_loop, daemon=True)
    t.start()
    print(f"[startup] Background polling every {NEOCP_POLL_SECONDS}s")


@app.get("/", tags=["health"])
def root():
    return {"message": "NEO Target Planner API", "docs": "/docs"}


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health():
    return HealthResponse(
        status="ok",
        sources={"neocp": len([t for t in _target_cache["targets"] if t.source == "neocp"])},
        last_refresh=_target_cache.get("last_refresh"),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host=HOST, port=PORT, reload=True)
