import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'

const fmt = (n) => (n == null ? '—' : Number(n).toFixed(0))

function TopBar({ state, busy, onLoad, onStep, onAdvance, onSurge, remaining }) {
  return (
    <div className="topbar">
      <h1>PatientTriage.ai — Nurse Console</h1>
      <div className="meta">
        <a className="chip" href="/" style={{ textDecoration: 'none', color: '#fff' }}>&lsaquo; site</a>
        <span className="chip">Profile: {state?.profile ?? '…'}</span>
        <span className="chip">t = {fmt(state?.sim_min)} min</span>
        <span className="chip">Waiting: {state?.waiting ?? 0}</span>
        <button className={`chip ${state?.surge_mode ? 'on' : ''}`} onClick={onSurge}>
          SURGE {state?.surge_mode ? 'ON' : 'OFF'}
        </button>
        <button className="chip" disabled={busy} onClick={onLoad}>⟳ Load scenario</button>
        <button className="chip on" disabled={busy || remaining === 0} onClick={onStep}>
          Next event ▸ {remaining != null ? `(${remaining})` : ''}
        </button>
        <button className="chip" disabled={busy} onClick={() => onAdvance(15)}>+15 min</button>
      </div>
    </div>
  )
}

function Feed({ items }) {
  return (
    <div className="panel">
      <h2>Event Feed</h2>
      {items.length === 0 && <div className="empty">Load the scenario, then step through events.</div>}
      {items.map((it, i) =>
        it.type === 'alert' ? (
          <div key={i} className="alert-card">
            <span className="kind">{it.kind}</span> — {it.patient_id}
            <div>{it.text}</div>
          </div>
        ) : (
          <div key={i} className="feed-item">
            <span className="t">t={fmt(it.at)}</span>
            {it.text}
          </div>
        )
      )}
    </div>
  )
}

