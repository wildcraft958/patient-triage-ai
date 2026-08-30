import { Link } from 'react-router-dom'
import { CtaBand } from './Shell'

export default function Product() {
  return (
    <>
      <header className="page-hero">
        <div className="wrap">
          <div className="eyebrow">Product</div>
          <h1>One console. Two engines.<br />A waiting room that talks back.</h1>
          <p className="lede">
            Everything below is running software, demonstrated on a replayed emergency
            department timeline. Nothing on this page is a mockup:{' '}
            <Link to="/console" style={{ color: 'var(--purple-deep)', fontWeight: 700 }}>launch it yourself</Link>.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap">
          <div className="split">
            <div>
              <div className="eyebrow">The nurse console</div>
              <h3>Every recommendation shows its work</h3>
              <p>
                Each patient card carries the triage level, the route, a confidence rating,
                and both reasoning chains: the deterministic rules trace and the clinical AI
                narrative. When the two engines disagree, the card says so, plainly, and
                takes the more acute level while flagging your clinician.
              </p>
              <ul>
                <li><b>Accept</b> is one click; it also tells the learning loop the system got it right.</li>
                <li><b>Override</b> is one form: new level, clinician ID, and a reason, which becomes the legal audit record.</li>
              </ul>
            </div>
            <div className="hero-shot" style={{ marginTop: 0 }}>
              <div className="shot-bar"><i /><i /><i /></div>
              <img src="/dashboard.png" alt="Nurse console with dual reasoning chains and reassessment queue" />
            </div>
          </div>
        </div>
      </section>

      <section className="tight" style={{ background: 'var(--tint)' }}>
        <div className="wrap">
          <div className="eyebrow">The reassessment queue</div>
          <h2 className="section-title">Who should the nurse check on next?</h2>
          <div className="split" style={{ marginTop: 32 }}>
            <div>
              <p>Every waiting patient carries a live priority score:</p>
              <div className="callout">
                <b>priority = deterioration risk &times; wait pressure &times; uncertainty &times; severity</b>
              </div>
              <p>
                Deterioration risk reads the vitals trajectory: rising heart rate, falling
                blood pressure or oxygen, climbing temperature, plus the complaint's own risk
                profile. Wait pressure compares time since last assessment against your
                per-level safe limits. Uncertainty rises when the engines disagreed. Severity
                weights the sickest first.
              </p>
            </div>
            <div>
              <p>Two hard triggers fire regardless of the score, because some rules should never be probabilistic:</p>
              <ul>
                <li><b>Wait-limit breach.</b> An ESI-2 patient past 10 minutes, an ESI-3 past 30: the console demands a re-assessment.</li>
                <li><b>Worsening vitals.</b> A recheck that deteriorates past thresholds, or enters the age-banded danger zone, triggers an automatic full re-triage. The result may hold or escalate the level. It may never lower it.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">The learning loop</div>
          <h2 className="section-title">Your clinicians train it just by doing their jobs</h2>
          <div className="split" style={{ marginTop: 32 }}>
            <div>
              <p>
                Every accept and every override becomes a reward signal, weighted the way an
                emergency department actually experiences error: a missed critical patient
                costs five times an over-cautious call.
              </p>
              <p style={{ marginTop: 12 }}>
                When clinicians repeatedly escalate a pattern, say, abdominal pain in
                geriatric patients, the system learns to escalate that pattern at triage time
                and says so on the card.
              </p>
            </div>
            <div>
              <div className="callout">
                <b>The safety catch:</b> learned adjustments can only ever move a patient
                toward more urgency. Reinforcement cannot teach this system to downgrade
                anyone. That constraint is structural, not a policy.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="tight" style={{ borderTop: '1px solid var(--mk-line)' }}>
        <div className="wrap">
          <div className="eyebrow">Under the hood</div>
          <h2 className="section-title">Boring where it should be boring</h2>
          <table className="ev-table">
            <thead><tr><th>Layer</th><th>Technology</th><th>Why</th></tr></thead>
            <tbody>
              <tr><td>Rules engine</td><td>Deterministic ESI v4, age-banded</td><td>Auditable, millisecond-fast, cannot hallucinate</td></tr>
              <tr><td>Clinical reasoning</td><td>Claude (AWS Bedrock) or an open local model</td><td>Context the rules cannot encode; pluggable per deployment</td></tr>
              <tr><td>Grounding</td><td>ESI Handbook retrieval, page-cited</td><td>Every AI claim traceable to the manual your nurses trained on</td></tr>
              <tr><td>Orchestration</td><td>LangGraph parallel fan-out</td><td>Both engines run concurrently; neither waits on the other</td></tr>
              <tr><td>Privacy</td><td>Microsoft Presidio</td><td>PHI redacted before any model call, every log entry</td></tr>
              <tr><td>Audit &amp; state</td><td>DuckDB, append-only</td><td>A record your compliance office can replay</td></tr>
              <tr><td>Console</td><td>React</td><td>Fast, familiar, keyboard-light for gloved hands</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <CtaBand title="Twenty minutes. Your questions, our replay." />
    </>
  )
}
