import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'

const fmt = (n) => (n == null ? '·' : Number(n).toFixed(0))

const fmtAge = (years, months) => {
  if (months != null && years === 0) {
    if (months < 1) return `${Math.round(months * 30)}d`
    return `${Math.round(months)}mo`
  }
  return `${years}y`
}

const VITAL_DEFS = [
  { key: 'hr', label: 'HR', unit: '', worseIfUp: true },
  { key: 'rr', label: 'RR', unit: '', worseIfUp: true },
  { key: 'spo2', label: 'SpO2', unit: '%', worseIfUp: false },
  { key: 'temp_c', label: 'Temp', unit: 'C', worseIfUp: true },
  { key: 'sbp', label: 'SBP', unit: '', worseIfUp: false },
  { key: 'pain', label: 'Pain', unit: '/10', worseIfUp: true },
]

function TopBar({ state, busy, auto, onAuto, onStep, onAdvance, onSurge, onReset, remaining }) {
  return (
    <div className="topbar">
      <h1>
        <a href="/" style={{ color: '#fff', textDecoration: 'none' }}
           title="Back to PatientTriage.ai site">
          PatientTriage.ai
        </a>
        {' '}· Nurse Console
      </h1>
      <div className="meta">
        <a className="chip" href="/" style={{ textDecoration: 'none', color: '#fff' }}>&lsaquo; Back to site</a>
        <span className="chip">{state?.profile ?? '…'}</span>
        <span className="chip">t = {fmt(state?.sim_min)} min</span>
        <span className="chip">Waiting: {state?.waiting ?? 0}</span>
        <button className={`chip ${state?.surge_mode ? 'on' : ''}`} onClick={onSurge}>
          SURGE {state?.surge_mode ? 'ON' : 'OFF'}
        </button>
        {(state?.pending_enrichment ?? 0) > 0 && (
          <span className="chip">Enrichment queue: {state.pending_enrichment}</span>
        )}
        {remaining != null && (
          <>
            <button className={`chip play ${auto ? 'on' : ''}`} disabled={remaining === 0}
                    onClick={onAuto}>
              {auto ? '⏸ Pause' : '▶ Auto-play'}
            </button>
            <button className="chip on" disabled={busy || remaining === 0} onClick={onStep}>
              Next event ▸ ({remaining})
            </button>
            <button className="chip" disabled={busy} onClick={() => onAdvance(15)}>+15 min</button>
            <button className="chip" disabled={busy} onClick={onReset}>⟲ Restart</button>
          </>
        )}
      </div>
    </div>
  )
}

function StartScreen({ onLoad, busy }) {
  return (
    <div className="start">
      <h2>Replay an emergency department shift</h2>
      <p>
        22 simulated patients arrive over ~2 hours: a classic cardiac presentation, a
        feverish neonate, an ambiguous "just not feeling right", a sepsis trajectory that
        worsens in the waiting room, and an atypical heart attack disguised as indigestion.
        Every recommendation shows both reasoning chains. You accept or override; the
        system learns from you.
      </p>
      <div className="start-cards">
        <div className="scenario-card" onClick={() => !busy && onLoad('urban_500', 1)}>
          <div className="tag">SCENARIO 1 · NORMAL SHIFT</div>
          <h3>Urban trauma center, 1x arrivals</h3>
          <p>Full dual-path scoring on every arrival. Watch SIM-007 deteriorate mid-shift
             and jump the reassessment queue, and catch the disagreement flags on the
             ambiguous cases.</p>
        </div>
        <div className="scenario-card" onClick={() => !busy && onLoad('rural_100', 3)}>
          <div className="tag">SCENARIO 2 · SURGE STRESS TEST</div>
          <h3>Rural ED, 3x arrival rate</h3>
          <p>Arrivals compressed three-fold. When the queue crosses the surge threshold the
             system flips to the deterministic fast path (about 4 ms per triage) while
             monitoring keeps firing.</p>
        </div>
      </div>
      <p className="hint">
        After loading: press <b>▶ Auto-play</b> and narrate, or hit <b>N</b> to step one
        event at a time. Works fully offline in rules-only mode if no AI key is set.
      </p>
    </div>
  )
}

