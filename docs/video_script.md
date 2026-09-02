# Demo video script

**Target 5:48.** The mail sets no limit on length, but it caps the file at
20 MB, and that is the real constraint. The timings on each section below are
measured from this script's own word count, at the pace of our last take
(154 words a minute, pauses included). So they should hold.

**Encode it at about 400 kbps, not higher.** At 5:48 that lands near 17 MB and
leaves headroom. Our last take used 452 kbps and came out 17.7 MB at 5:13, so
a longer video at the same bitrate would breach the cap. Two-pass x264 with
`-tune stillimage` holds the text sharp at this bitrate, because a console
screen is mostly static:

```
ffmpeg -y -i take.mov -c:v libx264 -preset slow -tune stillimage \
       -b:v 400k -pass 1 -an -f mp4 /dev/null
ffmpeg -y -i take.mov -c:v libx264 -preset slow -tune stillimage \
       -b:v 400k -pass 2 -c:a aac -b:a 96k NamoFans_IITKharagpur.mp4
```

**How to use this page.** Every section has three parts:

- `[square brackets]` are screen cues. What to click, where to point, when to
  wait. Do not read these out.
- `SAY:` is your narration. One idea per line. Say a line, breathe, say the
  next one. If you fumble, just repeat the line and cut it in editing.
- `NOTE:` is for us, not for the video. It tracks which Round 2 requirement
  the section covers.

Record the console at 1600x1000. One take per section is fine. All seven
requirements are covered by the end:
`[15-20 records] [ambiguous] [pediatric/geriatric] [zero-history] [surge 3x]
[confidence always] [override logged]`

---

## 0:00 - 0:25 | The problem

[Start on the sign-in screen, or put a slide here. No clicking yet.]

SAY:

    Today, triage happens only once.
    A patient arrives, gets a score, and that is it.
    After that, nobody checks on them again.
    But patients get worse while they wait.
    In sepsis, every hour of delay raises the risk of death by about eight percent.
    We built PatientTriage dot AI.
    It scores every patient two separate ways.
    Then it keeps watching the whole waiting room.

## 0:25 - 0:57 | Sign in, and one honest note

[Leave the role on "Triage nurse". Click "Start shift".]

SAY:

    Let me sign in as a triage nurse.
    This badge is not just for show.
    It signs every decision I make this shift.
    Sign in as a medical assistant instead, and the acuity controls are disabled.
    That rule lives in the software, not in a policy document.
    One honest note before we start.
    Every patient here is simulated. There is no real patient data.
    These are twenty four cases we wrote ourselves.
    So you can see the whole flow properly, end to end.

## 0:57 - 1:45 | The board fills up

[Click "Normal shift". Let six or seven patients arrive on their own. Then
click "Pause" in the status bar so you can talk over a still board.]

SAY:

    This is a busy city emergency department.
    The clock is running. Patients are arriving on their own.
    Every arrival is scored two ways at once.
    First a rules engine. It checks vitals against age wise limits.
    Second, Claude reads the complaint and reasons about it.
    The board ranks everyone by how sick they are.
    Each row also shows a confidence value.
    Every score has one. There is no way to skip it.

[Point at N. Haddad, then at A. Okafor.]

    Now look at these two.
    This baby is twenty three days old. This child is three years old.
    Both came in with fever. Both score very differently.
    A baby's normal heart rate is not a child's normal heart rate.
    Also, half of these patients have no medical history at all.

NOTE: covers [15-20 records] [confidence always] [pediatric/geriatric] [zero-history]

## 1:45 - 2:36 | The hard case: when the two methods disagree

[Click the row for A. Weber.]

SAY:

    Now the interesting one.
    A. Weber is sixty six. He says it is just burning indigestion.
    The rules engine looked at his vitals and said ESI three.
    But Claude read the whole story.
    Burning chest pain. Nausea. Sweating. In a sixty six year old.
    That is a classic silent heart attack presentation.
    So Claude said ESI two.
    So the two methods disagree. What now?

[Point at the fusion line.]

    The system took the more serious level.
    It lowered its own confidence, and it flagged a clinician.
    This is our main safety rule.
    When we are not sure, we escalate. We never downgrade.
    Both chains are on screen, so you can read why each one decided.

[Point at the belief bars.]

    These bars are a probability spread over his true acuity.
    So the disagreement becomes a number, and it drives the next screen.

NOTE: covers [ambiguous] [pediatric/geriatric]

## 2:36 - 3:10 | The pipeline, opened up

[With A. Weber still selected, open "Pipeline" in the rail. Hold about eight
seconds so the animation finishes.]

