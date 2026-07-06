"""Word tokenization and frequency counting for Japanese and English.

Japanese uses SudachiPy (``sudachidict_core``) in SplitMode.C so compound nouns
such as ``半導体`` or ``東京証券取引所`` stay a single token. English uses a regex
tokenizer plus an extended stopword / headline-cliche list.
"""

import re
import threading
from collections import Counter
from typing import Literal

from sudachipy import dictionary
from sudachipy import tokenizer as sudachi_tokenizer

Lang = Literal["ja", "en"]

# --- Japanese -------------------------------------------------------------

# Major part-of-speech tags we keep (index 0 of the POS tuple).
_KEEP_POS = {"名詞", "動詞", "形容詞"}

# Non-independent / auxiliary verbs that carry no topical meaning. Matched on
# normalized_form, dictionary_form or surface.
_NON_INDEPENDENT_VERBS = {
    "する", "為る", "ある", "有る", "在る", "いる", "居る", "なる", "成る",
    "れる", "られる", "ない", "無い", "できる", "出来る", "おる", "やる",
    "いう", "言う", "みる", "見る", "くる", "来る", "いく", "行く", "しまう",
    "おく", "置く", "もらう", "くれる", "あげる", "くださる", "下さる",
}

# Formal nouns (形式名詞): grammatical, not topical.
_FORMAL_NOUNS = {
    "こと", "事", "もの", "物", "ため", "為", "とき", "時", "ところ", "所",
    "よう", "様", "わけ", "訳", "はず", "筈", "うち", "内", "の", "ん",
    "それ", "これ", "ここ", "そこ", "あれ",
}

# POS sub-classes (index 1) to drop outright.
_DROP_SUBPOS = {"代名詞", "数詞"}

_thread_local = threading.local()


def _get_ja_tokenizer():
    """One SudachiPy tokenizer per worker thread (not guaranteed thread-safe,
    and building the dictionary is expensive)."""
    tok = getattr(_thread_local, "ja_tokenizer", None)
    if tok is None:
        tok = dictionary.Dictionary(dict="core").create()
        _thread_local.ja_tokenizer = tok
    return tok


def _tokenize_ja(text: str) -> list[str]:
    tok = _get_ja_tokenizer()
    out: list[str] = []
    for m in tok.tokenize(text, sudachi_tokenizer.Tokenizer.SplitMode.C):
        pos = m.part_of_speech()
        major, sub = pos[0], pos[1]
        if major not in _KEEP_POS:
            continue
        if sub in _DROP_SUBPOS:
            continue
        surface = m.surface()
        lemma = m.dictionary_form()
        normalized = m.normalized_form()
        # Drop non-independent verbs by POS sub-class or by lemma membership.
        if major == "動詞" and (
            "非自立" in sub
            or normalized in _NON_INDEPENDENT_VERBS
            or lemma in _NON_INDEPENDENT_VERBS
            or surface in _NON_INDEPENDENT_VERBS
        ):
            continue
        # Drop formal nouns.
        if major == "名詞" and (
            surface in _FORMAL_NOUNS or normalized in _FORMAL_NOUNS
        ):
            continue
        key = normalized
        if len(key) < 2:
            continue
        out.append(key)
    return out


# --- English --------------------------------------------------------------

_EN_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'-]+")

