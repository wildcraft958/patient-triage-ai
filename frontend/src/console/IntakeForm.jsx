import { useState } from 'react'
import { useDialog } from './useDialog'
import { Mic, PencilLine } from 'lucide-react'
import ComplaintComposer from './ComplaintComposer'
import { Btn } from './ui'
import { categoryLabel } from './format'

const CATEGORIES = ['other', 'chest_pain', 'breathing_difficulty', 'stroke_signs',
  'trauma_major', 'sepsis_concern', 'allergic_reaction', 'pregnancy_complication',
  'self_harm', 'abdominal_pain', 'fever', 'laceration', 'sprain', 'rash',
  'medication_refill', 'minor']

const OLDCARTS_FIELDS = [
  ['onset', 'O', 'Onset', 'When did this start?'],
  ['location', 'L', 'Location', 'Where does it hurt?'],
  ['duration', 'D', 'Duration', 'How long has this been going on?'],
  ['characteristics', 'C', 'Characteristics', 'Describe the pain'],
  ['aggravating_alleviating', 'A', 'Aggravating / Alleviating', 'What makes it better or worse?'],
  ['radiation', 'R', 'Radiation', 'Does it spread anywhere?'],
  ['timing_triggers', 'T', 'Timing / Triggers', 'Constant or comes and goes?'],
]

