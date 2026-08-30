import { useState } from 'react'
import { useDialog } from './useDialog'
import { Btn } from './ui'
import { VITAL_DEFS } from './format'

// The medical assistant's action. Posting vitals is what feeds the
// deterioration trigger, so this is the second role's real place in the
// workflow rather than a label on a badge.
export default function VitalsModal({ detail, onSubmit, onClose }) {
  const latest = detail.vitals_history?.[detail.vitals_history.length - 1]?.vitals ?? {}
  const [values, setValues] = useState(() =>
    Object.fromEntries(VITAL_DEFS.map(({ key }) => [key, latest[key] ?? ''])))
  const dialog = useDialog(onClose)
  const [busy, setBusy] = useState(false)

  const set = (key, v) => setValues((s) => ({ ...s, [key]: v }))

  const submit = async () => {
    setBusy(true)
    try {
      const payload = Object.fromEntries(
        Object.entries(values)
          .filter(([, v]) => v !== '' && v != null)
          .map(([k, v]) => [k, Number(v)]))
      await onSubmit(detail.intake.patient_id, payload)
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5">
      <div className="fixed inset-0 bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Record vitals"
           ref={dialog} tabIndex={-1}
           className="relative bg-card rounded-lg w-[460px] max-w-full border-t-4 border-brand shadow-lg">
        <header className="px-5 pt-5 pb-4 border-b border-line">
          <h2 className="text-lg font-bold tracking-tight text-ink">Record vitals</h2>
          <p className="mt-1 text-xs text-ink-2">
            {detail.intake.display_name ?? detail.intake.patient_id} · prefilled with
            the last reading. A worsening trend re-triages automatically.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-2.5 px-5 py-4">
          {VITAL_DEFS.map(({ key, label, unit }) => (
            <label key={key} className="block">
              <span className="text-[10px] font-bold uppercase tracking-wide text-ink-3">
                {label}{unit && ` ${unit}`}
              </span>
              <input type="number" step="any" value={values[key]}
                     onChange={(e) => set(key, e.target.value)}
                     className="mt-1 w-full rounded-sm border border-line px-2 py-1.5 text-sm
                                tabular-nums focus:border-brand focus:outline-2 focus:outline-brand focus:outline-offset-1" />
            </label>
          ))}
        </div>

        <footer className="flex justify-end gap-2 px-5 py-4 border-t border-line">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy} onClick={submit}>Record</Btn>
        </footer>
      </div>
    </div>
  )
}
