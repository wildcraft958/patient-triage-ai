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
def test_disguised_presentations_classify():
    """Held-out phrasings (not in the training bank) of the presentations
    that hide from keywords: atypical stroke, MI, anaphylaxis, self-harm."""
    assert classify_category("my speech went funny and one arm wont lift") \
        == "stroke_signs"
    assert classify_category(
        "crushing ache in the jaw and cold sweat climbing stairs") == "chest_pain"
    assert classify_category(
        "throat feels tight and welts spreading after lunch") == "allergic_reaction"
    assert classify_category(
        "I keep thinking my family is better off without me") == "self_harm"
    # the honest ceiling, pinned: an ambiguous penetrating-trauma phrasing
    # abstains to "other" rather than guessing a wrong category - the
    # danger-zone vitals gate and the LLM path remain the net behind it
    assert classify_category("shot in the stomach") == "other"


@needs_model
def test_distilled_layer_abstains_on_benign_and_ambiguous():
    # 'shot' without violence context, and plain minor complaints, must not
    # be dragged into a clinical category by embedding proximity
    assert classify_category("I think I need a tetanus shot") == "other"
    assert classify_category("my tooth hurts a lot") == "other"
    assert classify_category("need a sick note for work") == "other"
    assert classify_category("hiccups for two days") == "other"


@needs_model
def test_distilled_layer_never_overrides_the_rules():
    # whatever the model thinks, a rule match decides the category
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
    # falls back to the deterministic rules alone
    monkeypatch.setattr(complaint_ml, "_state", {})
    assert classify_category("chest pain") == "chest_pain"
    assert classify_category("completely novel gibberish complaint") == "other"


# --- input edge cases: the classifier must never raise ---

def test_degenerate_inputs_resolve_to_other():
    assert classify_category("") == "other"
    assert classify_category("   ") == "other"
    assert classify_category("\n\t") == "other"
    assert classify_category("!!! ??? ...") == "other"
    assert classify_category("🤒🤕") == "other"


def test_non_latin_script_falls_through_without_crashing():
    # Devanagari strips to nothing in the rule tokenizer; the model may
    # abstain - either way the answer is a category string, not an error
    assert classify_category("सीने में दर्द हो रहा है") in ("chest_pain", "other")


def test_pathologically_long_input_is_bounded():
    import time
    long_text = "unrelated words about nothing in particular " * 5000
    start = time.perf_counter()
    result = classify_category(long_text)
    assert time.perf_counter() - start < 1.0  # analysis window is capped
    assert result == "other"
    # a high-risk signal inside the analysis window still wins
    assert classify_category("throat closing " + long_text) == "allergic_reaction"


def test_accented_and_uppercase_input():
    assert classify_category("REACCIÓN ALÉRGICA GRAVE") == "allergic_reaction"
    assert classify_category("CHEST PAIN X 2 HOURS") == "chest_pain"
