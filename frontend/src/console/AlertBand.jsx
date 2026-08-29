import { EsiBadge } from './ui'

// Alerts sit above the queue because they are the one thing on this screen
// that cannot wait for a scan of the board. A patient who is actively
// getting worse outranks a clock that ran out, however long it has been:
// then acuity, then whoever has gone unattended longest.
const KIND_RANK = { DETERIORATION: 0, WAIT_BREACH: 1 }
const order = (a, b) =>
  (KIND_RANK[a.alert_kind] ?? 9) - (KIND_RANK[b.alert_kind] ?? 9)
  || a.esi - b.esi
  || b.waited_min - a.waited_min

// A band that grows without limit is a band nobody reads. The most acute
// few stay in front of the nurse; the rest are one click away on the board
// that exists to rank them.
const SHOWN = 4

export default function AlertBand({ rows, onSelect, onReassess, onAcknowledge,
                                    onSeeAll, busy }) {
  const alerts = rows.filter((r) => r.alert && !r.alert_acknowledged).sort(order)
  if (!alerts.length) return null
  const shown = alerts.slice(0, SHOWN)

  return (
    <div className="alert-band">
      <div className="alert-band-head">
        REASSESSMENT ALERTS ({alerts.length})
        {alerts.length > SHOWN && (
          <button className="btn btn-outline" onClick={onSeeAll}>
            {alerts.length - SHOWN} more on the waiting room board
          </button>
        )}
      </div>
      {shown.map((r) => {
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
