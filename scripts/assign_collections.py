#!/usr/bin/env python3
"""One-time, reviewable assignment of the existing vocabulary to study collections."""

import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALIASES = json.loads((ROOT / "data/id-aliases.json").read_text())
DEFAULT = {
    "food": "food-staples", "home": "home-rooms", "clothes": "clothes-wear",
    "education": "education-study", "work": "work-business", "people": "people-family",
    "city": "city-shops", "transport": "transport-places", "time": "time-calendar",
    "nature": "nature-weather", "objects": "objects-daily", "other": "other-abstract",
}

# Matching a headword is deliberate: no stemming or inference from a Russian
# translation, so unrelated senses are never silently moved together.
RULES = {
    "food-fruit": "φρουτ καρπουζ πορτοκαλ φραουλ μηλ αχλαδ μανταριν κερασ σταφυλ βερικοκ ροδακιν πεπον κυδων αναναν μπαναν περγαμοντ βυσσιν ροδ γκρειπφρουτ βατομουρ συκ ακτινιδ κουμκουατ λεμον μανγκ μουσμουλ νεκταριν παπαγι δαμασκην χουρμ λωτ εσπεριδοειδ",
    "food-vegetables": "λαχαν σπανακ ντοματ αγγουρ κρεμμυδ πιπερι μαρουλ λαχαν καροτ πατατ",
    "food-meat": "κρεασ χοιριν μοσχαρ κιμα κοτοπουλ ψαρ καλαμαρ χταποδ οχταποδ μπριζολ σαλαμ",
    "food-dairy": "γαλα τυρ αυγ βουτυρ γιαουρτ",
    "food-drinks": "νερο μπυρ μπιρ αλκοολ αναψυκτικ κρασ ποτ πορτοκαλαδ χυμ ροφημ τσαι",
    "food-coffee": "καφ φραπ καπουτσιν εσπρεσ στεβι",
    "food-bakery": "ψωμ σαντουιτς καραμελ σοκολατ πατατακ κουλουρ κριτσιν φρυγαν κρουασαν πιτ βουτημ γλυκ σνακ μαρμελαδ κορν τσουρεκ κεικ τουρτ παγωτ",
    "food-meals": "πρωιν μεσημεριαν βραδιν φαγητ πειν διψ ψητ φρεσκ αλμυρ μετρι σκετ",
    "home-furniture": "ψυγει ντουλαπ ντουλαπ τοστιερ κρεβατ",
    "home-cleaning": "σκον σκουπ τζαμ φροντιδ οινοπνευμα οδοντοκρεμ σαμπουαν απορρυπαντικ χαρτομαντιλ μωρομαντιλ χαρτι υγειασ ψυξ",
    "clothes-shoes": "παπουτσ γοβ σκουφ καπελ τσαντ μαντηλ γυαλ",
    "city-money": "πληρωμ ψωνι λεφτ ψιλ μετρητ ρεστ αγορ αποδειξ ζυγαρ σακουλ καρτ νουμερ χρωμ ζευγαρ",
    "people-appearance": "μαλλ μωρ αδυνατ ξανθ μελαχριν κοπελ",
    "work-professions": "κομμω κτηνιατρ υπαλληλ καθηγητ ξυλουργ τραγουδιστ εργατ πωλητ αθλητ δικηγορ ηλεκτρολογ οδηγ μηχανικ γιατρ σερβιτορ νοσοκομ δασκαλ ανεργ μαγειρ ηθοποιο ταμι αρχιτεκτον γραμματε φουρναρ περιπτερ μανaβ μανάβ φοιτητ",
    "transport-vehicles": "προαστιακ σταθμ ταξιτ αεροπλαν εισιτηρ λεωφορει ποδηλατ τρεν τραμ τρολει αυτοκινητ βαρκα ηλεκτρικ στασ",
    "transport-holiday": "ταξιδ διακοπ αιγιν εκδρομ βαλιτσ ξενοδοχει ταξιδιωτικ",
    "nature-animals": "σκυλ γατ ζωο",
    "objects-technology": "ραδιοφων τηλεορασ τηλεφων υπολογιστ κομπιουτερ ιντερνετ διαδικτυ δικτυ φωτογραφικ",
    "other-leisure": "μουσικ ταινι χορ τραγουδ αγων παιχνιδ βολτ παρεα",
    "other-colors": "ασπρ λευκ πολυχρω χρωμ",
    "other-description": "καινουργι σοβαρ καλ ομορφ μεγαλ φτην εργατικ ετοιμ συγκεκριμεν βαθυ κουρασμεν αδυνατ ξανθ μελαχριν",
    "other-pronouns": "αυτοσ εκεινοσ καποιοσ κανενασ αλλοσ ολοσ τιποτα κατι",
    "other-quantity": "αριθμ αρκετ μισοσ μερικοσ φορα ζευγαρ νουμερ",
}
EXCLUDE = {
    "πορτοκαλαδα": {"food-fruit"},
    "πορτοκαλοπιτα": {"food-fruit"},
    "φραουλοπιτα": {"food-fruit"},
    "πατατακι": {"food-vegetables"},
    "σπανακοπιτα": {"food-vegetables"},
    "τυροπιτα": {"food-dairy"},
    "λευκορωσια": {"other-colors"},
    "καλοκαιρι": {"other-description"},
    "καλαμαρι": {"other-description"},
    "καλαμαρακι": {"other-description"},
    "μωρομαντιλο": {"people-appearance"},
    "αθλητικο παπουτσι": {"work-professions"},
    "περιπτερο": {"work-professions"},
    "κτηνιατροσ": {"work-business"},
    "χαρτι": {"home-cleaning"},
    "το καφε": {"food-coffee"},
}
INCLUDE = {
    "πορτοκαλοπιτα": {"food-bakery"}, "φραουλοπιτα": {"food-bakery"},
    "σπανακοπιτα": {"food-bakery"}, "τυροπιτα": {"food-bakery"},
    "γαλλικοσ καφεσ": {"food-coffee"}, "ελληνικοσ καφεσ": {"food-coffee"},
    "φρεντο καπουτσινο": {"food-coffee"}, "φρεντο εσπρεσο": {"food-coffee"},
    "πορτοκαλαδα": {"food-drinks"}, "καφε": {"food-coffee"},
    "υπαλληλοσ": {"work-professions"}, "κτηνιατροσ": {"work-professions"},
    "ταξιτζησ": {"work-professions"},
    "αθλητικο παπουτσι": {"clothes-shoes"},
    "τα γυαλια": {"clothes-shoes"},
}