# v1 stopword set (app.py), flattened.
_EN_STOPWORDS = {
    "a", "an", "the",
    "and", "or", "but", "so", "if", "because", "while", "since", "until",
    "than", "as", "that", "whether",
    "in", "on", "at", "of", "to", "for", "with", "by", "from", "about",
    "above", "across", "after", "against", "around", "before", "behind",
    "below", "beneath", "beside", "between", "beyond", "down", "during",
    "into", "like", "near", "off", "out", "over", "through", "under", "up",
    "upon",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us",
    "them", "my", "your", "his", "its", "our", "their", "mine", "yours",
    "hers", "ours", "theirs", "myself", "yourself", "himself", "herself",
    "itself", "ourselves", "yourselves", "themselves", "what", "which", "who",
    "whom", "whose", "this", "these", "those", "all", "any", "both", "each",
    "few", "more", "most", "other", "some", "such", "no", "nor",
    "is", "am", "are", "was", "were", "be", "being", "been",
    "have", "has", "had", "having", "do", "does", "did", "doing", "will",
    "would", "shall", "should", "can", "could", "may", "might", "must",
    "not", "very", "just", "also", "too", "only", "here", "there", "when",
    "where", "why", "how", "again", "then", "once", "further", "now",
    "always", "never",
}

# Headline cliche words that dominate news headlines without carrying topic.
_EN_HEADLINE_CLICHES = {
    "says", "say", "said", "report", "reports", "reported", "update",
    "updates", "breaking", "watch", "live", "video", "videos", "photo",
    "photos", "exclusive", "opinion", "analysis", "news", "latest", "new",
    "first", "amid", "via", "could", "would", "may", "set", "top",
}

_EN_DROP = _EN_STOPWORDS | _EN_HEADLINE_CLICHES


def _tokenize_en_pairs(text: str) -> list[tuple[str, str]]:
    """Return ``(key, surface)`` pairs: lowercase counting key + raw surface."""
    out: list[tuple[str, str]] = []
    for raw in _EN_TOKEN_RE.findall(text):
        token = raw.lower()
        if len(token) < 2 or token in _EN_DROP:
            continue
        out.append((token, raw))
    return out


def _tokenize_en(text: str) -> list[str]:
    return [key for key, _ in _tokenize_en_pairs(text)]


# --- Display-form resolution ------------------------------------------------

# If the exact-lowercase surface accounts for at least this share of a key's
# occurrences, display lowercase. Guards against Title Case headlines making
# ordinary words ("Market", "Chip") win the vote, while acronyms and proper
# nouns ("AI", "Google", "NASA") — which are almost never written lowercase —
# still surface in their canonical spelling.
_LOWERCASE_BIAS = 0.25


def resolve_display_forms(variants: dict[str, Counter]) -> dict[str, str]:
    """Map each counting key to its display spelling by biased majority vote.

    ``variants[key]`` counts raw surface spellings observed for ``key``.
    Lowercase wins whenever it holds >= ``_LOWERCASE_BIAS`` of occurrences;
    otherwise the most frequent surface wins (ties broken deterministically).
    """
    display: dict[str, str] = {}
    for key, surfaces in variants.items():
        total = sum(surfaces.values())
        if total == 0 or surfaces.get(key, 0) >= _LOWERCASE_BIAS * total:
            display[key] = key
            continue
        display[key] = max(surfaces.items(), key=lambda kv: (kv[1], kv[0]))[0]
    return display


# --- Public API -----------------------------------------------------------

def tokenize(text: str, lang: Lang) -> list[str]:
    """Tokenize ``text`` into a list of content-word keys."""
    if not text:
        return []
    return _tokenize_ja(text) if lang == "ja" else _tokenize_en(text)


def tokenize_pairs(text: str, lang: Lang) -> list[tuple[str, str]]:
    """Tokenize into ``(key, surface)`` pairs.

    ``key`` is the counting/matching key (lowercase for English, normalized
    form for Japanese); ``surface`` is the spelling as it appeared. For
    Japanese the key doubles as the surface.
    """
    if not text:
        return []
    if lang == "ja":
        return [(k, k) for k in _tokenize_ja(text)]
    return _tokenize_en_pairs(text)


def word_frequencies(texts: list[str], lang: str) -> Counter:
    """Count total token occurrences across ``texts`` (term frequency)."""
    counter: Counter = Counter()
    for text in texts:
        counter.update(tokenize(text, lang))  # type: ignore[arg-type]
    return counter
