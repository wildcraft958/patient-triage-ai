# Design FAQ

Questions we expect (from judges, clinicians, or the AI-led discussion round)
and the honest answers, with pointers into the code.

## Why a deterministic rules engine at all? Why not the LLM for everything?

Three reasons, each observable in this repo:

1. **Auditability.** Every rules-path decision is a readable trace of the four
   ESI decision points (`backend/app/engine/esi_rules.py`). A hospital
   compliance officer can verify it line by line; no prompt can promise that.
2. **A veto layer the LLM cannot hallucinate past.** Red flags and danger-zone
   vitals escalate no matter what the reasoning path says, and the safety
   pipeline enforces the rules floor independently
   (`backend/app/safety/pipeline.py`).
3. **A zero-latency surge path.** At 3x arrivals the rules path answers in
   about 4 ms while the LLM becomes async enrichment
   (`scripts/replay_demo.py --speedup 3`).

The reverse question matters equally: rules alone under-triage 43% on the
public benchmark because they cannot read context. The disagreement between
the two paths is itself clinical signal; we surface it as a flag rather than
hiding it behind a single number.

## What happens when BOTH paths are wrong?

Three nets sit behind the scoring step:

1. The red-flag layer escalates on raw intake data regardless of either path.
2. The Phase 3 monitor re-examines everyone: a wrongly scored patient still
   gets wait-breach checks and vitals-recheck triggers, and deterioration
   re-triage may only hold or escalate.
3. The clinician holds every final call, and their override becomes a reward
   signal that teaches the calibration table to escalate that pattern in the
   future.

The failure mode that remains is a stable-looking patient, wrongly scored low,
who never worsens and never breaches a wait limit. That is also the least
dangerous cell in the error matrix, and the over-triage bias shrinks it
further.

## Why is over-triage so high (27%)? Is that not a flaw?

It is a chosen operating point, not an accident. Under-triage and over-triage
carry asymmetric costs: a missed ESI-2 can die in the waiting room; an
over-triaged ESI-4 costs some resource efficiency. The FUSE rule (more acute
wins on disagreement), the missing-vitals escalation, and the escalate-only
learning loop all deliberately spend over-triage to buy under-triage. The
benchmark shows the purchase: 1.4% under-triage and 0.0% significant
under-triage versus the published SOTA's 2.3% and 2.8%. A hospital that wants
a different point on that curve tunes it in one place (the FUSE rule and the
calibration threshold), not by retraining a model.

## Why did you not fine-tune a model? You claimed RL

The learning loop we ship is the part of RL that is defensible at prototype
scale: an experience repository of (state, recommendation, clinician action,
reward) tuples with asymmetric rewards, plus a conservative online policy
improvement (the escalate-only calibration table). It demonstrably changes
behavior within a session, and it cannot violate the safety invariant by
construction. Full policy optimization (GRPO per Doctor-R1, multi-axis rewards
per ResidencyRL) needs override volume that does not exist until a pilot runs;
it is our stated Round 3 path. We did benchmark the closest released
RL-trained clinical model (Doctor-R1 8B) inside our pipeline as the
hospital-local option, with honest numbers.

## Why BM25 retrieval instead of embeddings?

The corpus is one handbook (95 chunks). BM25 is deterministic, offline,
dependency-light, and every retrieved excerpt carries a page citation the
clinician can check. An embedding store adds infrastructure and
non-determinism without measurable benefit at this corpus size. At Round 3
scale (institution-specific protocols, multiple handbooks) we would revisit.

## Why a simulation clock instead of a background scheduler?

Determinism. The demo replays 130 minutes of ED time in seconds, every test is
reproducible, and the monitor logic is identical either way. Production swaps
the clock for a scheduler that calls the same `tick()`; the swap is one
adapter, documented in `backend/app/monitor/waiting_room.py`.

## What would break first in a real hospital?

Honest list: (1) the complaint-category keyword mapper is a placeholder for a
proper intake NLP step; (2) vitals arrive from monitors and EHR integration
(HL7/FHIR), which we mock; (3) the ESI resource-count estimate should learn
from the hospital's own historical data; (4) alert thresholds need tuning per
site to avoid alarm fatigue, which is why they live in the hospital profile
YAML rather than in code.
