import { useEffect, useRef, useState } from 'react'
import { Btn } from './ui'

// The chief complaint is the field the whole triage turns on and the one a
// nurse types most into, so it gets a room of its own rather than a two-line
// box with a drag handle in the corner.
export default function ComplaintComposer({ value, onSave, onClose }) {
  const [text, setText] = useState(value)
  const ref = useRef(null)

  useEffect(() => { ref.current?.focus() }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      // the field takes newlines, so submitting needs a modifier
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(text)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [text, onSave, onClose])

  return (
    <div className="fixed inset-0 z-60 bg-ink/55 grid place-items-center p-5"
         onClick={onClose}>
      <div role="dialog" aria-label="Chief complaint" onClick={(e) => e.stopPropagation()}
           className="bg-card rounded-lg w-[620px] max-w-full border-t-4 border-brand
                      shadow-lg px-5 py-5">
        <h2 className="text-lg font-bold tracking-tight text-ink">Chief complaint</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          In the patient's own words. This is the text both reasoning paths read,
          and it is redacted before either of them sees it.
        </p>

        <textarea ref={ref} rows={7} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="What brought you in today?"
                  className="mt-4 w-full rounded-sm border border-line bg-card px-3 py-2.5
                             text-[13px] leading-relaxed text-ink resize-none
                             focus:border-brand focus:outline-none" />

        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-line">
          <p className="text-[10.5px] text-ink-3 tabular-nums">
            {text.trim().length} characters
          </p>
          <div className="flex gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={() => onSave(text)}>Save complaint</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
