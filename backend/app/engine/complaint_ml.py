"""Tier 2 of the intake classifier: a distilled static-embedding model.

Model2Vec static embeddings (a sentence-transformer distilled into per-token
vectors; numpy-only inference, ~30MB, MIT) plus a committed multinomial
logistic-regression head trained by scripts/train_complaint_classifier.py on
teacher-labeled chief complaints (real MIMIC-IV-ED strings reviewed label by
label, plus adversarial synthetic phrasings). It speaks ONLY when the
deterministic rule tier abstains, and only inside its training domain
(short chief-complaint text); softmax gives bounded, calibrated
probabilities, so the accept thresholds are asymmetric by clinical risk:
a high-risk call needs less confidence than a benign one.

Fail-safe by design: if the embedding model or head cannot load (no network
on first run, missing artifact), the layer reports itself unavailable and
classification falls back to the deterministic lexicon alone.
"""

import logging
import threading

from app.config import REPO_ROOT
from app.engine.esi_rules import MISS_CRITICAL

log = logging.getLogger(__name__)

EMBED_MODEL = "minishlab/potion-base-8M"
HEAD_PATH = REPO_ROOT / "data" / "complaint_model" / "head.npz"

# softmax probability floors: escalation-friendly asymmetry - a category
# that is dangerous to MISS (esi_rules.MISS_CRITICAL) is accepted at lower
# confidence than a benign one, and it is checked BEFORE the top-scoring
# class, so a benign category that merely leads cannot bury it.
HIGH_RISK_THRESHOLD = 0.45
BENIGN_THRESHOLD = 0.60

# the head was trained on chief complaints (MIMIC-IV-ED style short strings);
# long narrative vignettes are out of its domain and are left to the
# deterministic layers and the LLM reasoning path
MAX_TOKENS = 24

_lock = threading.Lock()
_state: dict | None = None


def _load() -> dict | None:
    global _state
    if _state is not None:
        return _state or None
    with _lock:
        if _state is not None:
            return _state or None
        try:
            import numpy as np
            from model2vec import StaticModel

            head = np.load(HEAD_PATH, allow_pickle=False)
            model = StaticModel.from_pretrained(EMBED_MODEL)
            _state = {
                "np": np, "model": model,
                "w": head["w"], "b": head["b"],
                "classes": [str(c) for c in head["classes"]],
                "t_high": float(head["high_risk_threshold"]),
                "t_benign": float(head["benign_threshold"]),
            }
        except Exception as e:
            log.warning("distilled classifier unavailable (%s: %s) - "
                        "falling back to lexicon-only classification",
                        type(e).__name__, e)
            _state = {}
    return _state or None


def available() -> bool:
    return _load() is not None


def predict(text: str) -> tuple[str, float] | None:
    """Best (category, probability) for a short complaint, or None when the
    layer is unavailable, the input is empty or out of domain, or confidence
    is below the risk-tiered threshold. Never raises."""
    if not text or not text.strip() or len(text.split()) > MAX_TOKENS:
        return None
    s = _load()
    if s is None:
        return None
    try:
        np = s["np"]
        v = s["model"].encode([text]).astype(np.float64)[0]
        norm = float(np.linalg.norm(v))
        if norm < 1e-9 or not np.isfinite(norm):
            return None  # nothing the embedding model recognized
        v = v / norm
        logits = v @ s["w"] + s["b"]
        logits -= logits.max()
        p = np.exp(logits)
        p /= p.sum()
        if not np.isfinite(p).all():
            return None
        probabilities = dict(zip(s["classes"], (float(x) for x in p)))
    except Exception as e:
        log.warning("distilled classifier prediction failed (%s: %s) - "
                    "abstaining", type(e).__name__, e)
        return None
    return _accept(probabilities, s["t_high"], s["t_benign"])


def _accept(probabilities: dict[str, float], t_high: float,
            t_benign: float) -> tuple[str, float] | None:
    """Escalation-friendly acceptance. A miss-critical category that clears
    its lower floor is taken even when a benign category scores higher -
    checking the top class first would silently bury exactly the categories
    the asymmetry exists to protect."""
    critical = max((c for c in probabilities if c in MISS_CRITICAL),
                   key=probabilities.get, default=None)
    if critical is not None and probabilities[critical] >= t_high:
        return critical, probabilities[critical]
    best = max(probabilities, key=probabilities.get)
    if best == "other" or probabilities[best] < t_benign:
        return None
    return best, probabilities[best]
