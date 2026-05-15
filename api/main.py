"""FastAPI entry point for the follow-up target platform.

On startup, imports the ``classes`` package (which registers every class
on import) and calls ``start_all()`` to boot each class's background source
threads. All target data flows through the class registry; the router has
two endpoints (``/classes`` and ``/classes/{name}/targets``).
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.config import HOST, PORT
from api.routers import classes as classes_router
from classes import CLASSES, start_all

app = FastAPI(
    title="Follow-up Target Platform",
    description=(
        "Class-first follow-up target service. Pick a target class "
        "(NEO, Supernova, ...), filter by your location and telescope, "
        "get a list of observable targets with source attribution."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(classes_router.router)


@app.on_event("startup")
def startup() -> None:
    start_all()
    print(f"[startup] registered classes: {list(CLASSES.keys())}")


@app.get("/", tags=["health"])
def root():
    return {
        "service": "follow-up target platform",
        "classes": list(CLASSES.keys()),
        "docs": "/docs",
    }


@app.get("/health", tags=["health"])
def health():
    return {
        "status": "ok",
        "classes": {
            name: {
                "cached_targets": len(c.get_targets()),
                "sources": c.sources,
            }
            for name, c in CLASSES.items()
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.main:app", host=HOST, port=PORT, reload=True)