SAY:

    This is that same decision, taken apart stage by stage.
    Redaction runs first. It strips personal details, and lists what it removed.
    Then the two paths run together.
    Only one of them leaves this machine. That is the Claude path.
    And it only ever sees the redacted copy.
    They join back at fusion.

[Point at the median figure and read the actual number aloud.]

    That timing is measured on this run, not printed on a slide.
    And the rules path never waits for the model.
    So even if the model is slow, or down, triage still happens.

## 3:10 - 3:57 | The waiting room watches back

[Open "Monitoring" in the rail. The clock is already running. Let it run while
you talk, and wait for R. Castillo's alert to fire on its own.]

SAY:

    Now the second half. This is the genuinely new part.
    The queue asks who is the sickest.
    This board asks a different question. Who should I check next?
    It ranks by deterioration risk, time since the last check, and uncertainty.

[Wait. When the alert band appears, point at it.]

    And there it is. I did not touch anything.
    R. Castillo came in with abdominal pain and chills.
    While he waited, his heart rate climbed seventeen percent.
    His fever rose too.
    The system noticed, re triaged him, and moved him to the top.
    Every number behind that is printed on the alert.
    This is the gap we are closing.
    Right now, that waiting hour is completely unwatched.
    And automatic re triage can only hold or escalate. It can never lower a level.

## 3:57 - 4:41 | The nurse decides, and the system records it

[Click "Reassess" on the alert row. Then open R. Castillo and click
"Override level". Try to confirm with no reason first, so the disabled button
shows on camera. Then pick ESI-1, tap the "Vitals trending" quick reason, type
"septic shock picture, starting fluids", and confirm.]

SAY:

    Answering an alert is one click.
    Reassess records that a clinician actually saw the patient.
    It restarts the safe wait clock, and it logs my ID.
    Now let me disagree with the system. I want ESI one.

[Point at the disabled confirm button.]

    See this. The confirm button will not submit.
    It needs a reason first.
    An override legally has to record who, what, when and why.
    So I pick vitals trending, and I type my own reason.

[Confirm, then scroll to the audit trail at the foot of the record.]

    And here is the full audit trail, right on the patient.
    It is append only. Nothing here can be edited later.
    This override is also a learning signal.
    But it can only ever escalate, so learning cannot erode safety.

NOTE: covers [override logged]

## 4:41 - 5:04 | Surge

[Open "Settings", click "Force surge", then go back to "Patient queue" and let
a few more arrivals land.]

SAY:

    Last test. What happens when the department floods?
    At three times the normal arrival rate, the system switches to a fast path.
    Only the rules engine scores. Monitoring stays fully live.
    But the Claude pass is not thrown away.
    It queues up, and catches those patients on the next tick.
    It can escalate them. It can never downgrade them.

NOTE: covers [surge 3x]

## 5:04 - 5:48 | The evidence, and close

[Open "Analytics" in the rail.]

SAY:

    Finally the numbers. And this is not a slide.
    The console reads our real benchmark results from the repository.
    Two hundred and sixteen held out cases.
    Under triage of one point four percent.
    The rules engine alone was thirty seven point five percent.
    Zero significant under triage, and every one of the sickest patients caught.
    Below that, live bias counters by age band.
    And every decision has a name on it.
    Personal data is redacted by Microsoft Presidio before any model call.
    And the reasoning path can run fully on premises.

[Hold on the board for a beat.]

    So that is PatientTriage dot AI.
    The system recommends. The clinician decides.
    And nobody gets worse unseen in the waiting room.
    Thank you.

---

## Before you hit record

- **Check the board is empty first.** Open the console and confirm it shows the
  shift picker, with no patients and the clock at zero. If the status bar shows
  a large average wait, the backend has been running a long time. Restart it
  and reload before you record.
- Backend on port 8000, frontend on port 5173, and you are signed out.
- The prompt cache is already warm, so every step is instant.
- Browser zoom at 100 percent. Hide the bookmarks bar. Window at 1600x1000.
- Drag the left edge of the patient record to widen it before you start. It
  remembers the width, so the two reasoning chains sit side by side on camera.
- The shift runs on its own once you open it. Arrivals play through and the
  clock advances, so R. Castillo's alert fires while you are still talking. If
  you need it sooner, Settings has **Advance 15 min**. **Pause** in the status
  bar stops arrivals without clearing the board.
- On macOS press Cmd+Shift+5 and record the selected window. Mic on for live
  narration, or record silent and dub afterwards.
- Export as mp4, keep it under 20 MB, and name it per the Unstop convention.
