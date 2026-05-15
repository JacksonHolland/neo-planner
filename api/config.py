"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
