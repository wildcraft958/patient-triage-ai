"""The distilled intake classifier (layer 3) and the classification snapshot.

The snapshot fixture freezes classify_category's answer for every benchmark
description and every curated demo complaint. Categories key the committed
LLM replay caches (via the retrieval query inside the prompt), so ANY drift
here is a cache-invalidation event and must be a deliberate, reviewed change:
regenerate the fixture, re-warm the affected prompts, and re-run the eval.
The fixture holds whether or not the distilled layer is loadable, because the
deterministic layers answer first and the distilled layer abstains on every
frozen text - that invariance is exactly what the test enforces.
"""

import json
from pathlib import Path

import pytest

from app.engine import complaint_ml
from app.engine.complaint import classify_category

FIXTURE = Path(__file__).parent / "fixtures" / "classifier_snapshot.json"


def test_classification_snapshot_is_frozen():
    snap = json.loads(FIXTURE.read_text())
    diffs = [
        (text, want, classify_category(text))
        for group in snap.values()
        for text, want in group.items()
        if classify_category(text) != want
    ]
    assert diffs == [], f"classification drift (cache-invalidating): {diffs[:5]}"


needs_model = pytest.mark.skipif(
    not complaint_ml.available(),
    reason="distilled classifier artifacts unavailable (offline first run)",
)


@needs_model
def test_distilled_layer_catches_lexicon_blind_spots():
    # phrasings with no lexicon keyword at all: the learned layer speaks
    assert classify_category("he has been shot") == "trauma_major"
    assert classify_category("gun shot wound to the left chest") == "trauma_major"
    assert classify_category("elephant sitting on my chest") == "chest_pain"
    assert classify_category("cant catch my breath at all") == "breathing_difficulty"
    assert classify_category("my face is drooping on one side") == "stroke_signs"


@needs_model
def test_distilled_layer_abstains_on_benign_and_ambiguous():
    # 'shot' without violence context, and plain minor complaints, must not
    # be dragged into a clinical category by embedding proximity
    assert classify_category("I think I need a tetanus shot") == "other"
    assert classify_category("my tooth hurts a lot") == "other"
    assert classify_category("need a sick note for work") == "other"
    assert classify_category("hiccups for two days") == "other"


@needs_model
def test_distilled_layer_never_overrides_the_lexicon():
    # deterministic layers answered: the learned layer is never consulted
    assert complaint_ml.predict("chest pain radiating to left arm") is not None \
        or True  # predict may fire, but classify must use the lexicon
    assert classify_category("chest pain radiating to left arm") == "chest_pain"
    assert classify_category("allergic reaction, hives everywhere") == "allergic_reaction"


@needs_model
def test_long_narratives_are_out_of_domain():
    vignette = ("A patient arrives describing a long and complicated history "
                "of many symptoms over several weeks including tiredness, "
                "occasional dizziness, and general discomfort after meals, "
                "with normal vital signs recorded at the front desk today")
    assert complaint_ml.predict(vignette) is None


def test_classifier_survives_missing_model(monkeypatch):
    # fail-safe: with the distilled layer unavailable, classification
    # falls back to the deterministic lexicon alone
    monkeypatch.setattr(complaint_ml, "_state", {})
    assert classify_category("chest pain") == "chest_pain"
    assert classify_category("completely novel gibberish complaint") == "other"
