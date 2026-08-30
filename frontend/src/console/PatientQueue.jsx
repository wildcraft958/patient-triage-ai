import { ChevronRight, Plus } from 'lucide-react'
import { BeliefPeak, Btn, Card, CardHead, Empty, EsiBadge, Initials, Meter, Pill, TrendArrows } from './ui'
import { fmtAge } from './format'

// The board a nurse reads: most acute first, and within a level the person
// who has gone unattended longest. Reassessment priority is a different
// question and has its own screen; mixing the two orders would hide both.
const byAcuity = (a, b) => a.esi - b.esi || b.waited_min - a.waited_min

const STATUS = {
  deteriorating: ['alert', 'Alert'],
  reassess_due: ['warn', 'Overdue'],
  waiting: ['neutral', 'Waiting'],
  in_treatment: ['ok', 'In care'],
}

function Row({ row, rank, selected, pulsing, onSelect }) {
  const [tone, label] = STATUS[row.status] ?? ['neutral', row.status]
  const done = row.status === 'in_treatment'
  // Only an actively worsening patient tints a row. A wait breach already
  // reads as Overdue with a full red bar, and if half the board glows the
  // glow stops meaning anything.
  const alarm = row.alert_kind === 'DETERIORATION' && !row.alert_acknowledged
  const pct = row.max_wait_min ? (row.waited_min / row.max_wait_min) * 100 : 0

  return (
    <tr onClick={() => onSelect(row.patient_id)}
        className={`cursor-pointer border-b border-line last:border-0 transition-colors
                    ${done ? 'opacity-55' : ''}
                    ${pulsing ? 'bg-info-bg' : alarm ? 'bg-alert-bg' : ''}
                    ${selected ? 'bg-brand-tint' : 'hover:bg-app'}`}>
      <td className="pl-4 pr-1 py-2.5 text-[11px] text-ink-3 tabular-nums w-8">{rank}</td>
      <td className="py-2.5 pr-3">
        {/* A real button, not just a row click: opening a record is the most
            used action on this board and it has to have a keyboard stop. */}
        <button onClick={(e) => { e.stopPropagation(); onSelect(row.patient_id) }}
                className="flex items-center gap-2.5 text-left w-full cursor-pointer
                           rounded-sm focus-visible:outline-2 focus-visible:outline-brand
                           focus-visible:outline-offset-2">
          <Initials name={row.display_name} id={row.patient_id} />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-ink truncate">
              {row.display_name ?? row.patient_id}
              <span className="ml-1.5 text-[11px] font-normal text-ink-3 tabular-nums">
                {fmtAge(row.age_years, row.age_months)}
              </span>
              <span className="ml-1.5 text-[10px] font-normal text-ink-3">
                {row.patient_id}
              </span>
            </span>
            <span className="block text-[11px] text-ink-2 truncate max-w-[34ch]">
              {row.chief_complaint}
            </span>
          </span>
        </button>
      </td>
      <td className="py-2.5 pr-3"><EsiBadge esi={row.esi} /></td>
      <td className="py-2.5 pr-3">
        <BeliefPeak peak={row.belief_peak} assigned={row.esi} pathsAgree={row.paths_agree}
                    confidence={row.confidence} />
      </td>
      <td className="py-2.5 pr-3 w-[92px]">
        <span className="text-xs text-ink tabular-nums">
          {Math.round(row.waited_min)} min
        </span>
        {!done && (
          <Meter value={pct} tone={pct >= 100 ? 'alert' : 'brand'} className="mt-1" />
        )}
      </td>
      <td className="py-2.5 pr-3"><TrendArrows worsening={row.vitals_worsening} /></td>
      <td className="py-2.5 pr-3">
        <Pill tone={tone}>{label}</Pill>
        {row.clinician_flag && !row.decided_by && (
          <Pill tone="warn" className="ml-1">Review</Pill>
        )}
      </td>
      <td className="pr-3 text-ink-3">
        <ChevronRight size={15} aria-hidden="true" />
      </td>
    </tr>
  )
}

const HEADS = ['#', 'Patient', 'Acuity', 'Confidence', 'Waiting', 'Vitals', 'Status', '']

export default function PatientQueue({ rows, inCare, selectedId, pulsingId,
                                       canIntake, onSelect, onNewPatient }) {
  const ordered = [...rows].sort(byAcuity)
  const empty = ordered.length === 0 && inCare.length === 0

  return (
    <Card>
      <CardHead title="Patient queue"
                note="Most acute first, then longest unattended">
        {canIntake && (
          <Btn size="sm" onClick={onNewPatient}>
            <Plus size={13} aria-hidden="true" /> New patient
          </Btn>
        )}
      </CardHead>

      {empty && <Empty>Nobody is on the board yet.</Empty>}

      {!empty && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                {HEADS.map((h, i) => (
                  <th key={i} className={`text-left text-[10px] font-bold uppercase
                                          tracking-[0.1em] text-ink-3 pb-2 pt-3
                                          ${i === 0 ? 'pl-4' : ''} pr-3`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((row, i) => (
                <Row key={row.patient_id} row={row} rank={i + 1} pulsing={pulsingId === row.patient_id}
                     selected={row.patient_id === selectedId} onSelect={onSelect} />
              ))}
              {inCare.map((row) => (
                <Row key={row.patient_id} row={row} rank="·" pulsing={false}
                     selected={row.patient_id === selectedId} onSelect={onSelect} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
