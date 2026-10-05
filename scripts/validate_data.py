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
CARD_FILES = [path for path in FILES if path.name not in {"collections.json", "id-aliases.json"}]
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
    sources = {path.name: json.loads(path.read_text()) for path in CARD_FILES}
    collections = json.loads((DATA / "collections.json").read_text())
    aliases = json.loads((DATA / "id-aliases.json").read_text())
    collection_ids = [item["id"] for item in collections]
    assert len(collection_ids) == len(set(collection_ids)), "duplicate collection IDs"
    assert all(item["parent"] in ALLOWED_TOPICS for item in collections), "bad collection parent"
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
        assert isinstance(card.get("collectionIds"), list) and card["collectionIds"], f"missing collections: {card['id']}"
        assert len(card["collectionIds"]) == len(set(card["collectionIds"])), f"repeated collection: {card['id']}"
        assert set(card["collectionIds"]) <= set(collection_ids), f"unknown collection: {card['id']}"
    active_ids = set(ids)
    assert not (set(aliases) & active_ids), "retired ID still active"
    assert set(aliases.values()) <= active_ids, "missing alias target"

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
