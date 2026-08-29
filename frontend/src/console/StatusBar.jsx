import { shiftClock } from './ui'

export default function StatusBar({
  state, inCare, remaining, busy, auto, live,
  onAuto, onLive, onStep, onAdvance, onSurge, onRestart,
}) {
  const surge = state?.surge_mode
  const total = state?.total_patients ?? 0
  const waiting = state?.waiting ?? 0
  const running = remaining != null

  return (
    <div className="statusbar">
      <div className="sb-left">
        <span className="sb-brand">
          <a href="/" title="Back to PatientTriage.ai">PatientTriage.ai</a>
        </span>
        <span className="sb-unit">EMERGENCY DEPARTMENT · {state?.profile ?? '…'}</span>
        <span className="sb-clock">{shiftClock(state?.sim_min)}<small>SHIFT</small></span>
        <span className="sb-counts">
          <span><b>{total}</b> patients</span>
          <span><b>{inCare}</b> in care</span>
          <span><b>{waiting}</b> waiting</span>
        </span>
        <span className="sb-load">
          <i className={`load-dot ${surge ? 'surge' : ''}`} />
          {surge ? 'SURGE LOAD' : 'Normal load'}
        </span>
        {(state?.pending_enrichment ?? 0) > 0 && (
          <span className="sb-unit">deferred reasoning queue: {state.pending_enrichment}</span>
        )}
      </div>

      <div className="sb-right">
        <button className={`chip ${surge ? 'on' : ''}`} onClick={onSurge}>
          Surge {surge ? 'on' : 'off'}
        </button>
        {running && (
          <>
            <button className={`chip live ${live ? 'on' : ''}`} onClick={onLive}
                    title="Advance the clock in real time: one minute per second">
              {live ? '● Live' : 'Go live'}
            </button>
            <button className={`chip play ${auto ? 'on' : ''}`} disabled={remaining === 0}
                    onClick={onAuto}>
              {auto ? 'Pause arrivals' : 'Play arrivals'}
            </button>
            <button className="chip on" disabled={busy || remaining === 0} onClick={onStep}>
              Next event ({remaining})
            </button>
            <button className="chip" disabled={busy} onClick={() => onAdvance(15)}>+15 min</button>
            <button className="chip" disabled={busy} onClick={onRestart}>Restart</button>
          </>
        )}
      </div>
    </div>
  )
}
