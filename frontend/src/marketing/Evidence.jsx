import { CtaBand } from './Shell'

export default function Evidence() {
  return (
    <>
      <header className="page-hero">
        <div className="wrap">
          <div className="eyebrow">Evidence</div>
          <h1>We benchmark on other people's test sets,<br />with their metrics.</h1>
          <p className="lede">
            Two published systems define the state of the art in AI triage. We evaluate on
            the exact case sets they used, report the same metrics, and publish every raw
            prediction. Every number below reproduces with one command.
          </p>
        </div>
      </header>

      <section>
        <div className="wrap">
          <div className="eyebrow">Benchmark 1</div>
          <h2 className="section-title">216-case public clinical triage benchmark (EMNLP 2024)</h2>
          <table className="ev-table">
            <thead>
              <tr><th>System</th><th>Exact</th><th>Under-triage</th><th>Significant under-triage</th><th>High-acuity sensitivity</th></tr>
            </thead>
            <tbody>
              <tr className="us"><td>PatientTriage.ai fused (Claude Sonnet 5)</td><td>71.3%</td><td className="good">1.4%</td><td className="good">0.0%</td><td className="good">100%</td></tr>
              <tr><td>TriageAgent + GPT-4 (published SOTA)</td><td>81.0%</td><td>2.3%</td><td>2.8%</td><td>n/a</td></tr>
              <tr><td>Human experts (published)</td><td>68.6%</td><td>12.8%</td><td>8.6%</td><td>n/a</td></tr>
              <tr><td>PatientTriage.ai fused (Claude Haiku 4.5, budget)</td><td>61.1%</td><td>2.8%</td><td>0.0%</td><td>100%</td></tr>
              <tr><td>AI reasoning path alone (no fusion)</td><td>76.9%</td><td>8.8%</td><td>0.0%</td><td>96.0%</td></tr>
              <tr><td>Rules engine alone (no AI)</td><td>31.0%</td><td>43.1%</td><td>22.7%</td><td>51.0%</td></tr>
            </tbody>
          </table>
          <div className="prose" style={{ marginTop: 26 }}>
            <p>
              <b>How to read this.</b> Under-triage, assigning a patient less urgency than
              their true condition, is the error that harms people; over-triage costs
              efficiency. The fused system beats the published state of the art on
              under-triage (1.4% vs 2.3%) and on significant under-triage (0.0% vs 2.8%),
              catches 100% of critical (ESI 1-2) patients, and exceeds the published
              human-expert accuracy.
            </p>
            <p>
              <b>The fusion is doing the safety work.</b> The AI path alone under-triages
              8.8%. Fusing it with the deterministic rules floor cuts that to 1.4%, a
              six-fold safety improvement, at a measured cost of 5.6 points of exact accuracy
              and an over-triage rate of 27.3% versus SOTA's 17.1%. That trade is deliberate,
              tunable per site, and disclosed.
            </p>
          </div>
        </div>
      </section>

      <section className="tight" style={{ background: 'var(--tint)' }}>
        <div className="wrap">
          <div className="eyebrow">Benchmark 2</div>
          <h2 className="section-title">ESI Handbook 60-case set (the ED-Triage-Agent protocol)</h2>
          <div className="prose" style={{ marginTop: 22 }}>
            <p>
              On the 60 narrative teaching cases from the ESI Implementation Handbook, our
              fused system holds 0.0% significant under-triage and 100% high-acuity
              sensitivity, with 51.7% exact accuracy. The published ED-Triage-Agent pipeline
              reports 80% exact accuracy here; its two-phase structured interview is tuned
              for these teaching narratives, and we say so. On the larger public benchmark
              above, our single-pass system closes most of that gap while remaining safer.
            </p>
            <p>
              <b>Hospital-local configuration, measured honestly.</b> The same pipeline
              running Doctor-R1 (an open, RL-trained 8B clinical model, 4-bit quantized on a
              laptop) reaches 33.3% exact and 73.1% high-acuity sensitivity standalone; the
              fused safety floor holds 0.0% significant under-triage on top of it. The
              privacy option is real, and so is its measured quality gap.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Reproduce it</div>
          <h2 className="section-title">One command per table row</h2>
          <div className="prose" style={{ marginTop: 22 }}>
            <div className="callout mono">
              uv run python ../eval/run_eval.py --sets test_1 test_2 test_3<br />
              uv run python ../eval/run_eval.py --sets practice_cases competency_cases<br />
              uv run python ../eval/run_eval.py --sets practice_cases competency_cases --local-url http://localhost:8080/v1
            </div>
            <p>
              The harness stores metrics and every raw prediction under <b>eval/results/</b>.
              Benchmark cases are fetched from their MIT-licensed source repositories at
              setup; nothing is redistributed.
            </p>
            <h3>Sources</h3>
            <ul>
              <li>TriageAgent: multi-agent collaboration for LLM-based clinical triage. EMNLP 2024 Findings. Public benchmark and the human-expert baseline.</li>
              <li>ED-Triage-Agent: human-AI collaborative emergency triage. medRxiv, 2026. The 60-case evaluation protocol.</li>
              <li>Doctor-R1: experiential agentic reinforcement learning for clinical inquiry. ICLR 2026. The hospital-local model.</li>
              <li>NEJM AI study across 174,648 ED visits: AI-assisted triage cut time-to-care by 33% and improved critical-care identification from 78.8% to 83.1%. The scale of the opportunity.</li>
            </ul>
          </div>
        </div>
      </section>

      <CtaBand title="Skeptical? Good. Bring the hardest questions to the demo." />
    </>
  )
}
