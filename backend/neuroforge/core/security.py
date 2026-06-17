# Token + role auth. Off by default so dev/preview need no setup. Enable with
#   NEUROFORGE_AUTH=1
#   NEUROFORGE_TOKENS="secret-a:admin,secret-b:analyst,secret-c:viewer"
# Roles are hierarchical: admin > analyst > viewer. Apply per-router in main.py.
from __future__ import annotations

import os
import logging

from fastapi import Header, HTTPException

log = logging.getLogger("neuroforge.security")

ROLE_RANK = {"viewer": 1, "analyst": 2, "admin": 3}


class Auth:
    def __init__(self) -> None:
        self.enabled = os.environ.get("NEUROFORGE_AUTH", "0") == "1"
        self.tokens: dict[str, str] = {}
        for pair in os.environ.get("NEUROFORGE_TOKENS", "").split(","):
            pair = pair.strip()
            if ":" in pair:
                tok, role = pair.split(":", 1)
                if role.strip() in ROLE_RANK:
                    self.tokens[tok.strip()] = role.strip()
        if self.enabled and not self.tokens:
            log.warning("NEUROFORGE_AUTH=1 but no valid NEUROFORGE_TOKENS — all requests will 401")

    def role_for(self, token: str) -> str | None:
        return self.tokens.get(token)


auth = Auth()


def require(min_role: str = "viewer"):
    """FastAPI dependency that enforces a minimum role when auth is enabled."""
    def dep(authorization: str | None = Header(default=None)) -> str:
        if not auth.enabled:
            return "admin"
        token = (authorization or "").removeprefix("Bearer ").strip()
        role = auth.role_for(token)
        if role is None:
            raise HTTPException(401, "missing or invalid token")
        if ROLE_RANK[role] < ROLE_RANK[min_role]:
            raise HTTPException(403, f"requires role >= {min_role}")
        return role
    return dep
