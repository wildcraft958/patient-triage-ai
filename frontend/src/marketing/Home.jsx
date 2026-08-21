import { Link } from 'react-router-dom'
import { CtaBand } from './Shell'

export default function Home() {
  return (
    <>
      <header className="hero">
        <div className="wrap">
          <div className="eyebrow">Emergency Department Intelligence</div>
          <h1>Triage that doesn't stop<br />at the front desk.</h1>
          <p className="lede">
            Every arriving patient is scored by two independent engines. Every waiting
            patient is watched continuously. Your clinicians stay in command of every
            decision, with the evidence in front of them.
          </p>
          <div className="hero-ctas">
            <Link className="btn btn-primary" to="/console">Launch the console<span className="arr">&rsaquo;</span></Link>
            <Link className="btn btn-outline" to="/evidence">See the evidence</Link>
          </div>
          <div className="hero-shot">
            <div className="shot-bar"><i /><i /><i /></div>
            <img src="/dashboard.png" alt="The PatientTriage.ai nurse console: dual reasoning chains, confidence on every score, and a live reassessment queue" />
          </div>
        </div>
      </header>

      <section className="band-dark">
        <div className="wrap">
          <div className="eyebrow">The problem your ED lives with</div>
          <h2 className="section-title">Triage today is a snapshot. Patients keep changing after it's taken.</h2>
          <div className="stat-grid">
            <div className="stat-big">
              <div className="num">~8<small>%</small></div>
              <div className="lbl">added mortality for every hour of delayed treatment in sepsis</div>
            </div>
            <div className="stat-big">
              <div className="num">12.8<small>%</small></div>
              <div className="lbl">of patients are under-triaged by human experts on a published benchmark</div>
            </div>
            <div className="stat-big">
              <div className="num">0</div>
              <div className="lbl">published triage systems that systematically re-examine the waiting room. Until this one.</div>
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
          <div className="eyebrow">How it works</div>
          <h2 className="section-title">Three phases. One promise: nobody deteriorates unseen.</h2>
          <div className="phases">
            <div className="phase-card">
              <div className="phase-num">PHASE 01</div>
              <h3>Intake, first minutes only</h3>
              <p>
                Chief complaint, vitals, age, and whatever history exists. Designed for the
                reality that half of arriving patients have no record on file. Identifying
                details are redacted before any AI model sees them.
              </p>
              <span className="phase-tag">WORKS WITH ZERO HISTORY</span>
            </div>
            <div className="phase-card">
              <div className="phase-num">PHASE 02</div>
              <h3>Two engines, one recommendation</h3>
              <p>
                A deterministic ESI rules engine with age-banded thresholds runs in parallel
                with clinical AI reasoning grounded in the ESI Handbook. Agreement means high
                confidence. Disagreement takes the more acute level and flags your clinician,
                with both reasoning chains visible.
              </p>
              <span className="phase-tag">UNCERTAINTY NEVER DOWNGRADES</span>
            </div>
            <div className="phase-card featured">
              <div className="phase-num">PHASE 03</div>
              <h3>The waiting room, watched</h3>
              <p>
                Every waiting patient is ranked continuously by deterioration risk, wait
                pressure, uncertainty, and severity. Wait-limit breaches and worsening vitals
                trigger automatic re-assessment. This is the phase nobody else has.
              </p>
              <span className="phase-tag">CONTINUOUS REASSESSMENT</span>
            </div>
          </div>
        </div>
      </section>

      <section className="tight" style={{ background: 'var(--tint)' }}>
        <div className="wrap">
          <div className="split">
            <div>
              <div className="eyebrow">Built for your nurses, not around them</div>
              <h3>A console that earns trust instead of demanding it</h3>
              <ul>
                <li><b>Passive by default.</b> The queue re-ranks quietly; hard alerts are reserved for wait breaches and deterioration.</li>
                <li><b>Both reasoning chains, always visible.</b> Your team sees exactly where the system is unsure, and why.</li>
                <li><b>One-click accept, one-form override.</b> The override reason doubles as the legal record. No extra paperwork.</li>
                <li><b>Overrides teach the system.</b> Clinician corrections become learning signals, and the learning can only make the system more cautious, never less.</li>
              </ul>
            </div>
            <div>
              <div className="eyebrow">During a surge</div>
              <h3>3x the arrivals, 4 milliseconds a triage</h3>
              <p>
                When volume crosses your threshold, scoring flips automatically to the
                deterministic fast path. Monitoring keeps running. The AI reasoning becomes
                asynchronous enrichment instead of a bottleneck. Verified in replay at three
                times normal arrival rate.
              </p>
              <p style={{ marginTop: 12 }}>
                Wait limits, cadence, and surge thresholds live in one configuration file per
                site, so the same platform fits a 100-visit rural ED and a 500-visit urban
                trauma center.
              </p>
            </div>
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
            <div className="pillar">
              <h4>PHI never leaves un-redacted</h4>
              <p>Microsoft Presidio strips names, numbers, and identifiers before any model call and every log entry.</p>
            </div>
            <div className="pillar">
              <h4>Audit-ready by design</h4>
              <p>Append-only trail of every recommendation, both reasoning chains, and every override with clinician, timestamp, and reason.</p>
            </div>
            <div className="pillar">
              <h4>The clinician decides. Always.</h4>
              <p>The system never finalizes a triage level, never blocks a patient, never overrides your staff. Structurally.</p>
            </div>
            <div className="pillar">
              <h4>Bias, monitored</h4>
              <p>Per-age-band decision statistics surface skew before it becomes a pattern, with age-calibrated thresholds from day one.</p>
            </div>
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
              <p>Frontier reasoning quality with enterprise cloud controls, regional data residency, and response caching that keeps per-patient cost in fractions of a cent.</p>
            </div>
            <div className="deploy-card dark">
              <div className="sub">Hospital-local</div>
              <h3>Open model, your hardware</h3>
              <p>The same pipeline runs against an open, RL-trained clinical model served inside your network. Patient data never crosses your boundary. Quality trade-offs measured and published, and the safety floor holds either way.</p>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="See your own waiting room the way the system sees it."
        sub="Launch the live console and step through a replayed shift: arrivals, an atypical cardiac presentation, a deterioration catch, an override, and a 3x surge."
      />
    </>
  )
}
