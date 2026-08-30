import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSession } from '../auth/sessionContext'
import { Btn, Card, CardHead, Empty, EsiBadge, Initials, Meter, Pill, TrendArrows } from './ui'
import { fmtAge } from './format'

// Rows arrive from the API already in reassessment-priority order: the
// policy over the acuity belief decides who is checked next, which is a
// different question from who is sickest.
const band = (p) => (p >= 0.6 ? 'alert' : p >= 0.4 ? 'warn' : 'ok')

function Formula() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(!open)}
              className="flex items-center gap-1 text-[11px] font-semibold text-brand-ink
                         cursor-pointer hover:underline">
        <ChevronDown size={13} className={open ? '' : '-rotate-90'} aria-hidden="true" />
        How priority is computed
      </button>
      {open && (
        <p className="mt-2 rounded-md bg-app px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
          <code className="text-brand-ink font-semibold">
            priority = deterioration_risk × wait_pressure × acuity_uncertainty × severity
          </code>
          <br />
          Deterioration risk comes from the trend in recorded vitals. Wait pressure
          is time unassessed against the safe wait for that level. Acuity
          uncertainty is the spread of the belief the monitor holds over ESI 1 to 5,
          which widens the longer a patient waits without being seen.
        </p>
      )}
    </>
  )
}

export default function MonitorBoard({ rows, selectedId, busy, onSelect, onReassess }) {
  const { can } = useSession()
  return (
    <Card>
      <CardHead title="Waiting room monitoring"
                note={`${rows.length} waiting, ranked by reassessment priority rather than acuity`} />
      {rows.length === 0 && <Empty>Nobody is waiting.</Empty>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {['Patient', 'Acuity', 'In ED', 'Last check', 'Vitals', 'Priority', ''].map((h, i) => (
                  <th key={i} className={`text-left text-[10px] font-bold uppercase
                                          tracking-[0.1em] text-ink-3 pb-2 pt-3
                                          ${i === 0 ? 'pl-4' : ''} pr-3`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const urgent = row.action === 'REASSESS NOW'
                return (
                  <tr key={row.patient_id} onClick={() => onSelect(row.patient_id)}
                      className={`cursor-pointer border-b border-line last:border-0
                                  ${urgent ? 'bg-alert-bg' : ''}
                                  ${row.patient_id === selectedId ? 'bg-brand-tint' : 'hover:bg-app'}`}>
                    <td className="pl-4 pr-3 py-2.5">
                      <button onClick={(e) => { e.stopPropagation(); onSelect(row.patient_id) }}
                              className="flex items-center gap-2.5 text-left w-full cursor-pointer
                                         rounded-sm focus-visible:outline-2
                                         focus-visible:outline-brand focus-visible:outline-offset-2">
                        <Initials name={row.display_name} id={row.patient_id} />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-ink truncate">
                            {row.display_name ?? row.patient_id}
                            <span className="ml-1.5 text-[11px] font-normal text-ink-3 tabular-nums">
                              {fmtAge(row.age_years, row.age_months)}
                            </span>
                          </span>
                          <span className="block text-[11px] text-ink-2">
                            {row.category.replace(/_/g, ' ')}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="pr-3 py-2.5"><EsiBadge esi={row.esi} /></td>
                    <td className="pr-3 py-2.5 text-xs text-ink tabular-nums">
                      {Math.round(row.in_ed_min)} min
                    </td>
                    <td className="pr-3 py-2.5 text-xs text-ink tabular-nums">
                      {Math.round(row.waited_min)} min ago
                    </td>
                    <td className="pr-3 py-2.5"><TrendArrows worsening={row.vitals_worsening} /></td>
                    <td className="pr-3 py-2.5 w-[86px]">
                      <span className="text-xs font-bold text-ink tabular-nums">
                        {row.priority?.toFixed(2)}
                      </span>
                      <Meter value={(row.priority ?? 0) * 100} tone={band(row.priority)}
                             className="mt-1" />
                    </td>
                    <td className="pr-3 py-2.5">
                      {urgent && can.reassess ? (
                        <Btn size="sm" variant="danger" disabled={busy}
                             onClick={(e) => { e.stopPropagation(); onReassess(row.patient_id) }}>
                          Reassess now
                        </Btn>
                      ) : (
                        <Pill tone={urgent ? 'alert' : 'neutral'}>
                          {urgent ? 'Reassess now' : 'Monitor'}
                        </Pill>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-3 border-t border-line"><Formula /></div>
    </Card>
  )
}
