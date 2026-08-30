import { useEffect, useState } from 'react'
import * as api from '../api'
import { useSession } from '../auth/sessionContext'
import { RESTRICTED } from '../auth/roles'
import { Btn, Card, CardHead, Empty, Pill } from './ui'
import { ESI_LABEL, SHIFTS, UNIT_LABEL } from './format'


function Item({ label, value, note }) {
  return (
    <div className="py-2 border-b border-line last:border-0">
      <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
        <span className="text-ink-2">{label}</span>
        <b className="text-ink tabular-nums shrink-0">{value}</b>
      </div>
      {note && <p className="text-[10.5px] text-ink-3 mt-0.5">{note}</p>}
    </div>
  )
}

function Config({ profile }) {
  if (!profile) return <Empty>Loading the department configuration.</Empty>
  const d = profile.deterioration
  const waits = Object.entries(profile.max_wait_min)
    .sort((a, b) => Number(a[0]) - Number(b[0]))

  return (
    <>
      <p className="text-[11.5px] leading-relaxed text-ink-2 pb-2">
        Read from <code className="text-brand-ink">config/{profile.profile_name}.yaml</code>.
        One file per hospital is how the same assistant serves a rural department
        and a trauma center without a code change.
      </p>
      <Item label="Treatment bays" value={profile.treatment_bays} />
      <Item label="Surge threshold" value={`${profile.surge_queue_threshold} waiting`}
            note="Queue length at which the reasoning path defers to the enrichment queue" />
      <Item label="Reassessment sweep" value={`every ${profile.reassess_check_interval_min} min`} />
      <Item label="Alert cooldown" value={`${profile.alert_cooldown_min} min`}
            note="Rate limit on repeat trend-deterioration alerts for the same patient" />
      <div className="pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 mb-1.5">
          Safe wait before reassessment is due
        </p>
        {waits.map(([esi, minutes]) => (
          <Item key={esi} label={`ESI-${esi} · ${ESI_LABEL[esi]}`} value={`${minutes} min`} />
        ))}
      </div>
      <div className="pt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 mb-1.5">
          Deterioration thresholds
        </p>
        <Item label="Heart rate rise" value={`${d.hr_rise_pct}%`} />
        <Item label="Systolic drop" value={`${d.sbp_drop_pct}%`} />
        <Item label="SpO2 drop" value={`${d.spo2_drop_points} points`} />
        <Item label="Temperature rise" value={`${d.temp_rise_c} °C`} />
      </div>
    </>
  )
}

export default function Settings({ state, remaining, busy, auto, live,
                                   onLoad, onAuto, onLive, onAdvance, onSurge, onRestart }) {
  const { user, role, signOut, can } = useSession()
  const [profile, setProfile] = useState(null)

  useEffect(() => { api.getProfile().then(setProfile).catch(() => {}) }, [state?.profile])

  const running = remaining != null

  return (
    <div className="grid lg:grid-cols-2 gap-3 items-start">
      <Card>
        <CardHead title="Shift"
                  note={state?.profile ? UNIT_LABEL[state.profile] : 'No shift loaded'} />
        <div className="p-4 space-y-2.5">
          {SHIFTS.map((s) => {
            const on = state?.profile === s.profile
            return (
              <button key={s.profile} disabled={busy || !can.settings}
                      onClick={() => onLoad(s.profile, s.speedup)}
                      className={`w-full text-left rounded-md border p-3.5 transition-colors
                                  disabled:opacity-50 disabled:cursor-default
                                  ${on ? 'border-brand bg-brand-tint' : 'border-line hover:border-line-2'}
                                  ${can.settings ? 'cursor-pointer' : ''}`}>
                <span className="flex items-center gap-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-brand">
                    {s.tag}
                  </span>
                  {on && <Pill tone="brand">Loaded</Pill>}
                </span>
                <span className="block text-sm font-bold text-ink mt-1.5">{s.title}</span>
                <span className="block text-[11.5px] leading-relaxed text-ink-2 mt-1">{s.body}</span>
              </button>
            )
          })}
          {running && can.settings && (
            <Btn onClick={onRestart} disabled={busy}>Clear the board</Btn>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHead title="Department clock and load" />
          <div className="p-4 flex flex-wrap gap-2">
            <Btn variant={live ? 'danger' : 'outline'} onClick={onLive}
                 disabled={!can.settings} title={can.settings ? undefined : RESTRICTED}>
              {live ? 'Pause the clock' : 'Run the clock live'}
            </Btn>
            {running && (
              <Btn variant={auto ? 'danger' : 'outline'} onClick={onAuto}
                   disabled={remaining === 0 || !can.settings}>
                {auto ? 'Pause arrivals' : 'Play arrivals'}
              </Btn>
            )}
            <Btn disabled={busy || !can.settings} onClick={() => onAdvance(15)}>
              Advance 15 min
            </Btn>
            {/* forcing surge drops the whole pipeline to the deterministic
                fast path; that is not a read-only action */}
            <Btn variant={state?.surge_mode ? 'danger' : 'outline'} onClick={onSurge}
                 disabled={!can.settings} title={can.settings ? undefined : RESTRICTED}>
              {state?.surge_mode ? 'Release surge' : 'Force surge'}
            </Btn>
          </div>
          <p className="px-4 pb-4 text-[11px] leading-relaxed text-ink-3">
            Live mode advances the department clock one minute every four seconds.
            Wait times, reassessment priorities and alert thresholds all derive
            from that clock, so they stay in agreement while it runs.
          </p>
        </Card>

        <Card>
          <CardHead title="Session" />
          <div className="p-4">
            <p className="text-[11.5px] text-ink-2">
              Signed in as <b className="text-ink">{user.name}</b>, {role.title},
              badge <b className="text-ink tabular-nums">{user.badge_id}</b>. Every
              decision you make on the board carries this badge into the audit trail.
            </p>
            <Btn className="mt-3" onClick={signOut}>Sign out</Btn>
          </div>
        </Card>
      </div>

      <Card className="lg:col-span-2">
        <CardHead title="Department configuration"
                  note="The thresholds the monitor is actually reading right now" />
        <div className="px-4 pb-4 pt-1 grid md:grid-cols-2 gap-x-8">
          <Config profile={profile} />
        </div>
      </Card>
    </div>
  )
}
