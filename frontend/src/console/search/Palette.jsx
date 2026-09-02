import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { EsiBadge, Initials, Input, Pill, Scrim } from '../ui'
import { rank } from './lookup'
import { parse } from './parse'
import { describePredicate, select } from './predicate'

const MATCHED = { patient_id: 'record', display_name: 'name',
                  chief_complaint: 'complaint' }
const LIMIT = 8

// Search over the board the console already holds. Two modes off one field:
// plain words rank patients by how well they match, and a recognised filter
// term turns the same box into a cohort question.
//
// The parse is always shown back as chips before the count is read, and a
// term that looked like a filter but could not be resolved is named. A board
// shown without the filter the user asked for answers a different question,
// and on a triage board that is the failure worth designing against.
//
// Mounting is the caller's job, so every open starts on an empty query
// without an effect to reset it.
export default function Palette({ rows, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const field = useRef(null)

  useEffect(() => { field.current?.focus() }, [])

  const board = rows ?? []
  const parsed = parse(query)
  const cohort = parsed.predicates.length > 0
  const matched = cohort ? select(board, parsed) : []
  const hits = cohort
    ? matched.slice(0, LIMIT).map((row) => ({ row }))
    : rank(board, parsed.text)
  const asked = cohort || Boolean(parsed.text) || parsed.unmatched.length > 0
  // Clamped rather than reset, so shrinking the result set under the cursor
  // cannot leave Enter pointing past the end of the list.
  const at = Math.min(cursor, Math.max(hits.length - 1, 0))

  const choose = (id) => { onSelect(id); onClose() }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(Math.min(at + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(Math.max(at - 1, 0))
    } else if (e.key === 'Enter' && hits[at]) {
      choose(hits[at].row.patient_id)
    }
  }

  return (
    <>
      <Scrim className="z-50" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Find a patient"
           className="fixed z-50 left-1/2 -translate-x-1/2 top-[12vh] w-[min(560px,92vw)]
                      bg-card border border-line rounded-md shadow-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b border-line">
          <Search size={15} className="text-ink-3 shrink-0" aria-hidden="true" />
          <Input ref={field} size="lg" role="combobox" aria-expanded={hits.length > 0}
                 aria-controls="search-hits" aria-label="Find a patient"
                 aria-activedescendant={hits[at] ? `hit-${hits[at].row.patient_id}` : undefined}
                 placeholder="Name, record number or complaint"
                 value={query} onKeyDown={onKeyDown}
                 onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
                 className="border-0 bg-transparent focus:outline-none px-0" />
        </div>

        {/* What the query was read as. This is the line the user checks
            before trusting the count, so it is rendered whenever a filter was
            recognised, not only when something looks wrong. */}
        {(cohort || parsed.unmatched.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-line">
            {parsed.predicates.map((p) => (
              <Pill key={`${p.field}-${p.op}`} tone="brand">{describePredicate(p)}</Pill>
            ))}
            {parsed.text && <Pill tone="neutral">text {parsed.text}</Pill>}
            {parsed.unmatched.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Pill tone="warn">
                  Could not read {[...new Set(parsed.unmatched)].join(', ')}
                </Pill>
                <span className="text-[10.5px] text-ink-2">
                  so that part was not applied
                </span>
              </span>
            )}
            {cohort && (
              <span className="ml-auto text-[11px] text-ink-2 tabular-nums">
                {matched.length} {matched.length === 1 ? 'patient' : 'patients'}
              </span>
            )}
          </div>
        )}

        {/* An empty box has not been asked anything yet. Saying "no patient
            matches" here would teach the user to discount the times it
            matters, so the two states read differently on purpose. */}
        {!asked ? (
          <p className="px-3.5 py-3 text-xs text-ink-3">
            Search by name, record number or complaint, or ask for a cohort:
            try &quot;pediatric fever waiting over 20 minutes&quot;.
          </p>
        ) : hits.length === 0 ? (
          <p className="px-3.5 py-3 text-xs text-ink-2">
            {cohort
              ? 'No patient on this board matches those filters.'
              : <>No patient matches <b className="text-ink">{parsed.text}</b> on this board.</>}
          </p>
        ) : (
          <div id="search-hits" role="listbox" aria-label="Matching patients"
               className="max-h-[46vh] overflow-y-auto py-1">
            {/* Real buttons, so activation and focus come from the platform.
                tabIndex -1 keeps the tab stop on the field: the list is
                driven by aria-activedescendant, not by moving focus. */}
            {hits.map((hit, i) => (
              <button key={hit.row.patient_id} id={`hit-${hit.row.patient_id}`}
                      type="button" role="option" aria-selected={i === at}
                      tabIndex={-1}
                      onClick={() => choose(hit.row.patient_id)}
                      onMouseEnter={() => setCursor(i)}
                      className={`w-full text-left flex items-center gap-2.5 px-3 py-2
                                  cursor-pointer ${i === at ? 'bg-raised' : ''}`}>
                <Initials name={hit.row.display_name} id={hit.row.patient_id} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink truncate">
                    {hit.row.display_name ?? hit.row.patient_id}
                  </span>
                  <span className="block text-[11px] text-ink-3 truncate">
                    {hit.row.chief_complaint}
                  </span>
                </span>
                {hit.field && (
                  <span className="text-[10px] uppercase tracking-wider text-ink-3 shrink-0">
                    {MATCHED[hit.field]}
                  </span>
                )}
                {cohort && hit.row.waited_min !== undefined && (
                  <span className="text-[10.5px] text-ink-3 shrink-0 tabular-nums">
                    {Math.round(hit.row.waited_min)} min
                  </span>
                )}
                {hit.row.esi != null && <EsiBadge esi={hit.row.esi} size="sm" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
