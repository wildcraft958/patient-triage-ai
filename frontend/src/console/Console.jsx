import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import SignIn from '../auth/SignIn'
import { useSession } from '../auth/sessionContext'
import AlertBand from './AlertBand'
import ChunkBoundary from './ChunkBoundary'
import { reloadOnStaleChunk } from './chunkRecovery'
import EmptyBoard from './EmptyBoard'
import IntakeForm from './IntakeForm'
import MonitorBoard from './MonitorBoard'
import OverrideModal from './OverrideModal'
import PatientDrawer from './PatientDrawer'
import PatientQueue from './PatientQueue'
import PipelineView from './PipelineView'
import Registry from './Registry'
import Settings from './Settings'
import Sidebar from './Sidebar'
import Splitter from './Splitter'
import StatusBar from './StatusBar'
import ToastStack from './Toast'
import { usePaneWidth } from './usePaneWidth'
import VitalsModal from './VitalsModal'

// Analytics is the only view that pulls in a charting library. Splitting it
// keeps the board, which is what a nurse opens, off that weight, at the cost
// of a chunk that can go missing under a deploy - hence the recovery.
const Analytics = lazy(() => import('./Analytics').catch(reloadOnStaleChunk))

const TOAST_MS = 5200
// Live mode advances the department clock one minute every four seconds. It
// moves the same clock every number on the board derives from, so waits,
// priorities and alert thresholds stay in agreement while it runs. Four
// seconds is realistic drift: fast enough that a shift visibly moves, slow
// enough that reading the board for two minutes does not breach every limit.
const LIVE_TICK_MS = 4000
const PULSE_MS = 2000
const RAIL_KEY = 'pt.rail.collapsed'
const RAIL_MIN = 168
const RAIL_MAX = 300
const RAIL_COLLAPSED = 60
const DRAWER_MIN = 360
const DRAWER_MAX = 760

