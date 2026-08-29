export default function StartScreen({ onLoad, busy }) {
  return (
    <div className="start">
      <h2>Open a shift</h2>
      <p>
        Twenty-four patients arrive across roughly two hours: a classic cardiac
        presentation, a feverish neonate, an ambiguous "just not feeling right",
        a sepsis trajectory that worsens in the waiting room, and a heart attack
        that arrives calling itself indigestion. Every recommendation shows both
        reasoning chains. You accept or override, and the system learns from you.
      </p>
      <div className="start-cards">
        <div className="scenario-card" onClick={() => !busy && onLoad('urban_500', 1)}>
          <div className="tag">URBAN TRAUMA CENTER · 500 VISITS A DAY</div>
          <h3>Normal shift</h3>
          <p>
            Full dual-path scoring on every arrival. Watch R. Castillo deteriorate
            mid-shift and climb the reassessment board, and catch the disagreement
            flags on the ambiguous presentations.
          </p>
        </div>
        <div className="scenario-card" onClick={() => !busy && onLoad('rural_100', 3)}>
          <div className="tag">RURAL ED · 100 VISITS A DAY</div>
          <h3>Surge stress test</h3>
          <p>
            Arrivals compressed three-fold. When the queue crosses the surge
            threshold the system drops to the deterministic fast path, about four
            milliseconds a triage, and the reasoning pass is queued rather than
            dropped. Monitoring never stops.
          </p>
        </div>
      </div>
      <p className="hint">
        Once loaded: <b>Go live</b> runs the clock in real time, <b>Play arrivals</b>
        {' '}steps the shift on its own, or press <b>N</b> for the next event.
        Works fully offline in rules-only mode when no reasoning key is set.
      </p>
    </div>
  )
}
