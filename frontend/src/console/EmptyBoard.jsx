import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useSession } from '../auth/sessionContext'
import { Card } from './ui'
import { SHIFTS } from './format'

// Not a splash screen: the rail and the status bar are already up, and this
// is what the board looks like before anyone has arrived.
export default function EmptyBoard({ busy, onLoad }) {
  const { user, can } = useSession()
  // Opening a shift scores two dozen patients through both engines, which on a
  // cold container is seconds, not milliseconds. Dimming the card was not
  // enough of an answer to the click: it has to say that it heard.
  const [picked, setPicked] = useState(null)

  return (
    <Card className="p-8 lg:p-12">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
        Emergency department
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
        Good shift, {user.name}. The board is clear.
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2 max-w-2xl">
        Open a shift to bring patients onto the board. Every recommendation shows
        both reasoning chains, every waiting patient stays under watch, and every
        decision you make is written to the record as it happens.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mt-8 max-w-4xl">
        {SHIFTS.map((s) => (
          <button key={s.profile} disabled={busy || !can.settings}
                  onClick={() => { setPicked(s.profile); onLoad(s.profile, s.speedup) }}
                  className="text-left rounded-lg border border-line bg-card p-5
                             hover:border-brand hover:shadow-md transition-all
                             disabled:opacity-50 disabled:cursor-default cursor-pointer">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-brand">
              {s.tag}
            </span>
            <span className="flex items-center gap-1 text-lg font-bold text-ink mt-2">
              {s.title} <ChevronRight size={16} aria-hidden="true" />
            </span>
            <span className="block text-[12px] leading-relaxed text-ink-2 mt-2">{s.body}</span>
            {picked === s.profile && busy && (
              <span role="status" className="mt-3 flex items-center gap-2 text-[11.5px]
                                             font-semibold text-brand-ink">
                <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden="true" />
                Opening the shift and scoring the first arrivals.
              </span>
            )}
          </button>
        ))}
      </div>

      {!can.settings && (
        <p className="mt-6 text-[11.5px] text-ink-3">
          Your role reads the board. A triage nurse opens the shift.
        </p>
      )}
    </Card>
  )
}
