# Demo video script (target 2:45, max 3:00)

Screen recording of the dashboard at http://localhost:5173 (backend on Sonnet 5,
cache warm so every step is instant). Record at 1440x900. One take per section
is fine; cut in editing. Narration lines are suggestions, speak naturally.

Every mandated Round 2 expectation is hit and labeled below:
[15-20 records] [ambiguous] [pediatric/geriatric] [zero-history] [surge 3x]
[confidence always] [override logged]

## 0:00 - 0:20 | Hook (slide or voice over dashboard)

> "Triage today is a snapshot. A patient is scored once at arrival, and then
> nobody systematically checks on them. In sepsis, every hour of delay raises
> mortality by about 8 percent. PatientTriage.ai scores patients with two
> independent paths, and then keeps watching everyone in the waiting room."

## 0:20 - 0:50 | Arrivals and dual-path scoring

Action: Load scenario. Step through the first 4-5 events.
Show SIM-001 (chest pain, 61) card: rules trace + Claude reasoning side by side.

> "Every arrival is scored twice: a deterministic ESI rules engine with
> age-banded vital thresholds, and Claude reasoning grounded in the ESI
> handbook. Both chains are always shown, and every score carries a
> confidence."  [confidence always]

Point briefly at SIM-002 (3-year-old, no record) and SIM-003 (3-week-old).

> "Half these patients have no prior record. A toddler's fever and a
> neonate's fever score completely differently, because thresholds are
> age-banded."  [pediatric] [zero-history]

## 0:50 - 1:20 | The ambiguous case: escalate under uncertainty

Action: step to SIM-022 (66-year-old, burning indigestion). Select it.

> "This 66-year-old smoker says it's indigestion. The rules engine says
> ESI-3. Claude recognizes a classic atypical cardiac presentation and says
> ESI-2. When the paths disagree, the system always takes the MORE acute
> level, drops its confidence, and flags the clinician with both chains.
> Uncertainty never downgrades a patient."  [ambiguous]

## 1:20 - 1:50 | The novel loop: the waiting room

Action: keep stepping until SIM-007's DETERIORATION alert fires (it will show
in the feed and the queue). Show him jump to the top of the queue.

> "And here is what no published triage system does. SIM-007 was a stable
> ESI-3 abdominal pain. While he waited, his recheck showed heart rate up 17
> percent, fever climbing. The system fired a deterioration alert, re-triaged
> him automatically to ESI-2, and moved him to the top of the reassessment
> queue. The queue constantly re-ranks by deterioration risk, wait pressure,
> uncertainty, and severity. Wait-limit breaches fire on their own clock."

## 1:50 - 2:15 | Override, audit, and the learning loop

Action: on any patient, click Override, try submitting without a reason
(button stays disabled), then fill ESI-2 + reason "looks septic", confirm.

> "The clinician decides, always. An override legally must record who, what,
> when, and why: the form will not submit without a reason, and everything
> lands in an append-only audit trail. Each override becomes a reward signal.
> Under-triage costs five times over-triage, and after repeated escalations
> the system learns to escalate that pattern by itself. The learned
> adjustment can only ever escalate, so learning cannot break safety."
> [override logged]

## 2:15 - 2:35 | Surge

Action: terminal, run: `uv run python ../scripts/replay_demo.py --speedup 3
--profile rural_100 | tail -15` (or toggle SURGE in the UI and step).

> "At three times normal arrivals, the system flips to the deterministic
> fast path: four milliseconds per triage, monitoring still live, the LLM
> becomes async enrichment instead of a bottleneck."  [surge 3x]

## 2:35 - 2:55 | Results (slide with the README table)

> "On the 216-case public benchmark from EMNLP, we beat the published GPT-4
> state of the art on under-triage, 1.4 versus 2.3 percent, with zero
> significant under-triage and 100 percent detection of the sickest
> patients. PHI is redacted by Microsoft Presidio before any model call, and
> the whole reasoning path can run on-premises on an open RL-trained model."

## 2:55 - 3:00 | Close

> "PatientTriage.ai. The system recommends. The clinician decides. And
> nobody deteriorates unseen in the waiting room."

## Recording checklist

- Backend + frontend running, scenario NOT loaded yet (fresh state)
- Cache warm (already done), so steps are instant
- Browser zoom 100%, hide bookmarks bar, 1440x900 window
- macOS: Cmd+Shift+5, record selected window, mic on for narration or dub after
- Export mp4, name per Unstop convention if required
