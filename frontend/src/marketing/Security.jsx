import { CtaBand } from './Shell'

export default function Security() {
  return (
    <>
      <header className="page-hero">
        <div className="wrap">
          <div className="eyebrow">Security &amp; Governance</div>
          <h1>Written for the meeting where<br />your compliance officer is in the room.</h1>
          <p className="lede">
            Assumed jurisdiction: HIPAA (US). Every claim below is implemented in code you
            can read, not in a policy PDF.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap prose">
          <h3>PHI never leaves un-redacted</h3>
          <p>
            Free-text fields (chief complaints, notes) pass through Microsoft Presidio before
            any AI model call and before any log write. Names, phone numbers, addresses, and
            identifiers are stripped; clinical content passes untouched. This runs even on
            simulated data, because the pipeline is built as if every record were real.
          </p>

          <h3>An audit trail that can testify</h3>
          <p>
            Every recommendation is appended to an immutable log with both reasoning chains,
            the confidence, and the safety report. A clinician override cannot even be
            constructed without the five legally required fields:
          </p>
          <ul>
            <li>the original recommendation</li>
            <li>the new level</li>
            <li>the clinician identifier</li>
            <li>the timestamp</li>
            <li>a stated reason (the API rejects an override without one)</li>
          </ul>

          <h3>The NEVER list is structural</h3>
          <div className="callout">
            This system never assigns a final triage level, never blocks a patient from being
            seen, never overrides a clinician, and never routes a patient autonomously. Only
            a clinician action moves a patient to treatment. These are architectural
            properties, verified by tests, not configuration options someone can flip.
          </div>

          <h3>Escalation bias, everywhere uncertainty lives</h3>
          <p>
            Disagreement between engines takes the more acute level. Missing vitals escalate.
            Deterioration re-triage may only hold or escalate. The learning loop may only
            escalate. A grounding check independently enforces that no recommendation ever
            lands below the deterministic rules floor. The direction of every failure mode is
            toward caution.
          </p>

          <h3>Age-calibrated by design, bias-monitored in operation</h3>
          <p>
            Vital-sign thresholds are banded for infants, toddlers, children, adults, and
            geriatric patients, because a single adult-calibrated model across ages is a
            silent safety risk. In operation, per-age-band decision statistics are tracked
            continuously so systematic skew surfaces early.
          </p>

          <h3>Deployment boundaries you choose</h3>
          <p>
            Managed cloud (Claude on AWS Bedrock, regional residency) or fully on-premises
            with an open model served inside your network. In local mode, no patient data of
            any kind crosses your boundary. The quality trade-off between the two is measured
            and published on the Evidence page, not hand-waved.
          </p>

          <h3>Data used to build this prototype</h3>
          <p>
            No real patient data, anywhere. Twenty-two simulated patients written by the
            team; the open-access MIMIC-IV-ED demonstration subset (PhysioNet) for realism;
            MIT-licensed published benchmark cases for evaluation. Sources and licenses are
            documented in the repository.
          </p>
        </div>
      </section>

      <CtaBand title="Bring your CISO. We like those meetings." />
    </>
  )
}