function Feed({ items }) {
  return (
    <div className="panel">
      <h2>Event Feed</h2>
      {items.length === 0 && <div className="empty">Step the scenario to see arrivals, alerts, and re-triages here.</div>}
      {items.map((it, i) =>
        it.type === 'alert' ? (
          <div key={i} className="alert-card">
            <span className="kind">{it.kind}</span> · {it.patient_id}
            <div>{it.text}</div>
          </div>
        ) : (
          <div key={i} className="feed-item">
            <span className={`dot ${it.dot || ''}`} />
            <span className="t">t={fmt(it.at)}</span>
            {it.text}
            {it.esi && <span className="mini-esi">ESI-{it.esi}</span>}
          </div>
        )
      )}
    </div>
  )
}

function ConfMeter({ level }) {
  const filled = { high: 3, moderate: 2, low: 1 }[level] ?? 0
  return (
    <span className="conf-meter">
      {[0, 1, 2].map((i) => <i key={i} className={i < filled ? 'on' : ''} />)}
    </span>
  )
}

function VitalsChips({ history }) {
  if (!history?.length) return null
  const baseline = history[0].vitals
  const latest = history[history.length - 1].vitals
  const trending = history.length > 1
  return (
    <>
      {trending && <div className="trend-label">VITALS TREND SINCE TRIAGE ({history.length} readings)</div>}
      <div className="vit-chips">
        {VITAL_DEFS.map(({ key, label, unit, worseIfUp }) => {
          const now = latest[key]
          if (now == null) return null
          const base = baseline[key]
          const delta = trending && base != null ? now - base : 0
          const worse = trending && (worseIfUp ? delta > 0 : delta < 0) && Math.abs(delta) >= 1
          return (
            <span key={key} className={`vchip ${worse ? 'worse' : ''}`}>
              <b>{label}</b>{Number(now).toFixed(key === 'temp_c' ? 1 : 0)}{unit}
              {worse && <span className="arrow">{delta > 0 ? '↑' : '↓'}</span>}
            </span>
          )
        })}
      </div>
    </>
  )
}

