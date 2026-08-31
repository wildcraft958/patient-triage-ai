import { Link } from 'react-router-dom'
import HeroPipeline from './HeroPipeline'
import HeroQueue from './HeroQueue'
import { CtaBand } from './Shell'

const ROLES = [
  ['Triage nurse', 'Owns the acuity level. Their badge signs every one.'],
  ['Medical assistant', 'Records vitals and answers alerts. Cannot set a level.'],
  ['Clinical administrator', 'Reads the board, owns the evidence. Touches no patient.'],
]

const GOVERNANCE = [
  ['PHI never leaves un-redacted', 'Presidio strips identifiers before any model call or log write.'],
  ['Audit-ready by design', 'Append-only: both chains, every override, with clinician and reason.'],
  ['The clinician decides', 'The system never finalises a level and never blocks a patient.'],
  ['Bias, monitored', 'Per-age-band decision statistics, with age-calibrated thresholds.'],
]

export default function Home() {
  return (
    <>
      <header className="hero">
        <div className="wrap">
          <div className="eyebrow">Emergency Department Intelligence</div>
          <h1>Triage that doesn't stop<br />at the front desk.</h1>
          <p className="lede">
            Two engines score every arrival. Then the waiting room stays watched.
          </p>
          <div className="hero-ctas">
            <Link className="btn btn-primary" to="/signin">Launch the console<span className="arr">&rsaquo;</span></Link>
            <Link className="btn btn-outline" to="/evidence">See the evidence</Link>
          </div>
          <HeroQueue />
        </div>
      </header>

      <section className="band-dark">
        <div className="wrap">
          <div className="eyebrow">The problem your ED lives with</div>
          <h2 className="section-title">Triage is a snapshot. Patients keep changing after it's taken.</h2>
          <div className="stat-grid">
            <div className="stat-big">
              <div className="num">~8<small>%</small></div>
              <div className="lbl">added mortality per hour of delayed treatment in sepsis</div>
            </div>
            <div className="stat-big">
              <div className="num">12.8<small>%</small></div>
              <div className="lbl">of patients under-triaged by human experts on a published benchmark</div>
            </div>
            <div className="stat-big">
              <div className="num">0</div>
              <div className="lbl">published triage systems that re-examine the waiting room. Until this one.</div>
            </div>
          </div>
          <div className="src">
            Sources: Kumar et al. (septic shock); TriageAgent, EMNLP 2024 Findings (human
            expert baseline); ED-Triage-Agent, medRxiv 2026.
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">How one triage is produced</div>
          <h2 className="section-title">Two paths. Only one of them ever leaves the building.</h2>
          <HeroPipeline />
          <p className="ev-note">
            Uncertainty never downgrades a patient: when the paths disagree the system
            takes the more acute level, and re-triage while someone waits can only hold
            or escalate.
          </p>
        </div>
      </section>

      <section className="tight" style={{ background: 'var(--tint)' }}>
        <div className="wrap">
          <div className="split">
            <div>
              <div className="eyebrow">Built for your nurses, not around them</div>
              <h3>A console that earns trust instead of demanding it</h3>
              <ul>
                <li><b>Passive by default.</b> The queue re-ranks quietly. Hard alerts are reserved for breaches and deterioration.</li>
                <li><b>Both chains, always visible.</b> Your team sees where the system is unsure, and why.</li>
                <li><b>One-click accept, one-form override.</b> The reason doubles as the legal record.</li>
                <li><b>Overrides teach it.</b> And the learning can only make it more cautious, never less.</li>
              </ul>
            </div>
            <div>
              <div className="eyebrow">During a surge</div>
              <h3>3x the arrivals, 4 milliseconds a triage</h3>
              <p>
                Past your threshold, scoring flips to the deterministic fast path and the
                reasoning pass becomes asynchronous enrichment instead of a bottleneck.
                Monitoring keeps running. Verified in replay at three times normal rate.
              </p>
              <p style={{ marginTop: 12 }}>
                Wait limits, cadence and surge thresholds live in one file per site, so the
                same platform fits a 100-visit rural ED and a 500-visit trauma center.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="tight">
        <div className="wrap">
          <div className="eyebrow">Who signs in</div>
          <h2 className="section-title">Scope enforced in software, not in a policy document.</h2>
          <div className="role-strip">
            {ROLES.map(([title, body]) => (
              <div key={title}>
                <h4>{title}</h4>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Measured, not promised</div>
          <h2 className="section-title">Benchmarked against published state of the art, on their test sets</h2>
          <table className="ev-table">
            <thead>
              <tr><th>System</th><th>Exact accuracy</th><th>Under-triage</th><th>Significant under-triage</th><th>Critical patients caught</th></tr>
            </thead>
            <tbody>
              <tr className="us"><td>PatientTriage.ai (fused)</td><td>71.3%</td><td className="good">1.4%</td><td className="good">0.0%</td><td className="good">100%</td></tr>
              <tr><td>Published SOTA (GPT-4 multi-agent)</td><td>81.0%</td><td>2.3%</td><td>2.8%</td><td>n/a</td></tr>
              <tr><td>Human experts (same benchmark)</td><td>68.6%</td><td>12.8%</td><td>8.6%</td><td>n/a</td></tr>
            </tbody>
          </table>
          <p className="ev-note">
            216-case public clinical triage benchmark (EMNLP 2024). Under-triage, assigning
            less urgency than a patient's true acuity, is the error that harms patients; we
            tune for it deliberately and publish the over-triage cost alongside.
          </p>
          <div className="hero-ctas">
            <Link className="btn btn-outline" to="/evidence">Full evidence &amp; methodology<span className="arr">&rsaquo;</span></Link>
          </div>
        </div>
      </section>

      <section className="tight" style={{ borderTop: '1px solid var(--mk-line)' }}>
        <div className="wrap">
          <div className="eyebrow">Governance your compliance office will sign</div>
          <div className="pillars">
            {GOVERNANCE.map(([title, body]) => (
              <div className="pillar" key={title}>
                <h4>{title}</h4>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Deployment</div>
          <h2 className="section-title">Cloud when you want scale. On-premises when you want walls.</h2>
          <div className="deploy">
            <div className="deploy-card">
              <div className="sub">Managed cloud</div>
              <h3>Claude on AWS Bedrock</h3>
              <p>Frontier reasoning with enterprise controls, regional residency, and caching that keeps cost per patient in fractions of a cent.</p>
            </div>
            <div className="deploy-card dark">
              <div className="sub">Hospital-local</div>
              <h3>Open model, your hardware</h3>
              <p>The same pipeline against an RL-trained clinical model inside your network. Nothing crosses your boundary. The safety floor holds either way.</p>
            </div>
          </div>
          <div className="hero-ctas" style={{ marginTop: 30 }}>
            <Link className="btn btn-outline" to="/deploy">
              Deployment models and what a pilot measures<span className="arr">&rsaquo;</span>
            </Link>
          </div>
        </div>
      </section>

      <CtaBand
        title="See your own waiting room the way the system sees it."
        sub="Step through a replayed shift: arrivals, an atypical cardiac presentation, a deterioration catch, an override, and a 3x surge."
      />
    </>
  )
}
