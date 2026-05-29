"""News API routes: /api/news, /api/topics, /api/editions, /api/healthz."""

import logging
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse

from app.cache import news_cache
from app.limiter import RATE_LIMIT, limiter
from app.schemas import Article, Edition, NewsResponse, Topic, Word
from app.services import rss
from app.services.tokenizer import tokenize, word_frequencies

logger = logging.getLogger("wordfloat.news")

router = APIRouter(prefix="/api", tags=["news"])

# Cached responses are built at the maximum limit once, then sliced per request.
_MAX_LIMIT = 200

# Meta words that appear across news copy without indicating the topic.
# Applied to the frequency counter *before* selecting the top-N.
_METAWORDS = {
    # Japanese
    "ニュース", "写真", "画像", "動画", "記事", "速報", "一覧", "詳細",
    "配信", "提供", "解説", "特集", "更新", "掲載", "報道", "全文",
    # English
    "news", "photo", "photos", "video", "videos", "image", "images",
    "article", "story", "full", "read",
}


def build_news_response(
    topic: Topic, edition: Edition, articles: list[Article]
) -> NewsResponse:
    """Tokenize articles, count words, and attach matched_words per article.

    Always built at ``_MAX_LIMIT``; :func:`slice_response` narrows it per request.
    """
    lang = edition.lang
    # Tokenize each article exactly once and reuse for counting + matching.
    per_article_tokens: list[list[str]] = [
        tokenize(f"{a.title} {a.summary}", lang) for a in articles
    ]

    counter: Counter = Counter()
    for tokens in per_article_tokens:
        counter.update(tokens)

    # Drop metawords before slicing so they do not consume top-N slots.
    for meta in _METAWORDS:
        counter.pop(meta, None)

    top = counter.most_common(_MAX_LIMIT)
    top_words = [word for word, _ in top]
    words = [Word(word=word, count=count) for word, count in top]

    for article, tokens in zip(articles, per_article_tokens):
        token_set = set(tokens)
        # Iterate top_words to preserve frequency-rank order.
        article.matched_words = [w for w in top_words if w in token_set]

    return NewsResponse(
        edition=edition,
        topic=topic,
        fetched_at=datetime.now(timezone.utc),
        cache_age_sec=0,
        lang=lang,
        words=words,
        articles=articles,
    )


def slice_response(payload: NewsResponse, limit: int, age_sec: int) -> NewsResponse:
    """Return a view of a cached response narrowed to ``limit`` words.

    Cheap (no re-tokenization): slices the word list and filters each article's
    matched_words to the surviving top set, preserving rank order.
    """
    sliced_words = payload.words[:limit]
    top_set = {w.word for w in sliced_words}
    articles = [
        a.model_copy(
            update={"matched_words": [w for w in a.matched_words if w in top_set]}
        )
        for a in payload.articles
    ]
    return payload.model_copy(
        update={
            "words": sliced_words,
            "articles": articles,
            "cache_age_sec": age_sec,
        }
    )


@router.get("/news", response_model=NewsResponse)
@limiter.limit(RATE_LIMIT)
async def get_news(
    request: Request,
    response: Response,
    topic: Topic = Topic.TOP,
    edition: Edition = Edition.JP,
    limit: int = Query(50, ge=1, le=200),
) -> NewsResponse:
    key = news_cache.key(topic, edition)

    fresh = news_cache.get_fresh(key)
    if fresh is not None:
        response.headers["X-Cache"] = "HIT"
        return slice_response(fresh, limit, news_cache.age_sec(fresh))

    try:
        articles = await rss.fetch_news(topic, edition)
    except rss.RSSFetchError as exc:
        stale = news_cache.get_stale(key)
        if stale is not None:
            logger.warning("upstream failed, serving stale cache: %s", exc)
            response.headers["X-Cache"] = "STALE"
            return slice_response(stale, limit, news_cache.age_sec(stale))
        logger.error("upstream RSS unreachable: %s", exc)
        return JSONResponse(
            status_code=502, content={"detail": "upstream RSS unreachable"}
        )

    payload = build_news_response(topic, edition, articles)
    news_cache.set(key, payload)
    response.headers["X-Cache"] = "MISS"
    return slice_response(payload, limit, 0)


@router.get("/topics")
async def get_topics() -> dict[str, list[str]]:
    return {"topics": [t.value for t in Topic]}


@router.get("/editions")
async def get_editions() -> dict[str, list[str]]:
    return {"editions": [e.value for e in Edition]}


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