def plain(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")

def head(card):
    token = plain(card["greek"].split(" / ")[0].split(" · ")[0]).strip()
    return token.removeprefix("ο ").removeprefix("η ").removeprefix("το ").removeprefix("οι ").removeprefix("τα ")

for filename in ("words.json", "professions.json"):
    path = ROOT / "data" / filename
    rows = json.loads(path.read_text())
    for card in rows:
        if card["id"] in ALIASES:
            continue
        word = head(card)
        matches = {key for key, words in RULES.items() if any(word.startswith(term) for term in words.split())}
        matches -= EXCLUDE.get(word, set())
        matches |= INCLUDE.get(word, set())
        topic = card["topic"]
        if word.startswith("οινοπνευμα"):
            topic = card["topic"] = "home"
        if word in ("μουσικη", "ταινια", "παιχνιδι", "χοροσ", "τραγουδι"):
            topic = card["topic"] = "other"
        if word in ("ασπροσ", "λευκοσ", "πολυχρωμοσ", "χρωμα", "καινουργιοσ"):
            topic = card["topic"] = "other"
        if card["partOfSpeech"] == "pronoun":
            matches.add("other-pronouns")
        if filename == "professions.json":
            matches.add("work-professions")
        if not any(key.startswith(topic + "-") for key in matches):
            matches.add(DEFAULT[topic])
        card["collectionIds"] = sorted(matches)
    rows = [card for card in rows if card["id"] not in ALIASES]
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
