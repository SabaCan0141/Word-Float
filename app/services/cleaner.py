"""HTML / URL / entity normalization for Google News RSS fields.

Google News RSS quirks this module handles:

* ``<title>`` is plain text but ends with `` - <Publisher>``.
* ``<description>`` is an HTML fragment, typically
  ``<ol><li><a ...>headline</a>&nbsp;<font color="#6f6f6f">Publisher</font></li>...</ol>``;
  the publisher name lives inside a ``<font>`` tag.
"""

import html
import re

# The publisher/media name lives inside <font>...</font>. Remove these blocks
# *before* stripping generic tags, otherwise the publisher text survives as content.
_FONT_RE = re.compile(r"<font[^>]*>.*?</font>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>", re.DOTALL)
_URL_RE = re.compile(r"https?://\S+")
_WS_RE = re.compile(r"\s+")
# Trailing " - Publisher" suffix. Anchored to end and requires surrounding
# spaces so hyphenated words such as "COVID-19" are not clipped.
_TITLE_SUFFIX_RE = re.compile(r"\s+-\s+[^-]+$")


def clean_summary(raw: str | None) -> str:
    """Strip HTML, the publisher ``<font>`` block, URLs and entities from a summary."""
    if not raw:
        return ""
    s = _FONT_RE.sub(" ", raw)
    s = _TAG_RE.sub(" ", s)
    # Unescape *after* tag stripping so an entity-encoded "&lt;b&gt;" cannot
    # reopen as real markup and corrupt the surrounding text.
    s = html.unescape(s)
    s = _URL_RE.sub(" ", s)
    # \s+ also collapses the U+00A0 produced by &nbsp;.
    return _WS_RE.sub(" ", s).strip()


def clean_title(raw: str | None) -> str:
    """Unescape entities and remove the trailing `` - Publisher`` suffix."""
    if not raw:
        return ""
    s = html.unescape(raw)
    s = _TITLE_SUFFIX_RE.sub("", s)
    return _WS_RE.sub(" ", s).strip()
