"""Fetch and parse Google News topic RSS feeds."""

import asyncio
from datetime import datetime, timezone

import feedparser
import httpx

from app.config import settings
from app.schemas import Article, Edition, Topic
from app.services.cleaner import clean_summary, clean_title

USER_AGENT = "WordFloat/2.0 (+https://github.com/SabaCan0141/Word-Float)"

# hl (full language) and gl (country) per edition.
_EDITION_LOCALE: dict[Edition, tuple[str, str]] = {
    Edition.JP: ("ja", "JP"),
    Edition.US: ("en-US", "US"),
}


class RSSFetchError(RuntimeError):
    """Raised when the upstream feed cannot be fetched or parsed."""


def build_feed_url(topic: Topic, edition: Edition) -> str:
    hl, gl = _EDITION_LOCALE[edition]
    # ceid uses the bare language (e.g. "US:en", not "US:en-US").
    ceid = f"{gl}:{hl.split('-')[0]}"
    query = f"hl={hl}&gl={gl}&ceid={ceid}"
    # TOP is the main feed at the base /rss path. Only WORLD, NATION, BUSINESS,
    # TECHNOLOGY, ENTERTAINMENT, SPORTS, SCIENCE, HEALTH are valid topic
    # sections; any other section segment returns an error from Google News.
    if topic is Topic.TOP:
        return f"https://news.google.com/rss?{query}"
    return (
        f"https://news.google.com/rss/headlines/section/topic/{topic.value}?{query}"
    )


def _parse_published(entry: feedparser.FeedParserDict) -> datetime | None:
    parsed = entry.get("published_parsed")
    if not parsed:
        return None
    return datetime(*parsed[:6], tzinfo=timezone.utc)


async def fetch_news(topic: Topic, edition: Edition) -> list[Article]:
    """Fetch the topic feed for an edition and return cleaned articles.

    Raises :class:`RSSFetchError` on any network, HTTP or parse failure so the
    caller can apply stale-while-error handling.
    """
    url = build_feed_url(topic, edition)
    headers = {"User-Agent": USER_AGENT}
    try:
        async with httpx.AsyncClient(
            timeout=settings.http_timeout_sec,
            follow_redirects=True,
            headers=headers,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            raw = resp.content
    except httpx.HTTPError as exc:
        raise RSSFetchError(f"failed to fetch {url}: {exc}") from exc

    # feedparser is synchronous and CPU-ish; keep it off the event loop.
    loop = asyncio.get_running_loop()
    parsed = await loop.run_in_executor(None, feedparser.parse, raw)

    if parsed.bozo and not parsed.entries:
        raise RSSFetchError(f"failed to parse feed {url}: {parsed.bozo_exception!r}")

    articles: list[Article] = []
    for entry in parsed.entries:
        title = clean_title(entry.get("title", ""))
        if not title:
            continue
        articles.append(
            Article(
                title=title,
                link=entry.get("link", ""),
                published=_parse_published(entry),
                summary=clean_summary(entry.get("summary", "")),
                matched_words=[],
            )
        )
    return articles
