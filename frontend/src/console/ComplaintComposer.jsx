import { useEffect, useState } from 'react'
import { useDialog } from './useDialog'
import { Btn, Scrim, Textarea } from './ui'

// The chief complaint is the field the whole triage turns on and the one a
// nurse types most into, so it gets a room of its own rather than a two-line
// box with a drag handle in the corner.
export default function ComplaintComposer({ value, onSave, onClose }) {
  const [text, setText] = useState(value)
  const dialog = useDialog(onClose)

  useEffect(() => {
    // the field takes newlines, so submitting needs a modifier
    const onKey = (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(text)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [text, onSave])

  return (
    <div className="fixed inset-0 z-60 grid place-items-center p-5">
      <Scrim onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Chief complaint"
           ref={dialog} tabIndex={-1}
           className="relative bg-card rounded-lg w-[620px] max-w-full border-t-4
                      border-brand shadow-lg px-5 py-5">
        <h2 className="text-lg font-bold tracking-tight text-ink">Chief complaint</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          In the patient's own words. This is the text both reasoning paths read,
          and it is redacted before either of them sees it.
        </p>

        <Textarea autoFocus rows={7} size="lg" value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What brought you in today?"
                  className="mt-4 resize-none" />

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
