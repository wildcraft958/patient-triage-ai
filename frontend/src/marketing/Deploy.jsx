import { Link } from 'react-router-dom'
import { CtaBand } from './Shell'

export default function Deploy() {
  return (
    <>
      <header className="page-hero">
        <div className="wrap">
          <div className="eyebrow">Deployment</div>
          <h1>One container, three ways to run it.</h1>
          <p className="lede">
            The whole system ships as a single image: the console, the API, the rules
            engine, the monitor, the audit database and the reasoning cache. What
            changes between deployments is where the reasoning model lives and how
            much of your network the container is allowed to see.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap">
          <div className="eyebrow">Models</div>
          <h2 className="section-title">Pick the boundary your compliance office is comfortable with.</h2>
          <div className="phases">
            <div className="phase-card">
              <div className="phase-num">MODEL 01</div>
              <h3>Managed cloud</h3>
              <p>
                The container runs in your cloud account and calls a frontier reasoning
                model through your own enterprise endpoint, with regional data residency
                and a response cache that keeps the cost per patient in fractions of a cent.
                Fastest to stand up.
              </p>
              <span className="phase-tag">DE-IDENTIFIED EGRESS ONLY</span>
            </div>
            <div className="phase-card featured">
              <div className="phase-num">MODEL 02</div>
              <h3>Hospital VPC</h3>
              <p>
                The same image inside your network, calling an open clinical model you host.
                Nothing leaves your boundary at all. Reasoning quality trades down against
                the frontier model; the deterministic safety floor is identical either way,
                because it is the same rules engine.
              </p>
              <span className="phase-tag">NOTHING CROSSES THE BOUNDARY</span>
            </div>
            <div className="phase-card">
              <div className="phase-num">MODEL 03</div>
              <h3>Air-gapped, rules only</h3>
              <p>
                No reasoning path, no outbound network, no model to host. The ESI rules
                engine, the waiting-room monitor, the audit trail and the console all run
                unchanged, and every recommendation says on its face that it came from one
                path rather than two.
              </p>
              <span className="phase-tag">DEGRADES LOUDLY, NEVER SILENTLY</span>
            </div>
          </div>
        </div>
      </section>

      <section className="tight" style={{ background: 'var(--tint)' }}>
        <div className="wrap">
          <div className="split">
            <div>
              <div className="eyebrow">Configuration</div>
              <h3>One YAML file per site, not one fork per site</h3>
              <p>
                Safe wait limits per acuity level, reassessment cadence, surge threshold,
                treatment bay capacity and deterioration sensitivity are all department
                configuration. A rural emergency department and a 500-visit trauma center
                run the same build with different files, and the console shows a hospital
                its own thresholds on the settings screen so nobody has to trust a diagram.
              </p>
              <div className="callout mono">
                max_wait_min: &#123; 2: 10, 3: 30, 4: 60, 5: 120 &#125;<br />
                surge_queue_threshold: 40<br />
                treatment_bays: 18<br />
                deterioration: &#123; hr_rise_pct: 15, spo2_drop_points: 3 &#125;
              </div>
            </div>
            <div>
              <div className="eyebrow">Integration</div>
              <h3>Meets your EHR where it already is</h3>
              <ul>
                <li><b>FHIR out today.</b> Every triage exports as a de-identified FHIR bundle, so the record your EHR receives carries the level and the reasoning without carrying the patient.</li>
                <li><b>Three observation channels.</b> Nurse spot-check, wearable stream and kiosk self-report all update the same acuity belief through one endpoint.</li>
                <li><b>Identity through your directory.</b> The console signs every decision with a badge ID; binding that to SAML or OIDC is the first integration a deployment does.</li>
                <li><b>Append-only audit.</b> The trail survives restarts and is queryable outside the application, because a compliance office should never have to ask the system about itself.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Pilot</div>
          <h2 className="section-title">What a first ninety days should measure.</h2>
          <div className="pillars">
            <div className="pillar">
              <h4>Under-triage rate</h4>
              <p>Patients scored less acute than they turned out to be. The only error class that harms people, and the number the whole system is tuned against.</p>
            </div>
            <div className="pillar">
              <h4>Time to reassessment</h4>
              <p>How long a deteriorating patient waits before someone looks again. This is the gap the monitoring phase exists to close.</p>
            </div>
            <div className="pillar">
              <h4>Override rate and direction</h4>
              <p>How often clinicians disagree, and which way. A healthy pilot sees overrides fall as the calibration table learns your department.</p>
            </div>
            <div className="pillar">
              <h4>Acuity by demographic band</h4>
              <p>Whether any group drifts away from the others. Published on the console from day one rather than audited after a complaint.</p>
            </div>
          </div>
          <p className="ev-note">
            Every one of these is already on the analytics screen of the running console,
            computed from the audit trail rather than reported separately, so a pilot
            reads its own numbers instead of waiting for ours.
          </p>
          <div className="hero-ctas">
            <Link className="btn btn-outline" to="/evidence">
              Benchmark methodology<span className="arr">&rsaquo;</span>
            </Link>
            <Link className="btn btn-outline" to="/security">
              Security and governance<span className="arr">&rsaquo;</span>
            </Link>
          </div>
        </div>
      </section>

      <CtaBand
        title="Run it before you plan it."
        sub="The console is live. Open a shift, work the board, then read the audit trail that your decisions just wrote."
      />
    </>
  )
}
