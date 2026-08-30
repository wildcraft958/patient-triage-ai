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

## What happens with a misspelled, Spanish, Hinglish, or never-seen complaint?

The intake classifier (`engine/complaint.py`) is two tiers. The RULE tier
combines exact clinical keywords with fuzzy phrases (accent-folded tokens, a
length-bounded transposition-aware edit distance - "anaphlaxis" matches
anaphylaxis while a sore "throat" never matches "throat closing") and a
compound pregnancy predicate (context AND a complication sign, so "I think
I'm pregnant" stays a routine visit while "28 weeks pregnant, sudden severe
headache" is an obstetric emergency: ESI-2 floor, ICD-10 O26.90, ACOG
severe-range SBP flag). Matches resolve by clinical risk: any always-high-
risk match beats any benign one. Phrases match inside one clause, so
natural speech bridges ("lips ARE swelling") while a full stop does not
("my throat. Is closing time soon?" is not anaphylaxis). Spanish ("dolor
de pecho") and Hinglish ("seene mein dard", "bukhar") phrasings classify
deterministically here - measured fact: an English embedding model scores
them near zero, so multilingual coverage must be rules, not vectors. Those
languages also move the modifier and swap the article ("dolor muy fuerte
en el pecho"), which no ordered phrase list survives, so they additionally
match on order-free clinical term pairs inside a clause.

Where the rules are silent, the MODEL tier speaks
(`engine/complaint_ml.py`): Model2Vec static embeddings with a logistic
head trained on clinically reviewed real MIMIC-IV-ED chief complaints. It
catches what nobody enumerated - "he has been shot", "elephant sitting on my
chest", "cant catch my breath" - with bounded softmax probabilities, a lower
acceptance bar for high-risk categories than benign ones, and abstention
below both. It never overrides a rule, only fills silence, and if its
artifacts cannot load the system falls back to rules alone. A committed
snapshot fixture freezes the classification of every benchmark and demo
text, so any drift fails the test suite instead of silently invalidating
the cached reasoning corpus.

## Give me a complaint your system will still get wrong

Yes, one exists, and we would rather name it than have it found. Every
reported miss has been fixed structurally, not patched: any high-risk match
now outranks any benign one, fuzzy phrases bridge natural-speech fillers
("lips ARE swelling" can no longer hide from "lips swelling"), and the
learned tier was retrained twice on disguised presentations, lifting
cross-validated recall on stroke signs from 26.7% to 57.6% and on
self-harm language from 37.5% to 70.4% while both classes roughly doubled
in size - a harder example set each time, and the numbers are printed by
our own training script. The generalization claim is enforced rather than
asserted: the probes in that test are checked against every training row
and fail the suite if any of them is a paraphrase. But a genuinely novel
phrasing of a rare emergency, with calm vitals, can still classify low:
our pinned probe "shot in the stomach" abstains to "other" rather than
guessing, and that abstention is a test on purpose. The
honest line is exact: the reported instances are fixed and the general
defense is quantifiably stronger - not solved. No keyword system or small
classifier catches every phrasing of a rare emergency, which is why three
nets sit behind the classifier: the danger-zone vitals gate reads raw
numbers regardless of category, the LLM path reads the raw redacted text
regardless of category, and the clinician reads the patient. Improving the
classifier is a one-row-plus-retrain loop, and the snapshot test makes
every change visible.

## What happens under concurrent load?

Every mutation of shared triage state goes through one reentrant lock, so
concurrent HTTP requests cannot interleave inside a check-then-act window
(an override landing while the enrichment queue drains, for example) -
verified by a multi-thread stress test in the suite. The measured ceiling
of that fully serialized pipeline is ~284 arrivals per second on a laptop
(median of five runs), including PHI redaction and classification; the test
asserts a floor of 50 per second so it stays true on slower hardware. The
busiest shipped hospital profile (500 visits a day) arrives at ~0.006 per
second, four orders of magnitude below the floor.
The lock is deliberately coarse because correctness beats parallelism at
this scale; the named step for horizontal scale is a shared store
(Postgres) behind multiple workers, which replaces the in-process state,
not the logic.

## Why keep deterministic rules in front of a learned classifier?

Three measured reasons, not taste. First, guaranteed recall: the distilled
model's cross-validated recall on small high-risk classes is honest but
imperfect (it trains on a few hundred examples), while the rule tier catches
"facial droop" or a suicidal statement 100% of the time, provably, on every
retrain - in triage, red-flag phrases must be a contract, not a probability.
Second, language coverage the embeddings measurably lack (see above). Third,
auditability: "this phrase always routes to this protocol" is answerable
with a rule table and a test; a softmax score cannot sign that contract. In
a production deployment the rule tier would live on as a single versioned,
clinician-owned table - the regulatory requirement is exactly that mapping
being inspectable and frozen between reviews, with the learned tier retrained
on the hospital's own labeled complaints underneath it.

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

## The console shows patient names. Does that not break your PHI claim?

The claim was never that names do not exist; it is that identifying data
never crosses a boundary it should not cross, and there are two of those.
The nurse's screen is inside the trust boundary and needs the name, because
"is this M. Chen?" is how a real patient gets called from a waiting room.
The reasoning path and the FHIR export are outside it. `display_name` is a
field on the intake that `llm_path.build_user_prompt` never renders and
`fhir.triage_bundle` never emits, and both boundaries are pinned by tests
(`test_display_name_never_reaches_the_reasoning_path`,
`test_fhir_export_stays_de_identified_for_a_named_patient`) that fail if a
future change starts including it. That is a stronger guarantee than
redaction gives us on free text: the complaint has to survive a recognizer
gauntlet, while the name is simply never in the string.

## Is an acknowledged alert actually recorded, or does it just disappear?

Recorded. The alert band offers two responses and they mean different things.
Reassess (`POST /patients/{id}/reassess`) says a clinician assessed the
patient: it restarts the safe-wait clock, returns them to `waiting`,
collapses the drifted acuity belief back onto the two paths, and writes a
`reassessment_check` event with the clinician ID and how long the patient had
gone unassessed. Acknowledge (`POST /patients/{id}/acknowledge`) says only
that a named clinician saw the alert: it writes an `alert_ack` event, and it
deliberately changes nothing clinical, so the patient keeps their level and
stays overdue on the board. An acknowledgment that quietly cleared the
overdue state would be a way to make a queue look safe without making it
safe.

## You benchmark with one spaCy model and deploy with a smaller one. Does that change anything?

It did, and finding it is the reason the redaction of coded clinical fields
looks the way it does. The hosted container runs `en_core_web_sm` to fit its
memory budget while the benchmark runs `en_core_web_lg`. The small model
reads "lisinopril" as a person, so on the deployed build two patients had
their medication list redacted to `<PERSON>` while the benchmarked build
left it intact. Those two prompts then no longer matched the committed
replay cache, and both patients silently lost their reasoning path in the
live demo, one of them the atypical-MI case.

The fix is in `privacy/redact.py`: a name-class finding that claims the
entire value of a coded clinical field is dropped, because the field itself
says the value is a drug or a condition. A name inside a longer entry
("insulin, prescribed by Dr. R Kumar") is still removed, which a test pins.
All 24 demo prompts are now byte-identical under both models. Free-text
prose is untouched by the rule: there, name detection is exactly right.

The general lesson we took from it: a de-identification pipeline is part of
the model's input contract, so anything that changes its output changes the
prompt. Pinning the NLP model per environment is the deployment answer;
making the clinically material fields model-independent is the better one.

## Where does the bed count come from?

`treatment_bays` in the hospital profile YAML, beside the wait limits and the
surge threshold that already lived there: 18 for the urban trauma center, 6
for the rural department. Available bays is that number minus the patients
currently in treatment, so it moves when a nurse accepts someone and it feeds
the load state alongside the queue depth. It is department configuration a
site declares, not a figure the UI invented, and the settings screen shows it
next to every other threshold read from the same file. Bed and staff
rostering proper hang off the FHIR seam when a site connects one.

## The sign-in screen. Is that real authentication?

No, and the card says so on its face: it is a demonstration of the identity
layer, and it validates nothing. What it does is real, though, and it is the
part that matters for a clinical system. The badge you sign in with is the
`clinician_id` written into every override, acceptance, bedside check and
acknowledgment in the audit trail, replacing a hardcoded constant. And the
role you pick changes what the board permits, not just what it says: a
medical assistant can record vitals and acknowledge alerts but the accept
and override controls are disabled with an explicit "requires RN sign-off",
and an administrator reads the board without touching a patient. A
deployment binds the same session object to the hospital directory over SAML
or OIDC; nothing downstream of the session changes.

## The pipeline view shows milliseconds per stage. Where do those come from?

Wall time measured around each node of the LangGraph pipeline on that
patient's actual run, carried on the queue entry and returned with the
patient record. They are not estimates and not averages: select two patients
and the numbers differ. The one wrinkle worth knowing is that redaction and
the reasoning path both show a large first-call figure because spaCy and the
retrieval index load lazily; the shift-level median and 95th percentile above
the diagram tell you what steady state looks like.

The instrumentation needed one non-obvious thing. Rules and reasoning run as
concurrent branches after redaction, so two nodes write the timing channel in
the same superstep. Without a reducer on that channel LangGraph rejects the
second writer and the whole triage fails, which is a worse outcome than
losing a number, so the merge is explicit and a test pins it.

## Why does the registry read model ids from configuration instead of listing them?

Because a page that restates its own architecture drifts from it, and we have
already been bitten by exactly that. The registry reads `settings.spacy_model`,
`settings.llm_model`, the entity list, the score floor and the escalation
threshold from the running process, so it cannot claim the container is doing
something the container is not. A test asserts the ids on screen are the ones
the service is actually configured with.

It also publishes one flag worth more than the rest of the page: exactly one
component ever sends anything off the machine. That is the clinical reasoning
path, and it is the one component that has only ever seen a de-identified
copy. A test pins both halves of that sentence together.

## The console has a night theme. Did you just invert the acuity colours?

No, and that was the one decision in the theme worth thinking about. ESI
colour is a convention: dark red, red, orange, amber, green, in that order,
read before the number is read. Inverting a palette moves hues around, and a
scale whose order stops being recognisable has lost the only thing it was for.

So the neutrals invert and the scale does not. Dark mode keeps the same five
hues in the same order and lifts each fill until it holds against a dark
ground, then flips the badge text from white to near-black through a token so
the contrast survives the lift. Everything else in the console follows the
same token set, which is why the theme is a redefinition of about forty
variables rather than a second stylesheet: there is no second place for the
two themes to disagree.

The state tints needed the same care. A wait-limit row that was pale yellow in
light mode became the heaviest object on a dark screen, which inverted the
signal, since a wait breach is a clock running out and deterioration is a
patient getting worse. The tinted row is now reserved for deterioration in
both themes and the wait breach carries a coloured rail and a pill instead.

## Why a simulation clock instead of a background scheduler?

Determinism. The demo replays 130 minutes of ED time in seconds, every test is
reproducible, and the monitor logic is identical either way. Production swaps
the clock for a scheduler that calls the same `tick()`; the swap is one
adapter, documented in `backend/app/monitor/waiting_room.py`.

## What would break first in a real hospital?

Honest list: (1) the intake classifier's learned tier is trained on a few
hundred reviewed examples; a hospital deployment retrains it on that site's
own labeled complaint stream (regional scripts and compound narratives
included), which is a data exercise the architecture is already shaped for;
(2) vitals arrive from monitors and
EHR integration (HL7/FHIR), which we mock; (3) the ESI resource-count
estimate should learn from the hospital's own historical data; (4) alert
thresholds need tuning per site to avoid alarm fatigue, which is why they
live in the hospital profile YAML rather than in code.
