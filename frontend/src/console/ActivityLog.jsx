import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { Card, CardHead, Empty, Input, Select } from './ui'
import { EVENT_COMPONENT, HUMAN_CODES, shiftClock } from './format'

// The event types worth asking a compliance question about. Not every type
// the trail holds: these are the ones someone counts.
const TYPES = ['override', 'override_safety_flag', 'acceptance', 'alert',
               'alert_ack', 'reassessment', 'triage', 'reward',
               'surge_enrichment', 'observation']

// Rows the panel has no phrasing for still have to appear once they were
// explicitly asked for. Dropping them would answer a compliance question with
// a shorter list than the truth.
const UNDESCRIBED = ['LOG', (p) => JSON.stringify(p).slice(0, 90)]

// What each component did this shift, newest first. The diagram beside it
// answers "how was this patient scored"; this answers "what has the system
// been doing", which is the question a supervisor asks. With a filter set it
// answers a narrower one: every override by this clinician, say, which is a
// compliance question and is why truncation is surfaced rather than implied.
export default function ActivityLog({ refreshKey }) {
  const [events, setEvents] = useState([])
  const [filters, setFilters] = useState({ event_type: '', clinician_id: '' })
  const [truncated, setTruncated] = useState(false)
  const query = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value.trim()))
  const filtering = Object.keys(query).length > 0
  const asked = JSON.stringify(query)
  // Two timers drive the refresh key, so these overlap. Same monotonic guard
  // the console uses on its own fetches: a response that a newer request has
  // already overtaken is dropped rather than rolling the list backwards.
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    const wanted = JSON.parse(asked)
    const request = Object.keys(wanted).length
      ? api.searchAudit(wanted)
      : api.getRecentAudit()
    request
      .then((r) => {
        if (mine !== seq.current) return
        setEvents(r.events)
        setTruncated(Boolean(r.truncated))
      })
      .catch(() => {})
  }, [refreshKey, asked])

  // Unfiltered, this panel is about components, so it shows component
  // actions. Filtered, it shows exactly what was asked for and nothing is
  // quietly held back: the server already applied the filter.
  const rows = filtering
    ? events
    : events.filter((e) => EVENT_COMPONENT[e.event_type]).slice(-80).reverse()

  return (
    <Card className="h-full flex flex-col min-h-0">
      <CardHead title="Component activity"
                note={filtering
                  ? `${rows.length} matching events, newest first`
                  : `${rows.length} events this shift, newest first`} />

      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
          Event type
          <Select className="ml-1.5" value={filters.event_type}
                  onChange={(e) => setFilters(
                    (f) => ({ ...f, event_type: e.target.value }))}>
            <option value="">any</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </Select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
          Clinician
          <Input className="ml-1.5 w-28" value={filters.clinician_id}
                 placeholder="RN-07"
                 onChange={(e) => setFilters(
                   (f) => ({ ...f, clinician_id: e.target.value }))} />
        </label>
      </div>

      {/* A count read off a list that was cut short is wrong, and nothing
          else on screen would say so. */}
      {truncated && (
        <p className="mx-4 mb-2 px-2 py-1 rounded-sm bg-warn-bg text-warn-ink
                      border border-warn-line text-[10.5px]">
          There are more than this. Narrow the filter before counting.
        </p>
      )}

      {rows.length === 0 && (
        <Empty>{filtering ? 'No event matches those filters.'
                          : 'Nothing has run yet.'}</Empty>
      )}
      <div className="flex-1 overflow-y-auto min-h-0">
        {rows.map((e) => {
          const [code, describe] = EVENT_COMPONENT[e.event_type] ?? UNDESCRIBED
          const human = HUMAN_CODES.has(code)
          return (
            // Keyed by the audit sequence, not by position. Newest-first means
            // one arriving event shifts every index, and React then rewrote all
            // eighty rows instead of inserting one, which is what the panel was
            // doing when it appeared to blank and refill.
            <div key={e.id} data-event-id={e.id}
                 className="flex gap-2.5 px-4 py-2 border-b border-line last:border-0">
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