export default function IntakeForm({ onSubmit, onClose, nextId }) {
  const [f, setF] = useState({ patient_id: nextId, display_name: '', age_years: '',
    chief_complaint: '', complaint_category: 'other', responsiveness: 'alert' })
  const dialog = useDialog(onClose)
  const [vit, setVit] = useState({})
  const [oc, setOc] = useState({})
  const [severity, setSeverity] = useState('')
  const [error, setError] = useState('')
  const [composing, setComposing] = useState(false)
  const [dictating, setDictating] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    const oldcartsAnswers = Object.fromEntries(
      Object.entries(oc).filter(([, v]) => v && v.trim()))
    if (severity !== '') oldcartsAnswers.severity = Number(severity)
    const body = {
      ...f,
      display_name: f.display_name.trim() || null,
      age_years: Number(f.age_years),
      vitals: Object.fromEntries(
        Object.entries(vit).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
      ...(Object.keys(oldcartsAnswers).length ? { oldcarts: oldcartsAnswers } : {}),
    }
    setBusy(true)
    // a duplicate patient record is a real consequence, not a cosmetic one
    try { await onSubmit(body) } catch (e) { setError(String(e.message || e)) }
    finally { setBusy(false) }
  }

  const FIELD = 'flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-3'
  const INPUT = 'rounded-sm border border-line px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-ink focus:border-brand focus:outline-2 focus:outline-brand focus:outline-offset-1 w-full'

  const vitField = (key, label) => (
    <label key={key} className={FIELD}>
      <span>{label}</span>
      <input type="number" className={INPUT} value={vit[key] ?? ''}
             onChange={(e) => setVit({ ...vit, [key]: e.target.value })} />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5">
      <div className="fixed inset-0 bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="New arrival"
           ref={dialog} tabIndex={-1}
           className="relative bg-card rounded-lg w-[680px] max-w-full max-h-[90vh] overflow-y-auto
                      border-t-4 border-brand shadow-lg px-5 py-5">
        <h2 className="text-lg font-bold tracking-tight text-ink mb-4">New arrival</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <label className={FIELD}><span>Patient name</span>
            <input className={INPUT} value={f.display_name} placeholder="M. Chen"
                   onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
          <label className={FIELD}><span>Record ID</span>
            <input className={INPUT} value={f.patient_id}
                   onChange={(e) => setF({ ...f, patient_id: e.target.value })} /></label>
          <label className={FIELD}><span>Age (years)</span>
            <input className={INPUT} type="number" value={f.age_years}
                   onChange={(e) => setF({ ...f, age_years: e.target.value })} /></label>
          <label className={FIELD}><span>Category</span>
            <select className={INPUT} value={f.complaint_category}
                    onChange={(e) => setF({ ...f, complaint_category: e.target.value })}>
              {CATEGORIES.map((c) =>
                <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select></label>
          <label className={FIELD}><span>Responsiveness (AVPU)</span>
            <select className={INPUT} value={f.responsiveness}
                    onChange={(e) => setF({ ...f, responsiveness: e.target.value })}>
              {['alert', 'verbal', 'pain', 'unresponsive'].map((r) =>
                <option key={r} value={r}>{r}</option>)}
            </select></label>
        </div>
        <div className="mt-5 mb-2 pb-1.5 border-b border-line text-[11px] font-bold uppercase tracking-[0.1em] text-brand-ink">Chief complaint, in the patient's words</div>
        <div className="flex items-start gap-2">
          <button type="button" onClick={() => setComposing(true)}
                  className={`flex-1 min-w-0 text-left rounded-sm border px-3 py-2.5
                              cursor-pointer transition-colors flex items-start gap-2.5
                              ${f.chief_complaint
                                ? 'border-line bg-card hover:border-brand'
                                : 'border-dashed border-line-2 bg-app hover:border-brand'}`}>
            <PencilLine size={14} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
            <span className={`text-[12.5px] leading-relaxed
                              ${f.chief_complaint ? 'text-ink' : 'text-ink-3'}`}>
              {f.chief_complaint || 'What brought you in today? Click to write it down.'}
            </span>
          </button>
          {/* The control is here because triage is spoken before it is typed.
              It does not pretend to work: nothing records, and saying so on
              the click is better than a dead button or a promise on a slide. */}
          <button type="button" onClick={() => setDictating((d) => !d)}
                  aria-label="Dictate the complaint" aria-expanded={dictating}
                  className="shrink-0 rounded-sm border border-line-2 bg-card p-2.5
                             text-ink-2 cursor-pointer transition-colors
                             hover:border-brand hover:text-brand-ink
                             focus-visible:outline-2 focus-visible:outline-brand
                             focus-visible:outline-offset-1">
            <Mic size={15} aria-hidden="true" />
          </button>
        </div>
        {dictating && (
          <p role="status" className="mt-2 rounded-sm border border-brand-line
                                      bg-brand-tint px-3 py-2 text-[11.5px]
                                      leading-relaxed text-ink-2">
            <b className="text-ink">Voice dictation is coming.</b> It is not
            recording yet, so type the complaint for now.
          </p>
        )}
        <div className="mt-5 mb-2 pb-1.5 border-b border-line text-[11px] font-bold uppercase tracking-[0.1em] text-brand-ink">Vitals (leave blank if not yet recorded)</div>
        <div className="grid grid-cols-3 gap-2.5">
          {vitField('hr', 'HR')}{vitField('rr', 'RR')}{vitField('spo2', 'SpO2 %')}
          {vitField('temp_c', 'Temp C')}{vitField('sbp', 'SBP')}{vitField('pain', 'Pain 0-10')}
        </div>
        <div className="mt-5 mb-2 pb-1.5 border-b border-line text-[11px] font-bold uppercase tracking-[0.1em] text-brand-ink">OLDCARTS structured interview (optional)</div>
        <div className="grid grid-cols-2 gap-2.5">
          {OLDCARTS_FIELDS.map(([key, letter, name, q]) => (
            <label key={key} className={FIELD}>
              <span><b>{letter}</b> {name} · "{q}"</span>
              <input className={INPUT} value={oc[key] ?? ''}
                     onChange={(e) => setOc({ ...oc, [key]: e.target.value })} />
            </label>
          ))}
          <label className={FIELD}>
            <span><b>S</b> Severity · 0-10 scale</span>
            <input className={INPUT} type="number" min={0} max={10} value={severity}
                   onChange={(e) => setSeverity(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="mt-4 rounded-md border border-esi-2 border-l-4 bg-alert-bg px-3 py-2
                        text-[11.5px] font-semibold text-alert-ink">{error}</p>
        )}
        {composing && (
          <ComplaintComposer value={f.chief_complaint}
                             onSave={(text) => { setF({ ...f, chief_complaint: text }); setComposing(false) }}
                             onClose={() => setComposing(false)} />
        )}

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-line">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary"
               disabled={busy || !f.patient_id || f.age_years === ''
                         || f.chief_complaint.length < 3}
               onClick={submit}>Triage this patient</Btn>
        </div>
      </div>
    </div>
  )
}