export default function Console() {
  const { user, can } = useSession()

  const [state, setState] = useState(null)
  const [queue, setQueue] = useState([])
  const [inCare, setInCare] = useState([])
  const [detail, setDetail] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(false)
  const [live, setLive] = useState(false)
  const [view, setView] = useState('queue')
  const [feedback, setFeedback] = useState('')
  const [showIntake, setShowIntake] = useState(false)
  const [showOverride, setShowOverride] = useState(false)
  const [showVitals, setShowVitals] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  // Which shift is opening, so both pickers can answer the click. Console
  // owns it because Settings renders the same list against the same handler.
  const [loadingProfile, setLoadingProfile] = useState(null)
  const [toasts, setToasts] = useState([])
  const [pulsingId, setPulsingId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [collapsed, setCollapsed] = useState(() => {
    try { return sessionStorage.getItem(RAIL_KEY) === '1' } catch { return false }
  })
  const [railWidth, setRailWidth] = usePaneWidth('pt.rail.width', 220, RAIL_MIN, RAIL_MAX)
  const [drawerWidth, setDrawerWidth] = usePaneWidth('pt.drawer.width', 460, DRAWER_MIN, DRAWER_MAX)

  const selectedRef = useRef(null)
  const toastSeq = useRef(0)
  // monotonic: a response that is not from the newest request is dropped
  const fetchSeq = useRef(0)

  // A toast expires on its own, but a stack of four sitting over the board
  // while a nurse is trying to read a row is its own problem.
  const dismissToast = useCallback(
    (id) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const toast = useCallback((title, text, tone) => {
    const id = ++toastSeq.current
    setToasts((ts) => [...ts.slice(-3), { id, title, text, tone }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), TOAST_MS)
  }, [])

  // The permission decision lives behind the API, so any of these can come
  // back refused. Without this a 403 is an unhandled rejection and a click
  // that silently does nothing.
  const attempt = useCallback(async (title, fn) => {
    try {
      await fn()
    } catch (err) {
      toast(title, String(err.message ?? err), 'alarm')
    }
  }, [toast])

  const refresh = useCallback(async (id) => {
    const mine = ++fetchSeq.current
    const target = id ?? selectedRef.current
    const q = await api.getQueue()
    if (mine !== fetchSeq.current) return  // a newer refresh already answered
    setQueue(q.queue)
    setInCare(q.in_care ?? [])
    setState(q.state)
    if (q.scenario_remaining != null) setRemaining(q.scenario_remaining)
    api.getMetrics().then(setMetrics).catch(() => {})
    setRefreshKey((k) => k + 1)
    if (target) {
      selectedRef.current = target
      setSelectedId(target)
      const d = await api.getPatient(target).catch(() => null)
      if (mine === fetchSeq.current) setDetail(d)
    }
  }, [])

  const reportAlerts = useCallback((alerts) => {
    (alerts ?? []).forEach((a) => toast(
      a.kind === 'WAIT_BREACH' ? 'Wait limit exceeded' : 'Patient deteriorating',
      a.message || a.reasons.join('; '), 'alarm'))
  }, [toast])

  // reload continuity: a refresh mid-shift lands back on a populated board
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const q = await api.getQueue().catch(() => null)
      if (!q || cancelled) return
      setQueue(q.queue); setInCare(q.in_care ?? []); setState(q.state)
      if (q.scenario_remaining != null) setRemaining(q.scenario_remaining)
      if (!q.queue.length && !(q.in_care ?? []).length) return
      if (q.scenario_remaining == null) setRemaining(0)
      const first = (q.queue[0] ?? q.in_care[0]).patient_id
      const mine = ++fetchSeq.current
      selectedRef.current = first
      setSelectedId(first)
      const d = await api.getPatient(first).catch(() => null)
      // A click during this fetch owns the selection from then on. Without
      // this the restore lands late and pulls the drawer back to whoever the
      // shift happened to start with.
      if (mine === fetchSeq.current) setDetail(d)
      api.getMetrics().then(setMetrics).catch(() => {})
      // A reload mid-shift resumes whatever the shift was doing: arrivals if
      // the timeline still has events, the clock alone once it is spent.
      if (q.scenario_remaining) setAuto(true)
      else setLive(true)
    })()
    return () => { cancelled = true }
  }, [user])

  const onLoad = async (profile, speedup) => {
    setBusy(true)
    setLoadingProfile(profile)
    // Announced through the always-mounted toast region: a live region created
    // in the same render as its first message is not read out.
    toast('Opening the shift', 'Scoring the first arrivals through both engines.')
    try {
      const r = await api.loadScenario({ profile, speedup, use_llm: true })
      setDetail(null); setFeedback(''); setDrawerOpen(false)
      selectedRef.current = null; setSelectedId(null)
      setRemaining(r.events)
      setView('queue')
      // Loading a scenario only queues the arrivals; auto-play is what walks
      // them through the door, and the card promises exactly that. The clock
      // needs no separate ticker while it runs, because stepping an event
      // advances it. Live mode takes over in onStep once the timeline is spent.
      setAuto(true)
      setLive(false)
      // Last, so a refresh that rejects cannot leave the picker gone with an
      // inert board behind it.
      setOpened(true)
      await refresh(null)
    } catch (err) {
      setOpened(false); setAuto(false); setLive(false)
      toast('Could not open the shift', String(err.message ?? err), 'alarm')
    } finally { setBusy(false); setLoadingProfile(null) }
  }

  const pulse = (id) => {
    setPulsingId(id)
    setTimeout(() => setPulsingId((cur) => (cur === id ? null : cur)), PULSE_MS)
  }

  const onStep = useCallback(async () => {
    setBusy(true)
    try {
      const r = await api.stepScenario()
      setRemaining(r.remaining ?? 0)
      if (r.done && (r.remaining ?? 0) === 0) {
        // Timeline spent: hand the department over to the clock so the waiting
        // room keeps evolving after the last arrival.
        setAuto(false)
        setLive(true)
      }
      reportAlerts(r.alerts)
      const e = r.event
      if (e?.kind === 'arrive') {
        const who = e.display_name ?? e.patient_id
        toast('New arrival', `${who}, ${e.age_years}y · ${e.chief_complaint}`)
        pulse(e.patient_id)
        await refresh(e.patient_id)
      } else if (e?.kind === 'vitals') {
        const who = e.display_name ?? e.patient_id
        toast('Vitals recorded',
              `${who}${e.retriaged ? `, re-triaged to ESI-${e.retriaged.esi}` : ', stable'}`,
              e.retriaged ? 'override' : undefined)
        pulse(e.patient_id)
        await refresh(e.patient_id)
      } else {
        await refresh()
      }
    } catch (err) {
      // Auto-play reschedules itself, so without this a step that keeps
      // failing - a restarted backend has no scenario loaded and answers 400 -
      // becomes a silent request every 1.1s with nothing on screen.
      setAuto(false)
      toast('Arrivals stopped', String(err.message ?? err), 'alarm')
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
        reportAlerts(r.alerts)
        await refresh()
      } finally { setBusy(false) }
    }, LIVE_TICK_MS)
    return () => clearTimeout(t)
  }, [live, busy, refresh, reportAlerts])

  useEffect(() => {
    try { sessionStorage.setItem(RAIL_KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])

  const onAdvance = async (minutes) => {
    setBusy(true)
    try {
      const r = await api.advanceClock(minutes)
      reportAlerts(r.alerts)
      await refresh()
    } finally { setBusy(false) }
  }

  const onSurge = async () => {
    await api.setSurge(state?.surge_mode ? null : true)
    await refresh()
  }

  const onSelect = async (id) => {
    const mine = ++fetchSeq.current
    selectedRef.current = id
    setSelectedId(id)
    setFeedback('')
    if (view === 'queue' || view === 'monitor') setDrawerOpen(true)
    const d = await api.getPatient(id).catch(() => null)
    if (mine === fetchSeq.current) setDetail(d)
  }

  const onAccept = (id) => attempt('Could not accept', async () => {
    const r = await api.acceptPatient(id, user.badge_id)
    setFeedback(`Accepted. Reward +${r.reward} recorded to the learning loop.`)
    await refresh(id)
  })

  const onOverride = (id, body) => attempt('Could not override', async () => {
    const r = await api.overridePatient(id, body)
    setFeedback(r.under_triage
      ? `Override recorded, reward ${r.reward}. Under-triage signal: the system will learn to escalate this pattern.`
      : `Override recorded, reward ${r.reward}.`)
    toast('Override recorded', `Moved to ESI-${body.new_esi} by ${body.clinician_id}`, 'override')
    if (r.safety_warning) toast('Safety flag', r.safety_warning, 'alarm')
    await refresh(id)
  })

  const onReassess = (id) => attempt('Could not reassess', async () => {
    setBusy(true)
    try {
      await api.reassessPatient(id, user.badge_id)
      toast('Reassessed', 'Checked at the bedside. Safe-wait clock restarted.', 'accept')
      await refresh(id)
    } finally { setBusy(false) }
  })

  const onAcknowledge = (id) => attempt('Could not acknowledge', async () => {
    setBusy(true)
    try {
      await api.acknowledgeAlert(id, user.badge_id)
      await refresh()
    } finally { setBusy(false) }
  })

  const onRecordVitals = (id, vitals) => attempt('Could not record vitals', async () => {
    const r = await api.recordVitals(id, vitals, user.badge_id)
    if (r.alert) reportAlerts([r.alert])
    else toast('Vitals recorded', 'No deterioration threshold crossed.', 'accept')
    pulse(id)
    await refresh(id)
  })

  const onCreatePatient = (body) => attempt('Could not admit the patient', async () => {
    const r = await api.addPatient(body)
    setShowIntake(false)
    toast('New arrival', `${body.display_name ?? body.patient_id} scored ESI-${r.fused.esi}`)
    pulse(body.patient_id)
    await refresh(body.patient_id)
  })

  // The drawer belongs to the board. Carrying it onto Analytics or the
  // registry would leave a patient record open over a page that is not about
  // that patient.
  const onView = (next) => {
    setView(next)
    if (next !== 'queue' && next !== 'monitor') setDrawerOpen(false)
  }

  const onRestart = () => {
    setRemaining(null); setQueue([]); setInCare([]); setDetail(null)
    setState(null); setMetrics(null); setView('queue'); setDrawerOpen(false)
    setAuto(false); setLive(false); selectedRef.current = null; setSelectedId(null)
    setOpened(false)
  }

  if (!user) return <SignIn />

  // The drawer and both dialogs act on a record, and both dialogs submit the
  // record's own patient_id. Rendering one while the board highlights someone
  // else is a wrong-patient action waiting to happen, so a record only counts
  // as shown while it is the record that is selected. Everything downstream
  // reads this, never `detail`.
  const shown = detail?.intake.patient_id === selectedId ? detail : null

  // Two ways a shift is under way, and both are needed. `opened` is this
  // operator choosing one: loading a scenario only queues the arrivals, so the
  // board must appear on the click rather than waiting for the first patient
  // to walk in. total_patients covers a reload mid-shift, and counts the room
  // rather than the queue so a board where everyone is in a treatment bay
  // still reads as started. Neither alone is enough: keying off the server's
  // `remaining` suppressed the picker on a demo that sits loaded between
  // shifts, and keying off arrivals alone made the picker look like a dead
  // button for as long as it took the first one to arrive.
  const started = opened || (state?.total_patients ?? 0) > 0
  const openAlerts = queue.filter((r) => r.alert && !r.alert_acknowledged).length
  const counts = {
    queue: queue.length + inCare.length,
    monitor: openAlerts || queue.length,
    monitorTone: openAlerts ? 'alert' : undefined,
  }

  return (
    <div className="h-screen flex bg-app text-ink">
      <div className="shrink-0 transition-[width] duration-150"
           style={{ width: collapsed ? RAIL_COLLAPSED : railWidth }}>
        <Sidebar view={view} onView={onView} counts={counts} collapsed={collapsed}
                 onCollapse={() => setCollapsed((c) => !c)} />
      </div>
      {!collapsed && (
        <Splitter value={railWidth} min={RAIL_MIN} max={RAIL_MAX} side="left"
                  label="Navigation width" onChange={setRailWidth} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <StatusBar state={state} alerts={openAlerts} live={live} busy={busy}
                   remaining={remaining ?? 0} auto={auto}
                   onAuto={() => setAuto((a) => !a)}
                   onLive={() => setLive((l) => !l)}
                   onStep={onStep} onBell={() => onView('monitor')} />

        <main className={`flex-1 min-h-0 p-3 ${view === 'pipeline'
                          ? 'flex flex-col' : 'overflow-y-auto space-y-3'}`}>
          {!started && view !== 'settings' && (
            <EmptyBoard busy={busy} loadingProfile={loadingProfile} onLoad={onLoad} />
          )}

          {started && (view === 'queue' || view === 'monitor') && (
            <AlertBand rows={queue} busy={busy} onSelect={onSelect}
                       onReassess={onReassess} onAcknowledge={onAcknowledge}
                       onSeeAll={() => onView('monitor')} />
          )}

          {started && view === 'queue' && (
            <PatientQueue rows={queue} inCare={inCare} selectedId={selectedId}
                          pulsingId={pulsingId} canIntake={can.intake}
                          onSelect={onSelect} onNewPatient={() => setShowIntake(true)} />
          )}

          {started && view === 'monitor' && (
            <MonitorBoard rows={queue} selectedId={selectedId} busy={busy}
                          onSelect={onSelect} onReassess={onReassess} />
          )}

          {view === 'pipeline' && (
            <PipelineView detail={shown} metrics={metrics} refreshKey={refreshKey} />
          )}
          {view === 'registry' && <Registry refreshKey={refreshKey} />}
          {view === 'analytics' && (
            <ChunkBoundary>
              <Suspense fallback={<p className="text-xs text-ink-3 p-4">Loading analytics.</p>}>
                <Analytics metrics={metrics} rows={[...queue, ...inCare]} refreshKey={refreshKey} />
              </Suspense>
            </ChunkBoundary>
          )}
          {view === 'settings' && (
            <Settings state={state} remaining={remaining} busy={busy} auto={auto}
                      live={live} onLoad={onLoad} loadingProfile={loadingProfile}
                      onAuto={() => setAuto((a) => !a)} onLive={() => setLive((l) => !l)}
                      onAdvance={onAdvance} onSurge={onSurge} onRestart={onRestart} />
          )}
        </main>
      </div>

      {drawerOpen && (
        <PatientDrawer detail={shown} feedback={feedback} busy={busy}
                       width={drawerWidth} minWidth={DRAWER_MIN} maxWidth={DRAWER_MAX}
                       onResize={setDrawerWidth}
                       onClose={() => setDrawerOpen(false)} onAccept={onAccept}
                       onOverride={() => setShowOverride(true)} onReassess={onReassess}
                       onVitals={() => setShowVitals(true)} />
      )}
      {showIntake && (
        <IntakeForm onSubmit={onCreatePatient} onClose={() => setShowIntake(false)}
                    nextId={`WALKIN-${(queue.length + inCare.length + 1).toString().padStart(2, '0')}`} />
      )}
      {showOverride && shown && (
        <OverrideModal detail={shown} onSubmit={onOverride}
                       onClose={() => setShowOverride(false)} />
      )}
      {showVitals && shown && (
        <VitalsModal detail={shown} onSubmit={onRecordVitals}
                     onClose={() => setShowVitals(false)} />
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
