#!/usr/bin/env python3
"""Validate the static vocabulary database before publishing the PWA."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FILES = sorted(DATA.glob("*.json"))
ALLOWED_TOPICS = {
    "food", "home", "clothes", "education", "work", "people",
    "city", "transport", "time", "nature", "objects", "other",
}
ALLOWED_PARTS = {"noun", "adjective", "pronoun", "numeral", "other"}
IMPERSONAL_VERBS = {"Βρέχει", "Χιονίζει"}
EXPECTED_TOPICS = {
    "word-2026080429": "other",       # η συζήτηση
    "word-2026080433": "time",        # το πρωί
    "word-2026080434": "time",        # το βράδυ
    "word-2026080701": "other",       # αρκετός
    "word-829b42a6e1": "work",        # κτηνίατρος
    "word-08ff41980e": "work",        # ξυλουργός
    "word-13b5621ee5": "transport",   # προαστιακός
    "word-2026081106": "transport",   # ηλεκτρικός
    "word-2026081420": "objects",     # χαρτομάντηλο
    "word-2026080731": "city",        # ταβέρνα
    "word-2026082823": "city",        # καφετέρια
    "word-2026080424": "nature",      # σκύλος / σκυλί
}


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFC", value).casefold()
    value = re.sub(r"[.!?;:,]+", "", value)
    return re.sub(r"\s+", " ", value).strip()


def main() -> None:
    sources = {path.name: json.loads(path.read_text()) for path in FILES}
    cards = [card for rows in sources.values() for card in rows]

    ids = [card["id"] for card in cards]
    duplicate_ids = [key for key, count in Counter(ids).items() if count > 1]
    assert not duplicate_ids, f"duplicate IDs: {duplicate_ids}"

    for name, rows in sources.items():
        keys = [normalized(card["greek"]) for card in rows]
        duplicates = [key for key, count in Counter(keys).items() if count > 1]
        assert not duplicates, f"normalized duplicates in {name}: {duplicates}"
        for card in rows:
            assert card.get("greek") and card.get("russian"), f"incomplete card: {card.get('id')}"

    themed = sources["words.json"] + sources["professions.json"]
    for card in themed:
        assert card.get("topic") in ALLOWED_TOPICS, f"bad topic: {card['id']}"
        assert card.get("partOfSpeech") in ALLOWED_PARTS, f"bad part of speech: {card['id']}"

    themed_by_id = {card["id"]: card for card in themed}
    for card_id, expected in EXPECTED_TOPICS.items():
        actual = themed_by_id[card_id]["topic"]
        assert actual == expected, f"topic regression: {card_id}: {actual} != {expected}"

    verbs = {normalized(card["greek"]): card for card in sources["verbs.json"]}
    conjugations = {normalized(card["greek"]): card for card in sources["conjugations.json"]}
    missing = sorted(set(verbs) - set(conjugations))
    assert not missing, f"verbs without conjugation: {missing}"
    for card in conjugations.values():
        expected_count = 1 if card["greek"] in IMPERSONAL_VERBS else 6
        assert len(card.get("forms", {})) == expected_count, f"bad forms: {card['id']}"
        assert len(card.get("russianForms", {})) == expected_count, f"bad Russian forms: {card['id']}"

    print(
        f"OK: {len(cards)} cards, {len(themed)} themed cards, "
        f"{len(verbs)} verbs, {len(conjugations)} conjugations"
    )


if __name__ == "__main__":
    main()
