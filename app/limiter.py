"""Shared slowapi limiter instance (imported by both main and the router)."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# default_limits is empty so the limit applies only to routes that opt in via
# the @limiter.limit decorator (health/topics/editions stay unlimited).
limiter = Limiter(key_func=get_remote_address, default_limits=[])

RATE_LIMIT = f"{settings.rate_limit_per_min}/minute"
