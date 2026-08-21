import { Link } from 'react-router-dom'
import { CtaBand } from './Shell'

export default function About() {
  return (
    <>
      <header className="page-hero">
        <div className="wrap">
          <div className="eyebrow">About</div>
          <h1>Two students, one conviction:<br />the waiting room is part of triage.</h1>
          <p className="lede">Team NamoFans, IIT Kharagpur. Built for the Accenture Innovation Challenge 2026.</p>
        </div>
      </header>

      <section>
        <div className="wrap">
          <div className="eyebrow">Team</div>
          <div className="phases" style={{ marginTop: 32, gridTemplateColumns: '1fr 1fr', maxWidth: 720 }}>
            <div className="phase-card">
              <div className="phase-num">TEAM LEADER</div>
              <h3>Monika Kumari</h3>
              <p>IIT Kharagpur</p>
            </div>
            <div className="phase-card">
              <div className="phase-num">MEMBER</div>
              <h3>Animesh Raj</h3>
              <p>IIT Kharagpur</p>
            </div>
          </div>
        </div>
      </section>

      <section className="tight" style={{ background: 'var(--tint)' }}>
        <div className="wrap prose">
          <div className="eyebrow">The story</div>
          <h2 className="section-title">From a gap in the literature to a working system</h2>
          <p style={{ marginTop: 18 }}>
            Round 1 started with a literature sweep: every published AI triage system,
            including the strongest academic work, scores a patient once and stops. The
            clinical literature was simultaneously calling for continuous reassessment, and
            nobody had shipped it. We pitched the waiting-room monitor as our core idea; the
            Round 2 brief then asked every team to build exactly that. We had a head start we
            intend to keep.
          </p>
          <p>
            The prototype went from empty repository to benchmarked system in under a week: a
            deterministic ESI rules engine with age-banded thresholds, a clinical reasoning
            path grounded in the ESI Handbook, a fusion layer that treats disagreement as
            clinical signal, the reassessment loop, an audit trail, a learning loop fed by
            clinician overrides, and this console. Then we benchmarked it against the
            published state of the art, on their test sets, and published every number
            including the unflattering ones.
          </p>
          <h3>What's next</h3>
          <ul>
            <li><b>Scale evaluation:</b> replaying 440,000 real ED visits (MIMIC-IV-ED, credentialed access) through the pipeline, measuring caught deterioration against actual outcomes.</li>
            <li><b>Learning at depth:</b> policy optimization on accumulated override experience (GRPO, multi-axis clinical rewards), keeping the escalate-only safety constraint.</li>
            <li><b>Integration:</b> HL7/FHIR intake from EHR and monitor feeds, replacing the simulated data boundary.</li>
          </ul>
        </div>
      </section>

      <section id="demo">
        <div className="wrap">
          <div className="eyebrow">See it live</div>
          <h2 className="section-title">The demo runs on your laptop in about three minutes</h2>
          <div className="prose" style={{ marginTop: 22 }}>
            <div className="callout mono">
              git clone https://github.com/wildcraft958/patient-triage-ai<br />
              cd patient-triage-ai/backend &amp;&amp; uv sync &amp;&amp; uv run python ../scripts/fetch_data.py<br />
              uv run uvicorn app.main:app --port 8000 &nbsp;# terminal 1<br />
              cd frontend &amp;&amp; npm install &amp;&amp; npm run dev &nbsp;# terminal 2, then open localhost:5173
            </div>
            <p>
              Or, right here:{' '}
              <Link to="/console" style={{ color: 'var(--purple-deep)', fontWeight: 700 }}>
                launch the console
              </Link>{' '}
              and step through a replayed shift: 22 patients, an atypical cardiac
              presentation the rules alone would have seated in the waiting room, a sepsis
              trajectory caught by the monitor, an override that teaches the system, and a
              3x surge. It runs end to end even without an AI key, in rules-only mode.
            </p>
            <p>
              Questions, issues, or a guided walkthrough: open an issue on the{' '}
              <a href="https://github.com/wildcraft958/patient-triage-ai"
                 style={{ color: 'var(--purple-deep)', fontWeight: 700 }}>
                GitHub repository
              </a>.
            </p>
          </div>
        </div>
      </section>

      <CtaBand
        title="Reinvent with AI. Keep humans in the lead."
        sub="That was the challenge. This is our answer."
        showConsole={true}
      />
    </>
  )
}
