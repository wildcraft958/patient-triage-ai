import { TriangleAlert } from 'lucide-react'
import { useSession } from '../auth/sessionContext'
import { Btn, EsiBadge, Pill } from './ui'

// Alerts sit above the board because they are the one thing on this screen
// that cannot wait for a scan. A patient who is actively getting worse
// outranks a clock that ran out, however long it has been: then acuity,
// then whoever has gone unattended longest.
const KIND_RANK = { DETERIORATION: 0, WAIT_BREACH: 1 }
const order = (a, b) =>
  (KIND_RANK[a.alert_kind] ?? 9) - (KIND_RANK[b.alert_kind] ?? 9)
  || a.esi - b.esi
  || b.waited_min - a.waited_min

// A band that grows without limit is a band nobody reads.
const SHOWN = 3

export default function AlertBand({ rows, busy, onSelect, onReassess,
                                    onAcknowledge, onSeeAll }) {
  const { can } = useSession()
  const alerts = rows.filter((r) => r.alert && !r.alert_acknowledged).sort(order)
  if (!alerts.length) return null

  return (
    <section aria-label="Reassessment alerts" className="space-y-2">
      <div className="flex items-center gap-2">
        <TriangleAlert size={14} className="text-esi-2" aria-hidden="true" />
        <h2 className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-esi-2">
          Reassessment alerts ({alerts.length})
        </h2>
        {alerts.length > SHOWN && (
          <button onClick={onSeeAll}
                  className="text-[11px] font-semibold text-brand-ink hover:underline
                             cursor-pointer ml-auto">
            {alerts.length - SHOWN} more on the monitoring board
          </button>
        )}
      </div>

      {alerts.slice(0, SHOWN).map((r) => {
        const wait = r.alert_kind === 'WAIT_BREACH'
        // the audit message leads with the patient's name because the audit
        // trail has no other column for it; the band already shows who
        const who = r.display_name ?? r.patient_id
        const why = r.alert.startsWith(who) ? r.alert.slice(who.length).trim() : r.alert
        return (
          // A wait breach is a clock running out; deterioration is a patient
          // getting worse. Only the second one earns a tinted row, or the
          // common case drowns the rare one that matters.
          <article key={r.patient_id}
                   className={`flex items-center gap-3 rounded-md border border-l-4 px-3 py-2.5
                               ${wait ? 'bg-card border-line border-l-esi-4'
                                      : 'bg-alert-bg border-alert-line border-l-esi-2'}`}>
            <Pill tone={wait ? 'warn' : 'solid'}>
              {wait ? 'Wait limit' : 'Deteriorating'}
            </Pill>
            <EsiBadge esi={r.esi} size="sm" />
            <span className="text-[12.5px] font-bold text-ink whitespace-nowrap">
              {who}
            </span>
            <span className={`flex-1 text-[11.5px] leading-snug
                              ${wait ? 'text-ink-2' : 'text-alert-ink'}`}>
              {why}
            </span>
            <span className="flex gap-1.5 shrink-0">
              <Btn size="sm" onClick={() => onSelect(r.patient_id)}>View</Btn>
              {/* Reassess is the action the band is asking for, so it takes
                  the product's own colour. The acuity scale says how sick a
                  patient is, not how loud a button should be. */}
              {can.reassess && (
                <Btn size="sm" variant="primary" disabled={busy}
                     onClick={() => onReassess(r.patient_id)}>Reassess</Btn>
              )}
              {can.acknowledge && (
                <Btn size="sm" disabled={busy} onClick={() => onAcknowledge(r.patient_id)}
                     title="Records that you have seen this. The patient stays overdue.">
                  Acknowledge
                </Btn>
              )}
            </span>
          </article>
        )
      })}
    </section>
  )
}
