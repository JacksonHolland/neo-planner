"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Source polling
NEOCP_POLL_SECONDS = int(os.getenv("NEOCP_POLL_SECONDS", "300"))  # 5 min
SCOUT_POLL_SECONDS = int(os.getenv("SCOUT_POLL_SECONDS", "300"))
