import { useEffect, useState } from 'react'
import * as api from '../api'
import { Card, CardHead, Empty } from './ui'
import { EVENT_COMPONENT, HUMAN_CODES, shiftClock } from './format'

// What each component did this shift, newest first. The diagram beside it
// answers "how was this patient scored"; this answers "what has the system
// been doing", which is the question a supervisor asks.
export default function ActivityLog({ refreshKey }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    api.getRecentAudit().then((r) => setEvents(r.events)).catch(() => {})
  }, [refreshKey])

  const rows = events
    .filter((e) => EVENT_COMPONENT[e.event_type])
    .slice(-80).reverse()

  return (
    <Card className="h-full flex flex-col min-h-0">
      <CardHead title="Component activity"
                note={`${rows.length} events this shift, newest first`} />
      {rows.length === 0 && <Empty>Nothing has run yet.</Empty>}
      <div className="flex-1 overflow-y-auto min-h-0">
        {rows.map((e, i) => {
          const [code, describe] = EVENT_COMPONENT[e.event_type]
          const human = HUMAN_CODES.has(code)
          return (
            <div key={i} className="flex gap-2.5 px-4 py-2 border-b border-line last:border-0">
              <span className="text-[10.5px] text-ink-3 tabular-nums w-[52px] shrink-0 pt-px">
                {shiftClock(e.sim_min)}
              </span>
              <span className={`text-[9.5px] font-bold tracking-wide rounded-sm px-1.5 py-0.5
                                h-fit shrink-0 w-[38px] text-center
                                ${human ? 'bg-ok-bg text-ok-ink border border-ok-line'
                                        : 'bg-brand-tint text-brand-ink border border-brand-line'}`}>
                {code}
              </span>
              <span className="text-[11px] leading-snug text-ink-2 min-w-0 break-words">
                {describe(e.payload)}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
