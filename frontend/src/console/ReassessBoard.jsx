import { EsiBadge, TrendArrows, fmtAge } from './ui'

// Rows arrive from the API already in reassessment-priority order: the
// policy over the acuity belief decides who is checked next, which is a
// different question from who is sickest.
const band = (p) => (p >= 0.6 ? 'bad' : p >= 0.4 ? '' : 'good')

export default function ReassessBoard({ rows, selectedId, onSelect, onReassess, busy }) {
  return (
    <div className="panel tall">
      <h2>
        Waiting room
        <span className="h2-note">ranked by reassessment priority, not by acuity</span>
      </h2>
      {rows.length === 0 && <div className="empty">Nobody is waiting.</div>}
      {rows.length > 0 && (
        <table className="board">
          <thead>
            <tr>
              <th>Patient</th><th>Acuity</th><th>In ED</th><th>Last check</th>
              <th>Vitals</th><th>Priority</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.patient_id}
                  className={`${row.patient_id === selectedId ? 'selected' : ''} ${row.action === 'REASSESS NOW' ? 'alarm' : ''}`}
                  onClick={() => onSelect(row.patient_id)}>
                <td>
                  <div className="who">
                    {row.display_name ?? row.patient_id}
                    <span className="rec">{fmtAge(row.age_years, row.age_months)} · {row.patient_id}</span>
                  </div>
                  <div className="cc">{row.category.replace(/_/g, ' ')}</div>
                </td>
                <td><EsiBadge esi={row.esi} /></td>
                <td className="num">{Math.round(row.in_ed_min)} min</td>
                <td className="num">{Math.round(row.waited_min)} min ago</td>
                <td><TrendArrows worsening={row.vitals_worsening} /></td>
                <td className="num" style={{ minWidth: 78 }}>
                  <b>{row.priority?.toFixed(2)}</b>
                  <div className="bar-track">
                    <i className={band(row.priority)} style={{ width: `${(row.priority ?? 0) * 100}%` }} />
                  </div>
                </td>
                <td>
                  {row.action === 'REASSESS NOW' ? (
                    <button className="btn btn-danger" disabled={busy}
                            onClick={(e) => { e.stopPropagation(); onReassess(row.patient_id) }}>
                      Reassess now
                    </button>
                  ) : (
                    <span className="status-pill">Monitor</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