function Reasoning({ fused }) {
  return (
    <div className="reasoning">
      <b>Rules path (ESI v4):</b>
      <ul>{fused.rules.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      {fused.llm ? (
        <>
          <b>Reasoning path (Claude):</b>
          <ul>{fused.llm.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </>
      ) : (
        <b>Reasoning path: skipped (rules-only fast path)</b>
      )}
      {fused.notes.map((n, i) => <div key={i} style={{ marginTop: 4 }}>• {n}</div>)}
    </div>
  )
}

function DetailCard({ detail, onAccept, onOverride, feedback }) {
  const [showForm, setShowForm] = useState(false)
  const [newEsi, setNewEsi] = useState('')
  const [clin, setClin] = useState('RN-07')
  const [reason, setReason] = useState('')

  if (!detail) {
    return (
      <div className="panel">
        <h2>Triage Recommendation</h2>
        <div className="empty">Select a patient from the queue, or step the scenario.</div>
      </div>
    )
  }
  const { intake, fused, status, waited_min } = detail
  const inTreatment = status === 'in_treatment'

  const submit = async () => {
    await onOverride(intake.patient_id, {
      new_esi: Number(newEsi), clinician_id: clin, reason,
    })
    setShowForm(false); setReason(''); setNewEsi('')
  }

  return (
    <div className="panel">
      <h2>Triage Recommendation</h2>
      <div className="card selected">
        <span className="name">{intake.patient_id} — age {intake.age_years}</span>
        <span className="right">{status} · waited {waited_min} min</span>
        <div className="sub">{intake.chief_complaint}</div>
        <div className="row">
          <span className={`esi esi-${fused.esi}`}>ESI-{fused.esi}</span>
          <span className="pill">{fused.route}</span>
          <span className="pill">
            confidence {fused.confidence} ·{' '}
            {fused.paths_agree
              ? <span className="agree-word">Agree</span>
              : <span className="disagree-word">Disagree</span>}
          </span>
          {fused.clinician_flag && <span className="pill flag">REVIEW FLAGGED</span>}
        </div>
        <Reasoning fused={fused} />
        {!inTreatment && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-accept"
                    onClick={() => onAccept(intake.patient_id)}>
              Accept ESI-{fused.esi}
            </button>
            <button className="btn btn-outline" onClick={() => setShowForm(!showForm)}>
              Override…
            </button>
          </div>
        )}
        {feedback && <div className="sub" style={{ marginTop: 6 }}>{feedback}</div>}
        {showForm && !inTreatment && (
          <div className="override-form">
            <b style={{ fontSize: 12 }}>Override — logged to audit trail</b>
            <select value={newEsi} onChange={(e) => setNewEsi(e.target.value)}>
              <option value="">New ESI level…</option>
              {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>ESI-{l}</option>)}
            </select>
            <input value={clin} onChange={(e) => setClin(e.target.value)}
                   placeholder="Clinician ID" />
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason (required)" />
            <div className="sub">
              Logged: original rec, new level, clinician ID, timestamp, reason <span className="req">*</span>
            </div>
            <div className="row">
              <button className="btn btn-accept" disabled={!newEsi || reason.length < 3}
                      onClick={submit}>
                Confirm override
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QueueBoard({ queue, selectedId, onSelect }) {
  return (
    <div className="panel">
      <h2>Waiting Room — Reassessment Queue</h2>
      {queue.length === 0 && <div className="empty">No one waiting.</div>}
      {queue.map((row) => (
        <div key={row.patient_id}
             className={`card clickable ${row.status !== 'waiting' ? '' : ''} ${row.patient_id === selectedId ? 'selected' : ''}`}
             onClick={() => onSelect(row.patient_id)}>
          <span className="name">{row.patient_id}</span>
          <span className="right">priority {row.priority.toFixed(2)}</span>
          <div className="row">
            <span className={`esi esi-${row.esi}`}>ESI-{row.esi}</span>
            {row.status === 'reassess_due' && <span className="pill flag">RE-ASSESS NOW</span>}
            {row.status === 'deteriorating' && <span className="pill flag">DETERIORATING</span>}
            {!row.paths_agree && <span className="pill">paths disagreed</span>}
          </div>
          <div className="sub">
            waited {row.waited_min} min · {row.chief_complaint.slice(0, 55)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Console() {
  const [state, setState] = useState(null)
  const [queue, setQueue] = useState([])
  const [feed, setFeed] = useState([])
  const [detail, setDetail] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [metrics, setMetrics] = useState(null)

  const refresh = useCallback(async (selectedId) => {
    const q = await api.getQueue()
    setQueue(q.queue); setState(q.state)
    const m = await api.getMetrics().catch(() => null)
    if (m) setMetrics(m)
    const id = selectedId ?? detail?.intake?.patient_id
    if (id) {
      const d = await api.getPatient(id).catch(() => null)
      setDetail(d)
    }
  }, [detail])

  useEffect(() => {
    (async () => {
      const q = await api.getQueue().catch(() => null)
      if (!q) return
      setQueue(q.queue); setState(q.state)
      const m = await api.getMetrics().catch(() => null)
      if (m) setMetrics(m)
      if (q.queue.length) {
        const d = await api.getPatient(q.queue[0].patient_id).catch(() => null)
        setDetail(d)
      }
    })()
  }, [])  // eslint-disable-line

  const pushFeed = (items) => setFeed((f) => [...items, ...f].slice(0, 80))
  const alertItems = (alerts) => alerts.map((a) => ({
    type: 'alert', kind: a.kind, patient_id: a.patient_id,
    text: a.reasons.join('; '),
  }))

  const onLoad = async () => {
    setBusy(true)
    try {
      const r = await api.loadScenario({ profile: 'urban_500', speedup: 1, use_llm: true })
      setFeed([]); setDetail(null); setFeedback('')
      setRemaining(r.events)
      await refresh(null)
    } finally { setBusy(false) }
  }

  const onStep = async () => {
    setBusy(true)
    try {
      const r = await api.stepScenario()
      setRemaining(r.remaining ?? 0)
      const items = alertItems(r.alerts || [])
      const e = r.event
      if (e?.kind === 'arrive') {
        items.unshift({
          type: 'event', at: r.sim_min,
          text: `ARRIVE ${e.patient_id} -> ESI-${e.fused.esi} (${e.fused.confidence})`,
        })
        await refresh(e.patient_id)
      } else if (e?.kind === 'vitals') {
        items.unshift({
          type: 'event', at: r.sim_min,
          text: `Vitals recheck ${e.patient_id}${e.retriaged ? ` -> re-triage ESI-${e.retriaged.esi}` : ': stable'}`,
        })
        await refresh(e.patient_id)
      } else {
        await refresh(null)
      }
      pushFeed(items)
    } finally { setBusy(false) }
  }

  const onAdvance = async (minutes) => {
    setBusy(true)
    try {
      const r = await api.advanceClock(minutes)
      pushFeed(alertItems(r.alerts || []))
      await refresh(null)
    } finally { setBusy(false) }
  }

  const onSurge = async () => {
    await api.setSurge(state?.surge_mode ? null : true)
    await refresh(null)
  }

  const onSelect = async (id) => {
    const d = await api.getPatient(id)
    setDetail(d); setFeedback('')
  }

  const onAccept = async (id) => {
    const r = await api.acceptPatient(id, 'RN-07')
    setFeedback(`Accepted. Reward +${r.reward} logged to the learning loop.`)
    pushFeed([{ type: 'event', at: state?.sim_min, text: `ACCEPT ${id}` }])
    await refresh(id)
  }

  const onOverride = async (id, body) => {
    const r = await api.overridePatient(id, body)
    setFeedback(
      `Override logged. Reward ${r.reward} (${r.under_triage ? 'under-triage: system will learn to escalate' : 'over-triage'}).`
    )
    pushFeed([{ type: 'event', at: state?.sim_min, text: `OVERRIDE ${id} -> ESI-${body.new_esi}` }])
    await refresh(id)
  }

  return (
    <>
      <TopBar state={state} busy={busy} onLoad={onLoad} onStep={onStep}
              onAdvance={onAdvance} onSurge={onSurge} remaining={remaining} />
      <div className="cols">
        <Feed items={feed} />
        <DetailCard detail={detail} onAccept={onAccept} onOverride={onOverride}
                    feedback={feedback} />
        <QueueBoard queue={queue} selectedId={detail?.intake?.patient_id} onSelect={onSelect} />
      </div>
      <div className="footer">
        <span className="stat">The system recommends. <b>The clinician decides.</b></span>
        {metrics && Object.entries(metrics.bias_by_age_band).map(([band, s]) => (
          <span key={band} className="stat">
            {band}: n={s.n}, mean ESI <b>{s.mean_esi}</b>
          </span>
        ))}
        {metrics && Object.keys(metrics.calibration_cells).length > 0 && (
          <span className="stat">
            learned cells: <b>{Object.keys(metrics.calibration_cells).length}</b>
          </span>
        )}
      </div>
    </>
  )
}
