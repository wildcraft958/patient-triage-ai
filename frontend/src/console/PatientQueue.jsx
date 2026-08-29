import { BeliefPeak, EsiBadge, TrendArrows } from './ui'
import { fmtAge } from './format'

// The board a nurse reads: most acute first, and within a level the person
// who has been unattended longest. The reassessment priority order lives on
// its own tab; mixing the two orders in one table would hide both.
const byAcuity = (a, b) => a.esi - b.esi || b.waited_min - a.waited_min

const STATUS = {
  deteriorating: ['alarm', 'Alert'],
  reassess_due: ['due', 'Overdue'],
  waiting: ['', 'Waiting'],
  in_treatment: ['care', 'In care'],
}

function Row({ row, rank, selected, onSelect }) {
  const [tone, label] = STATUS[row.status] ?? ['', row.status]
  const done = row.status === 'in_treatment'
  const alarm = !!row.alert && !row.alert_acknowledged
  const pct = row.max_wait_min
    ? Math.min(100, (row.waited_min / row.max_wait_min) * 100) : 0

  return (
    <tr className={`${selected ? 'selected' : ''} ${alarm ? 'alarm' : ''} ${done ? 'done' : ''}`}
        onClick={() => onSelect(row.patient_id)}>
      <td className="rank">{rank}</td>
      <td>
        <div className="who">
          {row.display_name ?? row.patient_id}
          <span className="rec">{fmtAge(row.age_years, row.age_months)} · {row.patient_id}</span>
        </div>
        <div className="cc">{row.chief_complaint}</div>
      </td>
      <td><EsiBadge esi={row.esi} /></td>
      <td><BeliefPeak peak={row.belief_peak} pathsAgree={row.paths_agree} /></td>
      <td className="wait-cell num">
        {Math.round(row.waited_min)} min
        {!done && (
          <div className={`wait-bar ${pct >= 100 ? 'over' : ''}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </td>
      <td><TrendArrows worsening={row.vitals_worsening} /></td>
      <td>
        <span className={`status-pill ${tone}`}>{label}</span>
        {row.clinician_flag && !row.decided_by && (
          <span className="status-pill" style={{ marginLeft: 4 }}>Review</span>
        )}
      </td>
    </tr>
  )
}

export default function PatientQueue({ rows, inCare, selectedId, onSelect, onNewPatient }) {
  const ordered = [...rows].sort(byAcuity)
  return (
    <div className="panel tall">
      <h2>
        Patient queue
        <button className="btn btn-outline" onClick={onNewPatient}>+ New patient</button>
      </h2>
      {ordered.length === 0 && inCare.length === 0 && (
        <div className="empty">No patients on the board yet.</div>
      )}
      {(ordered.length > 0 || inCare.length > 0) && (
        <table className="board">
          <thead>
            <tr>
              <th>#</th><th>Patient</th><th>Acuity</th><th>Belief</th>
              <th>Waiting</th><th>Vitals</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row, i) => (
              <Row key={row.patient_id} row={row} rank={i + 1}
                   selected={row.patient_id === selectedId} onSelect={onSelect} />
            ))}
            {inCare.map((row) => (
              <Row key={row.patient_id} row={row} rank="·"
                   selected={row.patient_id === selectedId} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