function AuditDrawer({ patientId }) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState(null)

  const toggle = async () => {
    if (!open && events === null) {
      const r = await api.getAudit(patientId).catch(() => ({ events: [] }))
      setEvents(r.events)
    }
    setOpen(!open)
  }

  const summary = (e) => {
    const p = e.payload
    if (e.event_type === 'triage') return `ESI-${p.esi} · ${p.confidence} confidence · ${p.paths_agree ? 'paths agree' : 'paths disagree'}`
    if (e.event_type === 'alert') return `${p.kind}: ${(p.reasons || []).join('; ')}`
    if (e.event_type === 'reassessment') return `ESI-${p.previous_esi} re-triaged to ESI-${p.new_esi} (${p.trigger})`
    if (e.event_type === 'override') return `ESI-${p.original_esi} to ESI-${p.new_esi} by ${p.clinician_id}: "${p.reason}"`
    if (e.event_type === 'reward') return `reward ${p.reward} (${p.under_triage ? 'under-triage signal' : 'over-triage'})`
    if (e.event_type === 'acceptance') return `accepted ESI-${p.esi} by ${p.clinician_id} · reward +${p.reward}`
    return JSON.stringify(p).slice(0, 80)
  }

  return (
    <div className="audit-drawer">
      <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 10.5 }} onClick={toggle}>
        {open ? 'Hide audit trail' : 'Audit trail'}
      </button>
      {open && events && (
        <div style={{ marginTop: 8 }}>
          {events.map((e, i) => (
            <div key={i} className="audit-row">
              <span className="t">t={fmt(e.sim_min)}</span>
              <span className="et">{e.event_type}</span>
              <span className="pl">{summary(e)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailCard({ detail, onAccept, onOverride, feedback }) {
  const [showForm, setShowForm] = useState(false)
  const [newEsi, setNewEsi] = useState('')
  const [clin, setClin] = useState('RN-07')
  const [reason, setReason] = useState('')
  const [ack, setAck] = useState(false)

  if (!detail) {
    return (
      <div className="panel">
        <h2>Triage Recommendation</h2>
        <div className="empty">Select a patient from the queue, or step the scenario.</div>
      </div>
    )
  }
  const { intake, fused, status, waited_min, vitals_history } = detail
  const inTreatment = status === 'in_treatment'

  const redFlags = detail.fused.rules.red_flags || []
  const dangerousDowngrade =
    newEsi !== '' &&
    (detail.fused.esi <= 2 || redFlags.length > 0) &&
    Number(newEsi) >= detail.fused.esi + 2

  const submit = async () => {
    await onOverride(intake.patient_id, {
      new_esi: Number(newEsi), clinician_id: clin, reason,
      acknowledge_risk: dangerousDowngrade,
    })
    setShowForm(false); setReason(''); setNewEsi(''); setAck(false)
  }

  return (
    <div className="panel">
      <h2>Triage Recommendation</h2>
      <div className="card selected">
        <span className="name">{intake.patient_id} · age {fmtAge(intake.age_years, intake.age_months)}</span>
        <span className="right">{status} · waited {waited_min} min</span>
        <div className="sub">{intake.chief_complaint}</div>
        <div className="sub" style={{ marginTop: 2 }}>
          {intake.has_history
            ? `History: ${[...intake.conditions, ...intake.medications].join(', ') || 'on file'}`
            : 'No prior record (first-time patient)'}
        </div>
        <VitalsChips history={vitals_history} />
        <div className="row">
          <span className={`esi esi-${fused.esi}`}>ESI-{fused.esi}</span>
          <span className="pill">{fused.route}</span>
          <span className="pill">
            confidence {fused.confidence}<ConfMeter level={fused.confidence} /> ·{' '}
            {fused.paths_agree
              ? <span className="agree-word">Agree</span>
              : <span className="disagree-word">Disagree</span>}
          </span>
          {fused.clinician_flag && <span className="pill flag">REVIEW FLAGGED</span>}
          {detail.icd10 && <span className="pill">ICD-10 {detail.icd10.code}</span>}
        </div>
        <BeliefStrip belief={detail.belief} />
        <Reasoning fused={fused} />
        {!inTreatment && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-accept" onClick={() => onAccept(intake.patient_id)}>
              Accept ESI-{fused.esi}
            </button>
            <button className="btn btn-outline" onClick={() => setShowForm(!showForm)}>
              Override…
            </button>
          </div>
        )}
        {feedback && <div className="sub" style={{ marginTop: 6 }}><b>{feedback}</b></div>}
        {showForm && !inTreatment && (
          <div className="override-form">
            <b style={{ fontSize: 12 }}>Override (logged to audit trail)</b>
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
            {dangerousDowngrade && (
              <div className="risk-warning">
                <b>High-risk downgrade.</b> This patient is flagged
                {redFlags.length > 0 ? ` (${redFlags.join(', ')})` : ''} at
                ESI-{fused.esi}. Downgrading to ESI-{newEsi} will be recorded
                as a safety-flagged override.
                <label className="risk-ack">
                  <input type="checkbox" checked={ack}
                         onChange={(e) => setAck(e.target.checked)} />
                  I have reviewed the flagged risk and confirm this downgrade
                </label>
              </div>
            )}
            <div className="row">
              <button className="btn btn-accept"
                      disabled={!newEsi || reason.length < 3 || (dangerousDowngrade && !ack)}
                      onClick={submit}>
                Confirm override
              </button>
            </div>
          </div>
        )}
        <AuditDrawer key={intake.patient_id} patientId={intake.patient_id} />
      </div>
    </div>
  )
}

function BeliefStrip({ belief }) {
  if (!belief || belief.length !== 5) return null
  return (
    <div className="belief">
      <span className="belief-lbl">Acuity belief P(ESI)</span>
      {belief.map((p, i) => (
        <div key={i} className="belief-col"
             title={`P(true acuity is ESI-${i + 1}) = ${(p * 100).toFixed(0)}%`}>
          <div className="belief-bar" style={{ height: `${Math.max(2, p * 34)}px` }} />
          <span>{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

const CATEGORIES = ['other', 'chest_pain', 'breathing_difficulty', 'stroke_signs',
  'trauma_major', 'sepsis_concern', 'allergic_reaction', 'pregnancy_complication',
  'self_harm', 'abdominal_pain', 'fever', 'laceration', 'sprain', 'rash',
  'medication_refill', 'minor']

const OLDCARTS_FIELDS = [
  ['onset', 'O', 'Onset', 'When did this start?'],
  ['location', 'L', 'Location', 'Where does it hurt?'],
  ['duration', 'D', 'Duration', 'How long has this been going on?'],
  ['characteristics', 'C', 'Characteristics', 'Describe the pain'],
  ['aggravating_alleviating', 'A', 'Aggravating / Alleviating', 'What makes it better or worse?'],
  ['radiation', 'R', 'Radiation', 'Does it spread anywhere?'],
  ['timing_triggers', 'T', 'Timing / Triggers', 'Constant or comes and goes?'],
]

function IntakeForm({ onSubmit, onClose, nextId }) {
  const [f, setF] = useState({ patient_id: nextId, age_years: '', chief_complaint: '',
    complaint_category: 'other', responsiveness: 'alert' })
  const [vit, setVit] = useState({})
  const [oc, setOc] = useState({})
  const [severity, setSeverity] = useState('')
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')

  const dictate = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Voice dictation is not supported in this browser'); return }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const heard = e.results[0][0].transcript
      setF((prev) => ({ ...prev, chief_complaint: (prev.chief_complaint + ' ' + heard).trim() }))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    setListening(true)
    rec.start()
  }

  const submit = async () => {
    setError('')
    const oldcartsAnswers = Object.fromEntries(
      Object.entries(oc).filter(([, v]) => v && v.trim()))
    if (severity !== '') oldcartsAnswers.severity = Number(severity)
    const body = {
      ...f,
      age_years: Number(f.age_years),
      vitals: Object.fromEntries(
        Object.entries(vit).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      ...(Object.keys(oldcartsAnswers).length ? { oldcarts: oldcartsAnswers } : {}),
    }
    try { await onSubmit(body) } catch (e) { setError(String(e.message || e)) }
  }

  const vitField = (key, label) => (
    <label key={key} className="if-field">
      <span>{label}</span>
      <input type="number" value={vit[key] ?? ''}
             onChange={(e) => setVit({ ...vit, [key]: e.target.value })} />
    </label>
  )

  return (
    <div className="intake-overlay" onClick={onClose}>
      <div className="intake-form" onClick={(e) => e.stopPropagation()}>
        <h2>New patient intake</h2>
        <div className="if-grid">
          <label className="if-field"><span>Patient ID</span>
            <input value={f.patient_id}
                   onChange={(e) => setF({ ...f, patient_id: e.target.value })} /></label>
          <label className="if-field"><span>Age (years)</span>
            <input type="number" value={f.age_years}
                   onChange={(e) => setF({ ...f, age_years: e.target.value })} /></label>
          <label className="if-field"><span>Category</span>
            <select value={f.complaint_category}
                    onChange={(e) => setF({ ...f, complaint_category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>
                {c === 'other' ? 'auto (from complaint text)' : c}</option>)}
            </select></label>
          <label className="if-field"><span>AVPU</span>
            <select value={f.responsiveness}
                    onChange={(e) => setF({ ...f, responsiveness: e.target.value })}>
              {['alert', 'verbal', 'pain', 'unresponsive'].map((r) =>
                <option key={r} value={r}>{r}</option>)}
            </select></label>
        </div>
        <label className="if-field"><span>Chief complaint</span>
          <div className="if-voice">
            <textarea rows={2} value={f.chief_complaint}
                      onChange={(e) => setF({ ...f, chief_complaint: e.target.value })}
                      placeholder="In the patient's words" />
            <button className={`btn btn-outline mic ${listening ? 'on' : ''}`}
                    onClick={dictate} title="Dictate with your voice">
              {listening ? 'Listening…' : 'Voice'}
            </button>
          </div>
        </label>
        <div className="if-section">Vitals (leave blank if not yet recorded)</div>
        <div className="if-grid">
          {vitField('hr', 'HR')}{vitField('rr', 'RR')}{vitField('spo2', 'SpO2 %')}
          {vitField('temp_c', 'Temp C')}{vitField('sbp', 'SBP')}{vitField('pain', 'Pain 0-10')}
        </div>
        <div className="if-section">OLDCARTS structured interview (optional)</div>
        <div className="if-grid oc">
          {OLDCARTS_FIELDS.map(([key, letter, name, q]) => (
            <label key={key} className="if-field">
              <span><b>{letter}</b> {name} · "{q}"</span>
              <input value={oc[key] ?? ''}
                     onChange={(e) => setOc({ ...oc, [key]: e.target.value })} />
            </label>
          ))}
          <label className="if-field">
            <span><b>S</b> Severity · 1-10 scale</span>
            <input type="number" min={0} max={10} value={severity}
                   onChange={(e) => setSeverity(e.target.value)} />
          </label>
        </div>
        {error && <div className="sub" style={{ color: '#C4452F' }}><b>{error}</b></div>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-accept"
                  disabled={!f.patient_id || f.age_years === '' || f.chief_complaint.length < 3}
                  onClick={submit}>Triage this patient</button>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
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

function QueueBoard({ queue, selectedId, onSelect, onNewPatient }) {
  return (
    <div className="panel">
      <h2>Waiting Room · Reassessment Queue
        <button className="btn btn-outline new-patient" onClick={onNewPatient}>
          + New patient
        </button>
      </h2>
      {queue.length === 0 && <div className="empty">No one waiting.</div>}
      {queue.map((row) => {
        const pct = row.max_wait_min ? Math.min(100, (row.waited_min / row.max_wait_min) * 100) : 0
        const over = row.max_wait_min && row.waited_min > row.max_wait_min
        const urgent = row.status !== 'waiting'
        return (
          <div key={row.patient_id}
               className={`card clickable ${urgent ? 'urgent' : ''} ${row.patient_id === selectedId ? 'selected' : ''}`}
               onClick={() => onSelect(row.patient_id)}>
            <span className="name">{row.patient_id} · {fmtAge(row.age_years, row.age_months)}</span>
            <span className="right">priority {row.priority.toFixed(2)}</span>
            <div className="row">
              <span className={`esi esi-${row.esi}`}>ESI-{row.esi}</span>
              {row.action === 'REASSESS NOW'
                ? <span className="pill flag">REASSESS NOW</span>
                : <span className="pill">Monitor</span>}
              {row.status === 'deteriorating' && <span className="pill flag">DETERIORATING</span>}
              {!row.paths_agree && <span className="pill">paths disagreed</span>}
              {row.icd10 && <span className="pill">{row.icd10.code}</span>}
            </div>
            <div className="sub">{row.chief_complaint.slice(0, 58)}</div>
            <div className={`wait-bar ${over ? 'over' : ''}`}><i style={{ width: `${pct}%` }} /></div>
            <div className="wait-lbl">
              <span>waited {row.waited_min} min</span>
              <span>{row.max_wait_min ? `limit ${row.max_wait_min} min for ESI-${row.esi}` : ''}</span>
            </div>
          </div>
        )
      })}
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
  const [auto, setAuto] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [metrics, setMetrics] = useState(null)
  const [showIntake, setShowIntake] = useState(false)
  const stats = useRef({ alerts: 0, disagreements: 0 })

  const refresh = useCallback(async (selectedId) => {
    const q = await api.getQueue()
    setQueue(q.queue); setState(q.state)
    if (q.scenario_remaining != null) setRemaining(q.scenario_remaining)
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
      if (q.scenario_remaining != null) setRemaining(q.scenario_remaining)
      if (!q.queue.length) return
      const d = await api.getPatient(q.queue[0].patient_id).catch(() => null)
      setDetail(d)
      if (q.scenario_remaining == null) setRemaining(0)
      // reload continuity: rebuild the event feed from the audit trail
      const audit = await api.getRecentAudit().catch(() => null)
      if (!audit) return
      const rebuilt = audit.events.map((e) => {
        const p = e.payload
        if (e.event_type === 'triage') {
          if (p.clinician_flag) stats.current.disagreements += 1
          return { type: 'event', at: e.sim_min, esi: p.esi,
                   text: `ARRIVE ${e.patient_id} (${p.confidence} confidence)` }
        }
        if (e.event_type === 'alert') {
          stats.current.alerts += 1
          return { type: 'alert', kind: p.kind, patient_id: e.patient_id,
                   text: (p.reasons || []).join('; ') }
        }
        if (e.event_type === 'reassessment')
          return { type: 'event', at: e.sim_min,
                   text: `Re-triage ${e.patient_id} ESI-${p.previous_esi} to ESI-${p.new_esi}` }
        if (e.event_type === 'override')
          return { type: 'event', at: e.sim_min, dot: 'override',
                   text: `OVERRIDE ${e.patient_id} to ESI-${p.new_esi}` }
        if (e.event_type === 'override_safety_flag')
          return { type: 'event', at: e.sim_min, dot: 'alert',
                   text: `SAFETY FLAG ${e.patient_id} downgraded ESI-${p.original_esi} to ESI-${p.new_esi} (acknowledged)` }
        if (e.event_type === 'surge_enrichment' && p.escalated)
          return { type: 'event', at: e.sim_min, dot: 'override',
                   text: `ENRICHED ${e.patient_id} escalated ESI-${p.previous_esi} to ESI-${p.new_esi}` }
        if (e.event_type === 'acceptance')
          return { type: 'event', at: e.sim_min, dot: 'accept', text: `ACCEPT ${e.patient_id}` }
        return null
      }).filter(Boolean).reverse()
      setFeed(rebuilt.slice(0, 120))
    })()
  }, [])

  const pushFeed = (items) => setFeed((f) => [...items, ...f].slice(0, 120))
  const alertItems = (alerts) => {
    stats.current.alerts += alerts.length
    return alerts.map((a) => ({
      type: 'alert', kind: a.kind, patient_id: a.patient_id,
      text: a.message || a.reasons.join('; '),
    }))
  }

  const onLoad = async (profile, speedup) => {
    setBusy(true)
    try {
      const r = await api.loadScenario({ profile, speedup, use_llm: true })
      setFeed([]); setDetail(null); setFeedback(''); setAuto(false)
      stats.current = { alerts: 0, disagreements: 0 }
      setRemaining(r.events)
      const q = await api.getQueue()
      setQueue(q.queue); setState(q.state)
    } finally { setBusy(false) }
  }

  const onStep = useCallback(async () => {
    setBusy(true)
    try {
      const r = await api.stepScenario()
      setRemaining(r.remaining ?? 0)
      if (r.done && (r.remaining ?? 0) === 0) setAuto(false)
      const items = alertItems(r.alerts || [])
      const e = r.event
      if (e?.kind === 'arrive') {
        if (e.fused.clinician_flag) stats.current.disagreements += 1
        items.unshift({
          type: 'event', at: r.sim_min, esi: e.fused.esi,
          text: `ARRIVE ${e.patient_id} (${e.age_years}y) ${e.chief_complaint.slice(0, 42)}`,
        })
        await refresh(e.patient_id)
      } else if (e?.kind === 'vitals') {
        items.unshift({
          type: 'event', at: r.sim_min,
          text: `Vitals recheck ${e.patient_id}${e.retriaged ? ` re-triaged to ESI-${e.retriaged.esi}` : ': stable'}`,
        })
        await refresh(e.patient_id)
      } else {
        await refresh(null)
      }
      pushFeed(items)
    } finally { setBusy(false) }
  }, [refresh])

  // auto-play: chained timeout so steps never overlap
  useEffect(() => {
    if (!auto || busy || !remaining) return
    const t = setTimeout(onStep, 1100)
    return () => clearTimeout(t)
  }, [auto, busy, remaining, onStep])

  // keyboard: N steps the scenario (ignored while typing)
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key.toLowerCase() === 'n' && !busy && remaining) onStep()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [busy, remaining, onStep])

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
    pushFeed([{ type: 'event', at: state?.sim_min, dot: 'accept', text: `ACCEPT ${id}` }])
    await refresh(id)
  }

  const onOverride = async (id, body) => {
    const r = await api.overridePatient(id, body)
    setFeedback(
      r.under_triage
        ? `Override logged, reward ${r.reward}. Under-triage signal: the system will learn to escalate this pattern.`
        : `Override logged, reward ${r.reward}.`
    )
    const feedRows = [{ type: 'event', at: state?.sim_min, dot: 'override', text: `OVERRIDE ${id} to ESI-${body.new_esi}` }]
    if (r.safety_warning)
      feedRows.push({ type: 'event', at: state?.sim_min, dot: 'alert', text: `SAFETY FLAG ${r.safety_warning}` })
    pushFeed(feedRows)
    await refresh(id)
  }

  const onCreatePatient = async (body) => {
    const r = await api.addPatient(body)
    setShowIntake(false)
    pushFeed([{ type: 'event', at: state?.sim_min, esi: r.fused.esi,
                text: `ARRIVE ${body.patient_id} (manual intake, ${r.fused.confidence} confidence)` }])
    await refresh(body.patient_id)
  }

  const notStarted = remaining === null && queue.length === 0

  return (
    <>
      <TopBar state={state} busy={busy} auto={auto} remaining={remaining}
              onAuto={() => setAuto(!auto)} onStep={onStep} onAdvance={onAdvance}
              onSurge={onSurge} onReset={() => { setRemaining(null); setQueue([]); setFeed([]); setDetail(null) }} />
      {notStarted ? (
        <StartScreen onLoad={onLoad} busy={busy} />
      ) : (
        <div className="cols">
          <Feed items={feed} />
          <DetailCard detail={detail} onAccept={onAccept} onOverride={onOverride}
                      feedback={feedback} />
          <QueueBoard queue={queue} selectedId={detail?.intake?.patient_id} onSelect={onSelect}
                      onNewPatient={() => setShowIntake(true)} />
        </div>
      )}
      {showIntake && (
        <IntakeForm onSubmit={onCreatePatient} onClose={() => setShowIntake(false)}
                    nextId={`WALKIN-${(queue.length + 1).toString().padStart(2, '0')}`} />
      )}
      <div className="footer">
        <span className="stat">The system recommends. <b>The clinician decides.</b></span>
        {!notStarted && (
          <>
            <span className="stat">alerts fired: <b>{stats.current.alerts}</b></span>
            <span className="stat">disagreement flags: <b>{stats.current.disagreements}</b></span>
          </>
        )}
        {metrics && Object.entries(metrics.bias_by_age_band).map(([band, s]) => (
          <span key={band} className="stat">{band}: n={s.n}, mean ESI <b>{s.mean_esi}</b></span>
        ))}
        {metrics && Object.keys(metrics.calibration_cells).length > 0 && (
          <span className="stat">learned cells: <b>{Object.keys(metrics.calibration_cells).length}</b></span>
        )}
        <span className="stat">press <b>N</b> for next event</span>
      </div>
    </>
  )
}
