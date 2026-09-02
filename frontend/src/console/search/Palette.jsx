import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { EsiBadge, Initials, Input, Scrim } from '../ui'
import { rank } from './lookup'

const MATCHED = { patient_id: 'record', display_name: 'name',
                  chief_complaint: 'complaint' }

// Lookup over the board the console already holds. Mounting is the caller's
// job, so every open starts on an empty query without an effect to reset it.
export default function Palette({ rows, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const field = useRef(null)

  useEffect(() => { field.current?.focus() }, [])

  const hits = rank(rows ?? [], query)
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

        {/* An empty box has not been asked anything yet. Saying "no patient
            matches" here would teach the user to discount the times it
            matters, so the two states read differently on purpose. */}
        {!query.trim() ? (
          <p className="px-3.5 py-3 text-xs text-ink-3">
            Search by name, record number or complaint.
          </p>
        ) : hits.length === 0 ? (
          <p className="px-3.5 py-3 text-xs text-ink-2">
            No patient matches <b className="text-ink">{query.trim()}</b> on this board.
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
                <span className="text-[10px] uppercase tracking-wider text-ink-3 shrink-0">
                  {MATCHED[hit.field]}
                </span>
                {hit.row.esi != null && <EsiBadge esi={hit.row.esi} size="sm" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
