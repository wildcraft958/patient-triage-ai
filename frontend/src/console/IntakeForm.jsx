import { useState } from 'react'

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
  const [vit, setVit] = useState({})
  const [oc, setOc] = useState({})
  const [severity, setSeverity] = useState('')
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')

  const dictate = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Voice dictation is not supported in this browser'); return }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const heard = e.results[0][0].transcript
      setF((prev) => ({ ...prev, chief_complaint: (prev.chief_complaint + ' ' + heard).trim() }))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    setListening(true)
    rec.start()
  }

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
    try { await onSubmit(body) } catch (e) { setError(String(e.message || e)) }
  }

  const vitField = (key, label) => (
    <label key={key} className="if-field">
      <span>{label}</span>
      <input type="number" value={vit[key] ?? ''}
             onChange={(e) => setVit({ ...vit, [key]: e.target.value })} />
    </label>
  )

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>New arrival</h2>
        <div className="modal-sub">
          The name stays on this screen. Only age, complaint, vitals and history
          reach the reasoning path, and the complaint is redacted on the way.
        </div>
        <div className="if-grid">
          <label className="if-field"><span>Patient name</span>
            <input value={f.display_name} placeholder="M. Chen"
                   onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
          <label className="if-field"><span>Record ID</span>
            <input value={f.patient_id}
                   onChange={(e) => setF({ ...f, patient_id: e.target.value })} /></label>
          <label className="if-field"><span>Age (years)</span>
            <input type="number" value={f.age_years}
                   onChange={(e) => setF({ ...f, age_years: e.target.value })} /></label>
          <label className="if-field"><span>Category</span>
            <select value={f.complaint_category}
                    onChange={(e) => setF({ ...f, complaint_category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>
                {c === 'other' ? 'auto (from complaint text)' : c}</option>)}
            </select></label>
          <label className="if-field"><span>Responsiveness (AVPU)</span>
            <select value={f.responsiveness}
                    onChange={(e) => setF({ ...f, responsiveness: e.target.value })}>
              {['alert', 'verbal', 'pain', 'unresponsive'].map((r) =>
                <option key={r} value={r}>{r}</option>)}
            </select></label>
        </div>
        <label className="if-field"><span>Chief complaint, in the patient's words</span>
          <div className="if-voice">
            <textarea rows={2} value={f.chief_complaint}
                      onChange={(e) => setF({ ...f, chief_complaint: e.target.value })}
                      placeholder="What brought you in today?" />
            <button className={`btn btn-outline mic ${listening ? 'on' : ''}`}
                    onClick={dictate} title="Dictate with your voice">
              {listening ? 'Listening…' : 'Voice'}
            </button>
          </div>
        </label>
        <div className="if-section">Vitals (leave blank if not yet recorded)</div>
        <div className="if-grid">
          {vitField('hr', 'HR')}{vitField('rr', 'RR')}{vitField('spo2', 'SpO2 %')}
          {vitField('temp_c', 'Temp C')}{vitField('sbp', 'SBP')}{vitField('pain', 'Pain 0-10')}
        </div>
        <div className="if-section">OLDCARTS structured interview (optional)</div>
        <div className="if-grid oc">
          {OLDCARTS_FIELDS.map(([key, letter, name, q]) => (
            <label key={key} className="if-field">
              <span><b>{letter}</b> {name} · "{q}"</span>
              <input value={oc[key] ?? ''}
                     onChange={(e) => setOc({ ...oc, [key]: e.target.value })} />
            </label>
          ))}
          <label className="if-field">
            <span><b>S</b> Severity · 0-10 scale</span>
            <input type="number" min={0} max={10} value={severity}
                   onChange={(e) => setSeverity(e.target.value)} />
          </label>
        </div>
        {error && <div className="risk-warning"><b>{error}</b></div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-accept"
                  disabled={!f.patient_id || f.age_years === '' || f.chief_complaint.length < 3}
                  onClick={submit}>Triage this patient</button>
        </div>
      </div>
    </div>
  )
}
