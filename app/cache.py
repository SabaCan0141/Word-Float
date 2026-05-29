"""Two-layer in-memory cache for computed news responses.

* ``_fresh`` (TTL = CACHE_TTL_SEC): a hit here is served directly, no upstream call.
* ``_stale`` (TTL = STALE_TTL_SEC, much longer): the last good payload, used for
  stale-while-error when an upstream fetch fails.

Both store the fully computed :class:`NewsResponse` so a cache hit never
re-tokenizes (tokenization is the expensive step).
"""

from datetime import datetime, timezone

from cachetools import TTLCache

from app.config import settings
from app.schemas import Edition, NewsResponse, Topic

CacheKey = tuple[str, str]


class NewsCache:
    def __init__(self, ttl: int, stale_ttl: int, maxsize: int = 64) -> None:
        self._fresh: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._stale: TTLCache = TTLCache(maxsize=maxsize, ttl=stale_ttl)

    @staticmethod
    def key(topic: Topic, edition: Edition) -> CacheKey:
        return (topic.value, edition.value)

    def get_fresh(self, key: CacheKey) -> NewsResponse | None:
        return self._fresh.get(key)

    def get_stale(self, key: CacheKey) -> NewsResponse | None:
        return self._stale.get(key)

    def set(self, key: CacheKey, payload: NewsResponse) -> None:
        self._fresh[key] = payload
        self._stale[key] = payload

    @staticmethod
    def age_sec(payload: NewsResponse) -> int:
        """Seconds elapsed since the payload was fetched, computed at call time."""
        fetched = payload.fetched_at
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - fetched
        return max(0, int(delta.total_seconds()))


news_cache = NewsCache(
    ttl=settings.cache_ttl_sec,
    stale_ttl=settings.stale_ttl_sec,
)
