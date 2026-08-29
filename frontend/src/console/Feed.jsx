import { fmt } from './ui'

export default function Feed({ items }) {
  return (
    <div className="panel">
      <h2>Shift activity</h2>
      {items.length === 0 && (
        <div className="empty">Arrivals, alerts and decisions appear here as they happen.</div>
      )}
      {items.map((it, i) => (
        <div key={i} className="feed-item">
          <span className={`dot ${it.dot || ''}`} />
          <span className="t">{fmt(it.at)}m</span>
          {it.text}
          {it.esi && <span className="mini-esi">ESI-{it.esi}</span>}
        </div>
      ))}
    </div>
  )
}
