import { BedDouble, Bell, Clock, Radio, Users } from 'lucide-react'
import { Btn } from './ui'
import { UNIT_LABEL, shiftClock } from './format'

const LOAD = {
  normal: ['Normal', 'bg-esi-5'],
  busy: ['Busy', 'bg-esi-4'],
  surge: ['Surge', 'bg-esi-2 animate-pulse'],
}

function Group({ icon: Icon, children, title, at = 'md' }) {
  const show = { md: 'hidden md:inline-flex', lg: 'hidden lg:inline-flex',
                 xl: 'hidden xl:inline-flex' }[at]
  return (
    <span className={`${show} items-center gap-1.5 text-[11.5px] text-ink-2
                      whitespace-nowrap`} title={title}>
      <Icon size={14} className="text-ink-3 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

export default function StatusBar({ state, alerts, live, busy, remaining,
                                    onLive, onStep, onBell }) {
  const load = state?.load ?? 'normal'
  const [label, dot] = LOAD[load] ?? LOAD.normal
  const surge = load === 'surge'

  return (
    <header className={`h-12 shrink-0 flex items-center gap-4 px-4 border-b
                        ${surge ? 'bg-alert-bg border-esi-2' : 'bg-card border-line'}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2
                       hidden xl:block whitespace-nowrap">
        {UNIT_LABEL[state?.profile] ?? 'Emergency department'}
      </span>

      <span className="flex items-center gap-1.5 text-sm font-bold text-ink tabular-nums
                       whitespace-nowrap shrink-0">
        <Clock size={14} className="text-ink-3" aria-hidden="true" />
        {shiftClock(state?.sim_min)}
      </span>

      <Group icon={Users} title="On the board now">
        <b className="text-ink tabular-nums">{state?.total_patients ?? 0}</b> patients
        <span className="text-ink-3">·</span>
        <b className="text-ink tabular-nums">{state?.in_care ?? 0}</b> in care
        <span className="text-ink-3">·</span>
        <b className="text-ink tabular-nums">{state?.waiting ?? 0}</b> waiting
      </Group>

      <Group icon={BedDouble} at="lg"
             title="Treatment bays declared in the hospital profile">
        <b className="text-ink tabular-nums">{state?.beds_available ?? 0}</b>
        of {state?.treatment_bays ?? 0} bays free
      </Group>

      <Group icon={Clock} at="xl"
             title="Mean time since last assessment, waiting patients only">
        avg wait <b className="text-ink tabular-nums">
          {Math.round(state?.avg_wait_min ?? 0)} min
        </b>
      </Group>

      <span className="ml-auto flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold
                         uppercase tracking-wide text-ink-2">
          <i className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
          {label}
        </span>

        <button onClick={onBell} title={`${alerts} alerts needing an answer`}
                className="relative p-1.5 rounded-sm hover:bg-app cursor-pointer text-ink-2">
          <Bell size={16} aria-hidden="true" />
          {alerts > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1
                             rounded-full bg-esi-2 text-esi-ink text-[9px] font-bold
                             grid place-items-center tabular-nums">
              {alerts}
            </span>
          )}
        </button>

        <Btn size="sm" variant={live ? 'danger' : 'outline'} onClick={onLive}
             title="Advance the department clock in real time">
          <Radio size={12} aria-hidden="true" />
          {live ? 'Live' : 'Go live'}
        </Btn>

        {remaining > 0 && (
          <Btn size="sm" variant="primary" disabled={busy} onClick={onStep}>
            Next event ({remaining})
          </Btn>
        )}
      </span>
    </header>
  )
}
