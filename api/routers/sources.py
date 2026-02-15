"""
/sources routes — raw cached feeds from each alert source.
"""

from __future__ import annotations

import sys
import os

from fastapi import APIRouter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from api.models import SourceStatusResponse, TargetResponse

router = APIRouter(prefix="/sources", tags=["sources"])


def _get_cache():
    from api.main import _target_cache
    return _target_cache


@router.get("/neocp", response_model=SourceStatusResponse)
def neocp_feed():
    """Return the raw cached NEOCP feed (all candidates, no filtering)."""
    cache = _get_cache()
    neocp_targets = [t for t in cache["targets"] if t.source == "neocp"]
    return SourceStatusResponse(
        source="neocp",
        count=len(neocp_targets),
        last_fetched=cache.get("last_refresh"),
        targets=[
            TargetResponse(**{
                k: (v.isoformat() if hasattr(v, "isoformat") else v)
                for k, v in t.to_dict().items()
                if k in TargetResponse.__fields__
            })
            for t in neocp_targets
        ],
    )

