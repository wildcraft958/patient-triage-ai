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
3. **A near-instant surge path.** At 3x arrivals the rules path answers in
   milliseconds while Path B is deferred to an enrichment queue that drains on
   the next tick and may only hold or escalate the standing level
   (`TriageService.process_enrichment`, demonstrated by
   `scripts/replay_demo.py --speedup 3`).

The reverse question matters equally: rules alone under-triage 37.5% on the
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

## Why is over-triage so high (30%)? Is that not a flaw?

It is a chosen operating point, not an accident. Under-triage and over-triage
carry asymmetric costs: a missed ESI-2 can die in the waiting room; an
over-triaged ESI-4 costs some resource efficiency. The FUSE rule (more acute
wins on disagreement), the missing-vitals escalation, and the escalate-only
learning loop all deliberately spend over-triage to buy under-triage. The
benchmark shows the purchase: 1.4% under-triage and 0.0% significant
under-triage versus the published SOTA's 2.3% and 2.8%. A hospital that wants
a different point on that curve tunes it in one place (the FUSE rule and the
calibration threshold), not by retraining a model.

## Where does the POMDP actually live in your code?

`backend/app/monitor/belief.py`. The hidden state is the patient's true
acuity; the belief is a 5-way distribution over ESI levels. It initializes
from the dual-path result via pseudo-counts, so Path A/B disagreement IS the
uncertainty (a disagreeing pair produces a bimodal, higher-entropy belief);
waiting advances it through an escalation-hazard transition model; every
vitals recheck is an observation with an explicit likelihood table, applied
by Bayes rule. The policy over that belief is the reassessment priority
(`monitor/priority.py`): the pitched 4-factor product, where
acuity_uncertainty is the belief entropy and deterioration_risk doubles as
the transition hazard. The belief only ranks - the assigned ESI moves solely
through re-triage or a clinician, so the POMDP can never silently rescore a
patient. The console renders the belief as the 5-bar strip on the detail
card, and the FHIR export carries it as per-level probabilities.

## Show me GRPO and the RL training signal in the code

