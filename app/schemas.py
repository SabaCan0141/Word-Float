"""Pydantic v2 models and the Topic / Edition enums."""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_serializer


class Topic(str, Enum):
    """Google News topic feed segments. The value is the URL path segment."""

    TOP = "TOP"
    WORLD = "WORLD"
    NATION = "NATION"
    BUSINESS = "BUSINESS"
    TECHNOLOGY = "TECHNOLOGY"
    ENTERTAINMENT = "ENTERTAINMENT"
    SPORTS = "SPORTS"
    SCIENCE = "SCIENCE"
    HEALTH = "HEALTH"


class Edition(str, Enum):
    """Supported country/language editions."""

    JP = "JP"
    US = "US"

    @property
    def lang(self) -> str:
        """ISO language code used for tokenization."""
        return "ja" if self is Edition.JP else "en"


class Word(BaseModel):
    word: str
    count: int = Field(ge=0)


class Article(BaseModel):
    title: str
    link: str
    published: datetime | None = None
    # `summary` is an extension over the spec so article cards keep body text.
    summary: str = ""
    matched_words: list[str] = Field(default_factory=list)

    @field_serializer("published")
    def _ser_published(self, value: datetime | None) -> str | None:
        return _iso_z(value)


class NewsResponse(BaseModel):
    edition: Edition
    topic: Topic
    fetched_at: datetime
    cache_age_sec: int = Field(ge=0)
    lang: str
    words: list[Word]
    articles: list[Article]

    @field_serializer("fetched_at")
    def _ser_fetched_at(self, value: datetime) -> str | None:
        return _iso_z(value)


def _iso_z(value: datetime | None) -> str | None:
    """Serialize a datetime as UTC with a trailing ``Z`` (e.g. 2026-05-29T10:00:00Z)."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
