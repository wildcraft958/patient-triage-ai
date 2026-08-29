# Demo video script (target 2:45, max 3:00)

Screen recording of the nurse console at http://localhost:5173/console (backend
on Sonnet 5, cache warm so every step is instant). Record at 1440x900. One take
per section is fine; cut in editing. Narration lines are suggestions, speak
naturally.

The video follows one patient through a shift rather than touring features.
Every mandated Round 2 expectation is hit and labeled below:
[15-20 records] [ambiguous] [pediatric/geriatric] [zero-history] [surge 3x]
[confidence always] [override logged]

## 0:00 - 0:18 | Hook (slide, or voice over the empty board)

> "Triage today is a snapshot. A patient is scored once at arrival, and then
> nobody systematically checks on them again. In sepsis, every hour of delay
> raises mortality by about eight percent. PatientTriage.ai scores patients
> with two independent paths, and then keeps watching everyone in the
> waiting room."

## 0:18 - 0:45 | Open the shift, watch the board fill

Action: click **Normal shift**. Press **Play arrivals** and let five or six
patients land, then pause.

> "This is a shift board in an urban emergency department. Every arrival is
> scored twice: a deterministic ESI rules engine with age-banded vital
> thresholds, and Claude reasoning grounded in the ESI handbook. The board
> ranks by acuity, shows how each patient is tracking against the safe wait
> limit for their level, and shows what their vitals are doing."
> [15-20 records] [confidence always]

Point at N. Haddad (three weeks old) and A. Okafor (three years old).

> "Half of these patients have no prior record at all. A three-week-old's
> fever and a toddler's fever score completely differently, because the
> thresholds are age-banded."  [pediatric] [zero-history]

## 0:45 - 1:15 | The ambiguous case: escalate under uncertainty

Action: step to **A. Weber** (66, burning indigestion). Click the row.

> "This 66-year-old says it is indigestion. The rules engine says ESI-3.
> Claude recognises a classic atypical cardiac presentation and says ESI-2.
> Both chains are on screen, side by side, and the system says in plain
> words which one it took and why: when the paths disagree it takes the more
> acute level, drops its confidence, and flags a clinician. Uncertainty never
> downgrades a patient."  [ambiguous] [geriatric]

Point at the belief bars.

> "The disagreement is not just a flag. It seeds a probability distribution
> over the patient's true acuity, and that distribution is what drives
> everything on the next screen."

## 1:15 - 1:50 | The novel loop: the waiting room watches back

Action: switch to the **Waiting room** tab, point at the priority column.
Switch back to the queue, click **Go live**, and let the clock run while you
talk. Wait for R. Castillo's deterioration alert to fire on its own.

> "Same patients, different question. The queue asks who is sickest. This
> board asks who to check on next, which is not the same thing: it ranks by
> deterioration risk, time since anyone last assessed them, how uncertain we
> are, and severity."

When the alert appears:

> "And there it is, with nobody touching the screen. R. Castillo came in with
> abdominal pain and chills. While he waited, his heart rate climbed
> seventeen percent and his fever rose, and every one of those numbers is on
> the alert. The system re-triaged him on the spot, and he goes to the top of
> this board with a priority of one. Nobody clicked anything. That is the
> whole point: today, that hour in the waiting room is unwatched."

> "Re-triage can only hold or escalate a level, never lower one, so a patient
> cannot be quietly downgraded by an automated path while they wait."

## 1:50 - 2:20 | The nurse answers, and the system records it

Action: click **Reassess** on the alert. Then open R. Castillo, click
**Override level**, try to confirm with no reason (the button stays disabled),
pick ESI-2, type "sepsis picture, starting fluids", confirm. Open the audit
trail on the card.

> "Answering an alert is two clicks. Reassess records that a clinician
> actually laid eyes on the patient, restarts the safe wait clock, and is
> logged with their ID. Acknowledge records only that they saw it, and
> deliberately leaves the patient overdue, because an acknowledgment that
> quietly cleared the queue would make the board look safe without making it
> safe."

> "An override legally has to record who, what, when and why. The form does
> not submit without a reason, and every one of these lands in an append-only
> audit trail you can read right here on the patient. Each override is also a
> reward signal: under-triage costs five times over-triage, and after repeated
> escalations the system starts escalating that pattern itself. The learned
> adjustment can only escalate, so learning cannot erode safety."
> [override logged]

## 2:20 - 2:38 | Surge

Action: click **Surge**, then step a few arrivals (or run
`uv run python ../scripts/replay_demo.py --speedup 3 --profile rural_100`).

> "At three times normal arrivals the load flips to SURGE and the system
> drops to the deterministic fast path: about four milliseconds a triage,
> monitoring still live. The reasoning pass is not dropped, it is queued, and
> it catches those patients up on the next tick. It can escalate them. It
> can never downgrade them."  [surge 3x]

## 2:38 - 2:55 | Evidence

Action: open the **Audit and evidence** tab.

> "This is not a slide. The console reads our benchmark results from the
> repository: on 216 held-out cases, under-triage of 1.4 percent against the
> rules engine's 37.5, zero significant under-triage, and every one of the
> sickest patients caught. Below it, live bias counters by age band and every
> clinician decision this shift with a name attached. PHI is redacted by
> Microsoft Presidio before any model call, and the reasoning path can run
> entirely on-premises."

## 2:55 - 3:00 | Close

> "PatientTriage.ai. The system recommends. The clinician decides. And
> nobody deteriorates unseen in the waiting room."

## Recording checklist

- Backend and frontend running, no shift loaded yet (the opener screen)
- Cache warm (already done), so every step is instant
- Browser zoom 100%, hide the bookmarks bar, 1440x900 window
- Live mode runs one minute of ED time per second: start it before the
  deterioration beat so the alert fires while you are talking, not after
- macOS: Cmd+Shift+5, record the selected window, mic on for narration or dub
  afterwards
- Export mp4, named per the Unstop convention if one is required