Three pieces. The reward model (`learning/loop.py`) scores every clinician
action on the five ResidencyRL axes (diagnostic accuracy, management
quality, communication, documentation, safety), and all five price the
scalar: communication and documentation deduct from a perfect score at 0.1
weight each, capped combined at exactly one over-triage level, so safety
keeps a 5x-per-level dominance by construction. The experience repository
is the audit trail itself, each override or acceptance logged with state,
action, correction, and the reward vector. The optimizer
(`learning/grpo.py`) is GRPO's estimator on the policy we actually learn:
group episodes per (category x age band) cell, score the factual outcome and
the counterfactual escalated recommendation with the same reward model -
the counterfactual reuses the factual episode's communication and
documentation values, so the soft axes shift whole episodes within a group
and can never fabricate a hold-vs-escalate advantage - normalize advantages
within the group (critic-free, GRPO's defining move), and write the
resulting escalation policy into the calibration table the live service
consumes. `scripts/train_policy.py` runs the whole pass. What
we deliberately do NOT do is fine-tune model weights: a triage assistant
must stay auditable, and the decision layer is where override volume
accumulates - so the decision layer is what trains. We did benchmark the
closest released RL-trained clinical model (Doctor-R1 8B) inside our
pipeline as the hospital-local option, with honest numbers.

## Can any automated path ever undo a clinician's decision?

No, and it is enforced on the patient record, not by convention. An override
stamps `decided_by` on the queue entry (`monitor/waiting_room.py`), and while
it is set no automated path may replace the level. The concrete race this
closes: a patient is surge-queued for deferred Path B enrichment, a
clinician decides before the queue drains, and the drained LLM result
disagrees. The enrichment then turns advisory - it appends its suggested
level and reasoning as a note, raises the clinician flag when its view is
MORE acute so a human sees the disagreement, and audits the outcome as
`clinician_decision_stands` (`TriageService.process_enrichment`, regression
test in `backend/tests/test_api.py`). Deterioration re-triage on new vitals
remains active for everyone - new clinical evidence may still escalate, never
downgrade - which is exactly the division of authority a hospital expects:
machines may raise concern, only people decide.

## What happens with a misspelled, Spanish, or Hinglish complaint?

The intake classifier (`engine/complaint.py`) runs two passes. Pass 1 is an
exact clinical keyword scan in precedence order. Pass 2 fires only when
pass 1 finds nothing: tokens are lowercased and accent-folded, then matched
phrase-by-phrase against a multilingual lexicon with a length-bounded edit
distance (transposition-aware, distance 1 for 7-9 character terms, 2 for
longer, exact below 7 - so "anaphlaxis" and "anaphalaxis" match anaphylaxis
while a sore "throat" alone never matches "throat closing"). Spanish
("dolor de pecho", "no puedo respirar") and Hinglish ("seene mein dard",
"saans nahi aa rahi", "bukhar") phrasings classify directly. Pregnancy
complications use a compound predicate: pregnancy context AND a complication
sign are both required, so "I think I'm pregnant" stays a routine visit
while "28 weeks pregnant, sudden severe headache" is an obstetric emergency
(ESI-2 floor, ICD-10 O26.90, ACOG severe-range SBP flag). The two-pass
design also has an engineering property: pass 1 is frozen, so every cached
reasoning replay keys on exactly the category it was recorded under.

## Why BM25 retrieval instead of embeddings?

The corpus is one handbook (95 chunks). BM25 is deterministic, offline,
dependency-light, and every retrieved excerpt carries a page citation the
clinician can check. An embedding store adds infrastructure and
non-determinism without measurable benefit at this corpus size. At deployment
scale (institution-specific protocols, multiple handbooks) we would revisit.

## What does LangGraph actually buy you here?

Today: a declarative parallel fan-out with a superstep barrier (redact, then
rules and LLM concurrently, then fuse) that reads as a graph instead of thread
plumbing (`backend/app/agent/graph.py`). We will not pretend the current
four-node graph could not be a function with a thread pool. The honest value
is the shape it leaves us: the deployment pipeline adds nodes (escalation
consult, enrichment re-fuse, interview follow-ups) and conditional edges, and
those compose in a StateGraph without rewriting orchestration.

## Why DuckDB for the audit log and not SQLite or Postgres?

The audit trail has two consumers with different shapes: append-only writes
during operation, and analytical rollups when someone asks "what is our
override rate, in which direction, with what latency" - `AuditLog.stats()`
answers those with SQL aggregation over the JSON payloads and feeds
`/metrics`. DuckDB is built for exactly that read pattern, embeds like SQLite
(no server to run in a demo or an air-gapped hospital), and reads Parquet
natively for the full MIMIC-IV-ED replay. Postgres would be justified at
multi-writer production scale; SQLite would work but makes the analytics the
awkward part.

## How do you avoid serving a stale cached LLM response to the wrong patient?

The cache key is a SHA-256 of model, system prompt, and the fully rendered
user prompt - age, vitals, redacted complaint, history, and the retrieved
handbook excerpts (`backend/app/agent/llm_path.py`). Two patients whose
clinical pictures differ in any of those produce different keys; two patients
with byte-identical pictures get the same answer, which is what a
deterministic assistant should do. What the cache does not have is TTL or
versioning: it is a replay mechanism for demos and judges, not a production
serving layer, and a deployment would version keys by model and prompt
revision.

## What stops a nurse from blindly accepting every recommendation?

Structurally, three things: both reasoning chains are always visible including
when they disagree (disagreement is flagged, not averaged away); accepting is
one click but a high-risk downgrade override requires reading and checking an
explicit risk acknowledgment (HTTP 422 without it, audited as a safety flag
with it); and every acceptance is itself a logged learning signal, so rubber
stamping is visible in the audit stats (`/metrics` reports override rate and
direction). What we do not have is measurement of automation bias in real
nurses; that is a pilot-study question and we would track
alert-acknowledgment latency and override direction as its proxies.

## How do you prevent alert fatigue?

The design is passive first: the reassessment queue reorders continuously and
interrupts nobody. Hard alerts exist for only two conditions (wait breach,
deterioration), wait-breach alerts self-suppress once the patient is marked
for reassessment, and repeat trend-deterioration alerts are rate limited by a
per-profile cooldown (`alert_cooldown_min`; danger-zone vitals always fire,
never muted). Thresholds live in the hospital profile YAML because fatigue
tuning is a per-site clinical decision, not a code constant.

## Walk me through OLDCARTS in your intake

The console's New Patient form runs the eight-field structured interview
(Onset, Location, Duration, Characteristics, Aggravating/Alleviating,
Radiation, Timing/Triggers, Severity on the 1-10 scale) with voice dictation
on the chief complaint. The fields are first-class in the intake schema
(`models.Oldcarts`), the severity answer backs up the ESI decision-B
severe-pain gate when no pain vital is recorded (`engine/esi_rules.py`),
free-text answers pass through Presidio like every other free-text field,
and captured interviews travel to the reasoning path as a dedicated prompt
section. All of it is optional by design: the system still triages the
patient who cannot answer a single question, because the mandate is to work
with whatever the first minutes actually yield.

## Why a simulation clock instead of a background scheduler?

Determinism. The demo replays 130 minutes of ED time in seconds, every test is
reproducible, and the monitor logic is identical either way. Production swaps
the clock for a scheduler that calls the same `tick()`; the swap is one
adapter, documented in `backend/app/monitor/waiting_room.py`.

## What would break first in a real hospital?

Honest list: (1) the two-pass intake classifier covers exact clinical terms,
misspellings, and Spanish/Hinglish phrasings, but a hospital's full intake
language (regional scripts, compound narratives) needs a learned NLP layer
trained on that site's own triage notes; (2) vitals arrive from monitors and
EHR integration (HL7/FHIR), which we mock; (3) the ESI resource-count
estimate should learn from the hospital's own historical data; (4) alert
thresholds need tuning per site to avoid alarm fatigue, which is why they
live in the hospital profile YAML rather than in code.
