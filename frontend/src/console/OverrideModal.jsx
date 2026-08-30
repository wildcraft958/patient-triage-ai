import { useState } from 'react'
import { useDialog } from './useDialog'
import { useSession } from '../auth/sessionContext'
import { Btn, EsiBadge, Pill } from './ui'
import { ESI_BG, ESI_INK, ESI_LABEL } from './format'

const QUICK = ['Clinical judgment', 'Vitals trending', 'Patient report',
               'Red flag on exam']

export default function OverrideModal({ detail, onSubmit, onClose }) {
  const { user } = useSession()
  const { intake, fused } = detail
  const [newEsi, setNewEsi] = useState(null)
  const dialog = useDialog(onClose)
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
        new_esi: newEsi, clinician_id: user.badge_id, reason,
        acknowledge_risk: dangerous,
      })
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5">
      <div className="fixed inset-0 bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Override triage level"
           ref={dialog} tabIndex={-1}
           className="relative bg-card rounded-lg w-[560px] max-w-full max-h-[90vh] overflow-y-auto
                      border-t-4 border-brand shadow-lg">
        <header className="px-5 pt-5 pb-4 border-b border-line">
          <h2 className="text-lg font-bold tracking-tight text-ink">Override triage level</h2>
          <p className="mt-1 flex items-center gap-2 text-xs text-ink-2">
            {intake.display_name ?? intake.patient_id} · currently
            <EsiBadge esi={fused.esi} size="sm" />
            at {fused.confidence} confidence
            {!fused.paths_agree && <Pill tone="warn">Paths disagreed</Pill>}
          </p>
        </header>

        <div className="px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">
            New level
          </p>
          <div className="grid grid-cols-5 gap-2 mt-2.5">
            {[1, 2, 3, 4, 5].map((l) => {
              const on = newEsi === l
              return (
                <button key={l} onClick={() => { setNewEsi(l); setAck(false) }} aria-pressed={on}
                        className={`rounded-md border-2 py-2.5 cursor-pointer transition-colors
                                    ${on ? `${ESI_BG[l]} ${ESI_INK[l]} border-transparent`
                                         : 'bg-card border-line text-ink-2 hover:border-line-2'}`}>
                  <span className="block text-lg font-bold tabular-nums leading-none">{l}</span>
                  <span className="block text-[8.5px] font-bold uppercase tracking-wide mt-1
                                   opacity-80">
                    {ESI_LABEL[l]}
                  </span>
                </button>
              )
            })}
          </div>

          <label className="block mt-5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-2">
              Reason <span className="text-brand">*</span>
            </span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                      placeholder="The clinical judgment behind the change"
                      className="mt-1.5 w-full rounded-sm border border-line px-3 py-2 text-xs
                                 focus:border-brand focus:outline-2 focus:outline-brand focus:outline-offset-1 resize-y" />
          </label>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {QUICK.map((q) => (
              <button key={q} onClick={() => setReason(q)}
                      className="text-[10.5px] rounded-full border border-line px-2.5 py-1
                                 text-ink-2 hover:border-brand hover:text-brand-ink cursor-pointer">
                {q}
              </button>
            ))}
          </div>

          {dangerous && (
            <div className="mt-4 rounded-md border border-esi-2 border-l-4 bg-alert-bg
                            px-3.5 py-3 text-[11.5px] leading-relaxed text-alert-ink">
              <b>High-risk downgrade.</b> This patient stands at ESI-{fused.esi}
              {redFlags.length > 0 ? ` with ${redFlags.join(', ')}` : ''}. Moving them
              to ESI-{newEsi} will be recorded as a safety-flagged override.
              <label className="flex gap-2 items-start mt-2 font-semibold cursor-pointer">
                <input type="checkbox" checked={ack} className="mt-0.5"
                       onChange={(e) => setAck(e.target.checked)} />
                I have reviewed the flagged risk and confirm this downgrade
              </label>
            </div>
          )}

          <p className="mt-4 rounded-md bg-app px-3 py-2.5 text-[10.5px] leading-relaxed text-ink-2">
            Recorded for regulatory compliance: the original recommendation, the new
            level, your badge ({user.badge_id}), the reason and the shift timestamp.
            The override also feeds the learning loop, so a pattern of escalations
            changes what the system recommends next time.
          </p>
        </div>

        <footer className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary"
               disabled={busy || newEsi == null || reason.trim().length < 3
                         || (dangerous && !ack)}
               onClick={submit}>
            Confirm override
          </Btn>
        </footer>
      </div>
    </div>
  )
}
