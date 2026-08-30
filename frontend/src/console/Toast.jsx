const TONE = {
  alarm: 'border-l-esi-2',
  accept: 'border-l-esi-5',
  override: 'border-l-esi-4',
  default: 'border-l-brand',
}

export default function ToastStack({ toasts }) {
  if (!toasts.length) return null
  return (
    <div aria-live="polite"
         className="fixed right-4 bottom-4 z-60 flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <article key={t.id}
                 className={`bg-card border border-line border-l-4 rounded-md px-3.5 py-2.5
                             max-w-[330px] shadow-md motion-safe:animate-[toast_.18s_ease]
                             ${TONE[t.tone] ?? TONE.default}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-2 mb-0.5">
            {t.title}
          </p>
          <p className="text-[11.5px] leading-snug text-ink">{t.text}</p>
        </article>
      ))}
    </div>
  )
}
