import { EsiBadge } from './ui'

// Alerts sit above the queue because they are the one thing on this screen
// that cannot wait for a scan of the board. Acuity first, then whoever has
// been unattended longest.
const order = (a, b) => a.esi - b.esi || b.waited_min - a.waited_min

export default function AlertBand({ rows, onSelect, onReassess, onAcknowledge, busy }) {
  const alerts = rows.filter((r) => r.alert && !r.alert_acknowledged).sort(order)
  if (!alerts.length) return null

  return (
    <div className="alert-band">
      <div className="alert-band-head">
        REASSESSMENT ALERTS ({alerts.length})
      </div>
      {alerts.map((r) => {
        const wait = r.alert_kind === 'WAIT_BREACH'
        return (
          <div key={r.patient_id} className={`alert-row ${wait ? 'wait' : ''}`}>
            <span className={`alert-kind ${wait ? 'wait' : ''}`}>
              {wait ? 'WAIT LIMIT' : 'DETERIORATING'}
            </span>
            <EsiBadge esi={r.esi} />
            <span className="who">{r.display_name ?? r.patient_id}</span>
            <span className="why">{r.alert}</span>
            <span className="alert-actions">
              <button className="btn btn-outline" onClick={() => onSelect(r.patient_id)}>
                View
              </button>
              <button className="btn btn-danger" disabled={busy}
                      onClick={() => onReassess(r.patient_id)}>
                Reassess
              </button>
              <button className="btn btn-outline" disabled={busy}
                      onClick={() => onAcknowledge(r.patient_id)}
                      title="Records that you have seen this alert. The patient stays overdue.">
                Acknowledge
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
