import { X } from 'lucide-react'

const TONE = {
  alarm: 'border-l-esi-2',
  accept: 'border-l-esi-5',
  override: 'border-l-esi-4',
  default: 'border-l-brand',
}

export default function ToastStack({ toasts, onDismiss }) {
  // The container is always mounted. A live region inserted at the same moment
  // as its first message is not announced, and deterioration and wait-breach
  // alerts reach the user through nothing else.
  return (
    <div aria-live="assertive" role="status"
         className="fixed right-4 bottom-4 z-60 flex flex-col gap-2 items-end
                    pointer-events-none empty:hidden">
      {toasts.map((t) => (
        <article key={t.id}
                 className={`relative pointer-events-auto bg-card border border-line border-l-4
                             rounded-md px-3.5 py-2.5
                             max-w-[330px] shadow-md motion-safe:animate-[toast_.18s_ease]
                             ${TONE[t.tone] ?? TONE.default}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-2 mb-0.5 pr-4">
            {t.title}
          </p>
          <p className="text-[11.5px] leading-snug text-ink">{t.text}</p>
          {onDismiss && (
            <button onClick={() => onDismiss(t.id)} aria-label="Dismiss this message"
                    className="absolute top-1.5 right-1.5 p-1 rounded-sm text-ink-3
                               cursor-pointer hover:bg-app hover:text-ink
                               focus-visible:outline-2 focus-visible:outline-brand">
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </article>
      ))}
    </div>
  )
}
