import { useState } from 'react'

export default function OverrideModal({ detail, onSubmit, onClose }) {
  const { intake, fused } = detail
  const [newEsi, setNewEsi] = useState(null)
  const [clinician, setClinician] = useState('RN-07')
  const [reason, setReason] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)

  const redFlags = fused.rules.red_flags || []
  // the service rejects this shape without an explicit acknowledgment: a
  // two-level downgrade of a flagged patient must not happen by mis-click
  const dangerous = newEsi != null
    && (fused.esi <= 2 || redFlags.length > 0)
    && newEsi >= fused.esi + 2

  const submit = async () => {
    setBusy(true)
    try {
      await onSubmit(intake.patient_id, {
        new_esi: newEsi, clinician_id: clinician, reason,
        acknowledge_risk: dangerous,
      })
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Override triage level</h2>
        <div className="modal-sub">
          {intake.display_name ?? intake.patient_id} · currently
          {' '}ESI-{fused.esi} at {fused.confidence} confidence
          {fused.paths_agree ? '' : ' (paths disagreed)'}
        </div>

        <label className="fld">New ESI level</label>
        <div className="esi-picker">
          {[1, 2, 3, 4, 5].map((l) => (
            <button key={l} className={`esi-pick p${l} ${newEsi === l ? 'on' : ''}`}
                    onClick={() => setNewEsi(l)}>
              {l}
              <span className="lvl">
                {['RESUS', 'EMERGENT', 'URGENT', 'LESS URG', 'NON URG'][l - 1]}
              </span>
            </button>
          ))}
        </div>

        <label className="fld">
          Reason <span className="req">*</span>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="Clinical judgment behind the change" />
        </label>

        <label className="fld">
          Clinician ID
          <input value={clinician} onChange={(e) => setClinician(e.target.value)} />
        </label>

        {dangerous && (
          <div className="risk-warning">
            <b>High-risk downgrade.</b> This patient stands at ESI-{fused.esi}
            {redFlags.length > 0 ? ` with ${redFlags.join(', ')}` : ''}. Moving
            them to ESI-{newEsi} will be recorded as a safety-flagged override.
            <label className="risk-ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I have reviewed the flagged risk and confirm this downgrade
            </label>
          </div>
        )}

        <div className="logged-note">
          Recorded to the audit trail: the original recommendation, the new
          level, your ID, the reason and the shift timestamp. The override
          also feeds the learning loop, so a pattern of escalations changes
          what the system recommends next time.
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-accept"
                  disabled={busy || newEsi == null || reason.trim().length < 3
                            || (dangerous && !ack)}
                  onClick={submit}>
            Confirm override
          </button>
        </div>
      </div>
    </div>
  )
}
