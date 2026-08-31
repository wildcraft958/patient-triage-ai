import { useEffect, useState } from 'react'
import { Branch, Node } from '../console/flow'
import { STEP, feed } from '../console/flowClock'

// How a triage is produced, drawn with the console's own flow chart engine so
// the site shows the graph the product actually runs rather than a second one
// that drifts from it. The console's version carries the measured milliseconds
// for one real patient; this one carries the shape.
//
// The shape is the argument. Two paths run concurrently and only one of them
// is outside the boundary, so the claim that nothing identifying leaves the
// building is visible in the geometry instead of asserted in a sentence.

const AT = {
  intake: 0,
  redact: STEP * 1.3,
  paths: STEP * 2.6,
  fuse: STEP * 4.2,
  audit: STEP * 5.2,
}
const RUN = AT.audit + 2600   // the last node's glow, then a beat before the next pass

export default function HeroPipeline() {
  const [dart, setDart] = useState(0)
  const still = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (still) return undefined
    const t = setInterval(() => setDart((d) => d + 1), RUN)
    return () => clearInterval(t)
  }, [still])

  return (
    <div className="flow-figure" aria-label="How one triage is produced">
      <Node kind="Intake" dart={dart} delay={AT.intake}
            name="Arrival record"
            body="Chief complaint, vitals, age, and whatever history exists." />

      <Branch straight dart={dart} delay={feed(AT.redact)} />

      <Node kind="Redaction" dart={dart} delay={AT.redact} tone="brand" boundary="phi"
            name="PHI removal"
            body="Names, numbers and locations are stripped before either path reads a word." />

      <Branch dart={dart} delay={feed(AT.paths)} />

      <div className="grid grid-cols-2 gap-3">
        <Node kind="Path A" dart={dart} delay={AT.paths} tone="ok" boundary="phi"
              name="ESI rules engine"
              body="Deterministic, age-banded vital thresholds. Runs on your hardware." />
        <Node kind="Path B" dart={dart} delay={AT.paths} boundary="deidentified"
              name="Clinical reasoning"
              body="Claude, grounded in the ESI handbook. The only component that sends anything anywhere." />
      </div>

      <Branch join dart={dart} delay={feed(AT.fuse)} />

      <Node kind="Fusion" dart={dart} delay={AT.fuse} name="The more acute level wins"
            body="Agreement means high confidence. Disagreement takes the more acute level, drops the confidence and flags a clinician." />

      <Branch straight dart={dart} delay={feed(AT.audit)} />

      <Node kind="Audit" dart={dart} delay={AT.audit} name="Append-only write"
            body="Both chains, the level, and whoever changes it, written as it happens." />
    </div>
  )
}
