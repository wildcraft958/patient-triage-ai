import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import AlertBand from './AlertBand'
import AuditAnalytics from './AuditAnalytics'
import Feed from './Feed'
import IntakeForm from './IntakeForm'
import OverrideModal from './OverrideModal'
import PatientQueue from './PatientQueue'
import ReassessBoard from './ReassessBoard'
import StartScreen from './StartScreen'
import StatusBar from './StatusBar'
import ToastStack from './Toast'
import TriageCard from './TriageCard'

const CLINICIAN = 'RN-07'
const TOAST_MS = 5200
// Live mode: one sim minute per real second. It moves the same clock every
// number on the board is derived from, so wait times, priorities and alert
// thresholds stay in agreement while it runs.
const LIVE_TICK_MS = 1000

export default function Console() {
  const [state, setState] = useState(null)
  const [queue, setQueue] = useState([])
  const [inCare, setInCare] = useState([])
  const [feed, setFeed] = useState([])
  const [detail, setDetail] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(false)
  const [live, setLive] = useState(false)
  const [tab, setTab] = useState('queue')
  const [feedback, setFeedback] = useState('')
  const [showIntake, setShowIntake] = useState(false)
  const [showOverride, setShowOverride] = useState(false)
  const [toasts, setToasts] = useState([])

  const selectedRef = useRef(null)
  const toastSeq = useRef(0)

  const toast = useCallback((title, text, tone) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts.slice(-3), { id, title, text, tone }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), TOAST_MS)
  }, [])

  const refresh = useCallback(async (id) => {
    const target = id ?? selectedRef.current
    const q = await api.getQueue()
    setQueue(q.queue)
    setInCare(q.in_care ?? [])
    setState(q.state)
    if (q.scenario_remaining != null) setRemaining(q.scenario_remaining)
    api.getMetrics().then(setMetrics).catch(() => {})
    if (target) {
      selectedRef.current = target
      setSelectedId(target)
      setDetail(await api.getPatient(target).catch(() => null))
    }
  }, [])

  const pushFeed = (items) => setFeed((f) => [...items, ...f].slice(0, 120))

  const reportAlerts = useCallback((alerts) => {
    if (!alerts?.length) return []
    alerts.forEach((a) => toast(
      a.kind === 'WAIT_BREACH' ? 'Wait limit exceeded' : 'Patient deteriorating',
      a.message || a.reasons.join('; '), 'alarm'))
    return alerts.map((a) => ({
      dot: 'alert', text: a.message || `${a.kind} ${a.patient_id}`,
    }))
  }, [toast])

  // reload continuity: rebuild the shift activity from the audit trail
  useEffect(() => {
    (async () => {
      const q = await api.getQueue().catch(() => null)
      if (!q) return
      setQueue(q.queue); setInCare(q.in_care ?? []); setState(q.state)
      if (q.scenario_remaining != null) setRemaining(q.scenario_remaining)
      if (!q.queue.length && !(q.in_care ?? []).length) return
      if (q.scenario_remaining == null) setRemaining(0)
      const first = (q.queue[0] ?? q.in_care[0]).patient_id
      selectedRef.current = first
      setSelectedId(first)
      setDetail(await api.getPatient(first).catch(() => null))
      api.getMetrics().then(setMetrics).catch(() => {})

      const audit = await api.getRecentAudit().catch(() => null)
      if (!audit) return
      const rebuilt = audit.events.map((e) => {
        const p = e.payload
        if (e.event_type === 'triage')
          return { at: e.sim_min, esi: p.esi,
                   text: `Arrival ${e.patient_id}, ${p.confidence} confidence` }
        if (e.event_type === 'alert')
          return { at: e.sim_min, dot: 'alert',
                   text: `${p.kind} ${e.patient_id}: ${(p.reasons || []).join('; ')}` }
        if (e.event_type === 'reassessment')
          return { at: e.sim_min,
                   text: `Re-triage ${e.patient_id} ESI-${p.previous_esi} to ESI-${p.new_esi}` }
        if (e.event_type === 'reassessment_check')
          return { at: e.sim_min, dot: 'accept',
                   text: `${p.clinician_id} reassessed ${e.patient_id} at the bedside` }
        if (e.event_type === 'alert_ack')
          return { at: e.sim_min, text: `${p.clinician_id} acknowledged ${e.patient_id}` }
        if (e.event_type === 'override')
          return { at: e.sim_min, dot: 'override',
                   text: `Override ${e.patient_id} to ESI-${p.new_esi}` }
        if (e.event_type === 'override_safety_flag')
          return { at: e.sim_min, dot: 'alert',
                   text: `Safety flag ${e.patient_id}: ESI-${p.original_esi} downgraded to ESI-${p.new_esi}` }
        if (e.event_type === 'surge_enrichment' && p.escalated)
          return { at: e.sim_min, dot: 'override',
                   text: `Deferred reasoning escalated ${e.patient_id} to ESI-${p.new_esi}` }
        if (e.event_type === 'acceptance')
          return { at: e.sim_min, dot: 'accept', text: `Accepted ${e.patient_id}` }
        return null
      }).filter(Boolean).reverse()
      setFeed(rebuilt.slice(0, 120))
    })()
  }, [])

  const onLoad = async (profile, speedup) => {
    setBusy(true)
    try {
      const r = await api.loadScenario({ profile, speedup, use_llm: true })
      setFeed([]); setDetail(null); setFeedback(''); setAuto(false); setLive(false)
      selectedRef.current = null; setSelectedId(null)
      setRemaining(r.events)
      await refresh(null)
    } finally { setBusy(false) }
  }

  const onStep = useCallback(async () => {
    setBusy(true)
    try {
      const r = await api.stepScenario()
      setRemaining(r.remaining ?? 0)
      if (r.done && (r.remaining ?? 0) === 0) { setAuto(false) }
      const items = reportAlerts(r.alerts)
      const e = r.event
      if (e?.kind === 'arrive') {
        const name = e.fused?.display_name
        toast('New arrival', `${e.patient_id} (${e.age_years}y) · ${e.chief_complaint}`)
        items.unshift({ at: r.sim_min, esi: e.fused.esi,
                        text: `Arrival ${name ?? e.patient_id}: ${e.chief_complaint}` })
        await refresh(e.patient_id)
      } else if (e?.kind === 'vitals') {
        items.unshift({
          at: r.sim_min,
          text: `Vitals recheck ${e.patient_id}${e.retriaged ? `, re-triaged to ESI-${e.retriaged.esi}` : ', stable'}`,
        })
        await refresh(e.patient_id)
      } else {
        await refresh()
      }
      pushFeed(items)
    } finally { setBusy(false) }
  }, [refresh, reportAlerts, toast])

  // auto-play and live mode both use a chained timeout so ticks never overlap
  useEffect(() => {
    if (!auto || busy || !remaining) return
    const t = setTimeout(onStep, 1100)
    return () => clearTimeout(t)
  }, [auto, busy, remaining, onStep])

  useEffect(() => {
    if (!live || busy) return
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await api.advanceClock(1)
        pushFeed(reportAlerts(r.alerts))
        await refresh()
      } finally { setBusy(false) }
    }, LIVE_TICK_MS)
    return () => clearTimeout(t)
  }, [live, busy, refresh, reportAlerts])

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
      pushFeed(reportAlerts(r.alerts))
      await refresh()
    } finally { setBusy(false) }
  }

  const onSurge = async () => {
    await api.setSurge(state?.surge_mode ? null : true)
    await refresh()
  }

  const onSelect = async (id) => {
    selectedRef.current = id
    setSelectedId(id)
    setFeedback('')
    setDetail(await api.getPatient(id).catch(() => null))
  }

  const onAccept = async (id) => {
    const r = await api.acceptPatient(id, CLINICIAN)
    setFeedback(`Accepted. Reward +${r.reward} recorded to the learning loop.`)
    pushFeed([{ at: state?.sim_min, dot: 'accept', text: `Accepted ${id}` }])
    await refresh(id)
  }

  const onOverride = async (id, body) => {
    const r = await api.overridePatient(id, body)
    setFeedback(r.under_triage
      ? `Override recorded, reward ${r.reward}. Under-triage signal: the system will learn to escalate this pattern.`
      : `Override recorded, reward ${r.reward}.`)
    toast('Override recorded', `${id} moved to ESI-${body.new_esi} by ${body.clinician_id}`)
    const rows = [{ at: state?.sim_min, dot: 'override',
                    text: `Override ${id} to ESI-${body.new_esi}: ${body.reason}` }]
    if (r.safety_warning)
      rows.push({ at: state?.sim_min, dot: 'alert', text: `Safety flag: ${r.safety_warning}` })
    pushFeed(rows)
    await refresh(id)
  }

  const onReassess = async (id) => {
    setBusy(true)
    try {
      await api.reassessPatient(id, CLINICIAN)
      toast('Reassessed', `${id} checked at the bedside. Safe-wait clock restarted.`)
      pushFeed([{ at: state?.sim_min, dot: 'accept',
                  text: `${CLINICIAN} reassessed ${id} at the bedside` }])
      await refresh(id)
    } finally { setBusy(false) }
  }

  const onAcknowledge = async (id) => {
    setBusy(true)
    try {
      await api.acknowledgeAlert(id, CLINICIAN)
      pushFeed([{ at: state?.sim_min, text: `${CLINICIAN} acknowledged the alert for ${id}` }])
      await refresh()
    } finally { setBusy(false) }
  }

  const onCreatePatient = async (body) => {
    const r = await api.addPatient(body)
    setShowIntake(false)
    toast('New arrival', `${body.display_name ?? body.patient_id} scored ESI-${r.fused.esi}`)
    pushFeed([{ at: state?.sim_min, esi: r.fused.esi,
                text: `Arrival ${body.display_name ?? body.patient_id}: ${body.chief_complaint}` }])
    await refresh(body.patient_id)
  }

  const onRestart = () => {
    setRemaining(null); setQueue([]); setInCare([]); setFeed([]); setDetail(null)
    setAuto(false); setLive(false); selectedRef.current = null; setSelectedId(null)
  }

  const notStarted = remaining === null && queue.length === 0 && inCare.length === 0
  const openAlerts = queue.filter((r) => r.alert && !r.alert_acknowledged).length

  return (
    <>
      <StatusBar state={state} inCare={inCare.length} remaining={remaining} busy={busy}
                 auto={auto} live={live} onAuto={() => setAuto(!auto)}
                 onLive={() => setLive(!live)} onStep={onStep} onAdvance={onAdvance}
                 onSurge={onSurge} onRestart={onRestart} />

      {notStarted ? (
        <StartScreen onLoad={onLoad} busy={busy} />
      ) : (
        <>
          <div className="tabs">
            <button className={`tab ${tab === 'queue' ? 'on' : ''}`}
                    onClick={() => setTab('queue')}>
              Patient queue<span className="count">{queue.length + inCare.length}</span>
            </button>
            <button className={`tab ${tab === 'waiting' ? 'on' : ''}`}
                    onClick={() => setTab('waiting')}>
              Waiting room
              <span className={`count ${openAlerts ? 'alarm' : ''}`}>
                {openAlerts || queue.length}
              </span>
            </button>
            <button className={`tab ${tab === 'evidence' ? 'on' : ''}`}
                    onClick={() => setTab('evidence')}>
              Audit and evidence
            </button>
          </div>

          {tab !== 'evidence' && (
            <AlertBand rows={queue} busy={busy} onSelect={onSelect}
                       onReassess={onReassess} onAcknowledge={onAcknowledge} />
          )}

          {tab === 'queue' && (
            <div className="workspace">
              <PatientQueue rows={queue} inCare={inCare} selectedId={selectedId}
                            onSelect={onSelect} onNewPatient={() => setShowIntake(true)} />
              <div className="work-side">
                <TriageCard detail={detail} feedback={feedback} busy={busy}
                            onAccept={onAccept} onReassess={onReassess}
                            onOverride={() => setShowOverride(true)} />
                <Feed items={feed} />
              </div>
            </div>
          )}

          {tab === 'waiting' && (
            <div className="workspace">
              <ReassessBoard rows={queue} selectedId={selectedId} busy={busy}
                             onSelect={onSelect} onReassess={onReassess} />
              <div className="work-side">
                <TriageCard detail={detail} feedback={feedback} busy={busy}
                            onAccept={onAccept} onReassess={onReassess}
                            onOverride={() => setShowOverride(true)} />
              </div>
            </div>
          )}

          {tab === 'evidence' && <AuditAnalytics metrics={metrics} />}
        </>
      )}

      {showIntake && (
        <IntakeForm onSubmit={onCreatePatient} onClose={() => setShowIntake(false)}
                    nextId={`WALKIN-${(queue.length + inCare.length + 1).toString().padStart(2, '0')}`} />
      )}
      {showOverride && detail && (
        <OverrideModal detail={detail} onSubmit={onOverride}
                       onClose={() => setShowOverride(false)} />
      )}
      <ToastStack toasts={toasts} />

      <div className="footer">
        <span className="stat">The system recommends. <b>The clinician decides.</b></span>
        {!notStarted && (
          <span className="stat">press <b>N</b> for the next event</span>
        )}
      </div>
    </>
  )
}
