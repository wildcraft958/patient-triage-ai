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


# The generalization claim: presentations that hide from keywords, in
# phrasings the model has never seen. "Never seen" is enforced, not
# asserted - see the paraphrase-distance test below.
HELD_OUT_PROBES = {
    "my speech went funny and one arm wont lift": "stroke_signs",
    "chest heavy walking the dog, better sitting down": "chest_pain",
    "my face puffed up and I am covered in itchy bumps": "allergic_reaction",
    "I have written a note and I am ready": "self_harm",
}

# Measured on this embedding model: true paraphrase pairs ("gunshot to the
# abdomen" / "shot in the stomach") score 0.63 to 0.88 cosine, while
# same-concept-different-words pairs score 0.28 to 0.58.
PARAPHRASE_SIMILARITY = 0.6


def _nearest_training_row(text: str) -> tuple[float, str]:
    """Closest row in the bank the head was fitted on, by cosine."""
    state = complaint_ml._load()
    np, model = state["np"], state["model"]
    data = Path(__file__).resolve().parents[2] / "data"
    rows = [r["text"] for r in
            json.loads((data / "complaint_examples.json").read_text())["examples"]]
    rows += [p["chief_complaint"] for p in
             json.loads((data / "curated_patients.json").read_text())]
    bank = model.encode(rows).astype(np.float64)
    bank /= np.linalg.norm(bank, axis=1, keepdims=True)
    v = model.encode([text]).astype(np.float64)[0]
    sims = bank @ (v / np.linalg.norm(v))
    i = int(sims.argmax())
    return float(sims[i]), rows[i]


@needs_model
def test_disguised_presentations_classify():
    assert {t: classify_category(t) for t in HELD_OUT_PROBES} == HELD_OUT_PROBES
    # the honest ceiling, pinned: an ambiguous penetrating-trauma phrasing
    # abstains to "other" rather than guessing a wrong category - the
    # danger-zone vitals gate and the LLM path remain the net behind it
    assert classify_category("shot in the stomach") == "other"


@needs_model
def test_the_disguised_probes_are_not_paraphrases_of_training_rows():
    """A generalization claim is only worth something if the probes are
    genuinely unseen. A training row added later that paraphrases one of
    them turns this red instead of quietly inflating the claim."""
    too_close = {
        text: nearest
        for text, (similarity, nearest) in
        ((t, _nearest_training_row(t)) for t in HELD_OUT_PROBES)
        if similarity >= PARAPHRASE_SIMILARITY
    }
    assert too_close == {}, f"probes paraphrase the training bank: {too_close}"


# --- acceptance thresholds: pure functions, no model needed ---

def test_a_miss_critical_class_clears_its_floor_even_when_a_benign_class_leads():
    # the asymmetry exists to protect exactly these categories; taking the
    # top class first would bury a chest pain that already cleared its floor
    probs = {"other": 0.30, "abdominal_pain": 0.24, "chest_pain": 0.46}
    assert complaint_ml._accept(probs, 0.45, 0.60) == ("chest_pain", 0.46)


def test_a_benign_leader_below_its_own_floor_abstains():
    probs = {"abdominal_pain": 0.55, "chest_pain": 0.20, "other": 0.25}
    assert complaint_ml._accept(probs, 0.45, 0.60) is None


def test_a_confident_benign_class_is_accepted():
    probs = {"fever": 0.70, "chest_pain": 0.10, "other": 0.20}
    assert complaint_ml._accept(probs, 0.45, 0.60) == ("fever", 0.70)


def test_a_leading_other_abstains():
    probs = {"other": 0.80, "fever": 0.15, "chest_pain": 0.05}
    assert complaint_ml._accept(probs, 0.45, 0.60) is None


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
