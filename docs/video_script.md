# Demo video script (target 2:45, max 3:00)

Screen recording of the nurse console at http://localhost:5173/console (backend
on Sonnet 5, cache warm so every step is instant). Record at 1600x1000. One take
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

## 0:18 - 0:32 | Sign in

Action: on the sign-in screen, leave the role on **Triage nurse** and click
**Start shift**. Pick a theme before you start rather than mid-take: the
console and the product site share one palette and both follow the toggle in
the rail, so switching on camera restyles everything at once.

> "A nurse signs in with her badge, and the badge is not decoration. It signs
> every level she sets for the rest of the shift. Sign in as a medical
> assistant instead and the board still takes your vitals, but the acuity
> controls are disabled: scope enforced in software, not in a policy
> document."

## 0:32 - 0:55 | Open the shift, watch the board fill

Action: click **Normal shift**. Arrivals start on their own and the department
clock starts running; let five or six patients land, then hit **Pause** in the
status bar if you want to talk over a still board.

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

## 0:55 - 1:30 | The ambiguous case: escalate under uncertainty

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

Action: with A. Weber still selected, open **Pipeline** in the rail. Hold for
about eight seconds.

> "This is that decision taken apart, for this patient, with the time each
> stage actually took. Redaction runs first and lists what it removed. Then
> the two paths run concurrently, and only one of them is outside the
> boundary: the reasoning path is the single component in this system that
> sends anything off the machine, and it has only ever seen the de-identified
> copy. They rejoin at fusion, and the whole thing is milliseconds."

## 1:30 - 2:00 | The novel loop: the waiting room watches back

Action: open **Monitoring** in the rail and point at the priority column. The
clock is already running live; let it run while you talk. Wait for R.
Castillo's deterioration alert to fire on its own.

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

## 2:00 - 2:28 | The nurse answers, and the system records it

Action: click **Reassess** on the alert. Then open R. Castillo, click
**Override level**, try to confirm with no reason (the button stays disabled),
pick ESI-1, tap the **Vitals trending** quick reason and add "septic shock
picture, starting fluids", confirm. Open the audit trail at the foot of the
record.

> "Answering an alert is one click. Reassess records that a clinician actually
> laid eyes on the patient, restarts the safe wait clock, and is logged with
> their ID. The close button beside it is not a dismiss: it calls the same
> acknowledge endpoint, so the row leaves the board because the record says a
> clinician saw it, and the patient deliberately stays overdue. An
> acknowledgment that quietly cleared the queue would make the board look safe
> without making it safe."

Optional, if you have the seconds: hover the close button and read the tooltip
on camera. It says exactly that.

> "An override legally has to record who, what, when and why. The form does
> not submit without a reason, and every one of these lands in an append-only
> audit trail you can read right here on the patient. Each override is also a
> reward signal: under-triage costs five times over-triage, and after repeated
> escalations the system starts escalating that pattern itself. The learned
> adjustment can only escalate, so learning cannot erode safety."
> [override logged]

## 2:28 - 2:42 | Surge

Action: open **Settings**, click **Force surge**, return to the queue and
step a few arrivals (or run
`uv run python ../scripts/replay_demo.py --speedup 3 --profile rural_100`).

> "At three times normal arrivals the load flips to SURGE and the system
> drops to the deterministic fast path: about four milliseconds a triage,
> monitoring still live. The reasoning pass is not dropped, it is queued, and
> it catches those patients up on the next tick. It can escalate them. It
> can never downgrade them."  [surge 3x]

## 2:42 - 2:57 | Evidence

Action: open **Analytics** in the rail.

> "This is not a slide. The console reads our benchmark results from the
> repository: on 216 held-out cases, under-triage of 1.4 percent against the
> rules engine's 37.5, zero significant under-triage, and every one of the
> sickest patients caught. Below it, live bias counters by age band and every
> clinician decision with a name attached. PHI is redacted by
> Microsoft Presidio before any model call, and the reasoning path can run
> entirely on-premises."

## 2:57 - 3:00 | Close

> "PatientTriage.ai. The system recommends. The clinician decides. And
> nobody deteriorates unseen in the waiting room."

## Recording checklist

- Backend and frontend running, board cleared, signed out (the sign-in screen)
- Cache warm (already done), so every step is instant
- Browser zoom 100%, hide the bookmarks bar, 1600x1000 window
- Widen the patient record by dragging its left edge before you start; it
  remembers the width, so the two reasoning chains sit side by side on camera
- The shift starts running the moment you open it: arrivals play through and
  the department clock advances, so the deterioration alert fires while you are
  talking. If you need it sooner, Settings has **Advance 15 min**. **Pause** in
  the status bar stops arrivals without clearing the board
- macOS: Cmd+Shift+5, record the selected window, mic on for narration or dub
  afterwards
- Export mp4, named per the Unstop convention if one is required
