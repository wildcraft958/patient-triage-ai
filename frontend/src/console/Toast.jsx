export default function ToastStack({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`}>
          <b>{t.title}</b>
          {t.text}
        </div>
      ))}
    </div>
  )
}
