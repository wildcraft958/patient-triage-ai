import { useEffect, useState } from 'react'
import { EsiBadge, Initials, Meter } from '../console/ui'

// The hero is the claim, not a picture of the claim.
//
// Triage is a snapshot: a patient is scored once at the desk and nobody looks
// again. This is the thing that makes this system different, and describing it
// in a paragraph beside a screenshot was the weakest way to say it. Here the
// waiting room re-ranks itself while you read the headline: one patient's
// vitals turn, the monitor's priority for them climbs, and they move up past
// three people who arrived sicker.
//
// Built from the console's own EsiBadge, Initials and Meter, so this is the
// product's design system rather than an illustration of it.

const ROW_H = 52

// Priority is deterioration risk x wait pressure x acuity uncertainty x
// severity, which is why an ESI-3 can outrank an ESI-2 without the acuity
// changing. These figures are illustrative of that shape, not measured.
const ROOM = [
  { id: 'nh', name: 'N. Haddad', age: '3w', why: 'Fever, poor feeding', esi: 2, waited: 22, p: 0.52 },
  { id: 'mc', name: 'M. Chen', age: '61y', why: 'Chest pain', esi: 2, waited: 18, p: 0.44 },
  { id: 'aw', name: 'A. Weber', age: '66y', why: 'Indigestion, sweating', esi: 2, waited: 31, p: 0.38 },
  { id: 'ro', name: 'R. Osei', age: '34y', why: 'Abdominal pain', esi: 3, waited: 41, p: 0.31,
    turns: { p: 0.71, hr: [96, 124] } },
  { id: 'sk', name: 'S. Kaur', age: '28y', why: 'Ankle injury', esi: 4, waited: 12, p: 0.18 },
]

// One pass: settled, the vitals turn, the priority climbs, the row moves, hold,
// then back to settled. Slow on purpose; this is read, not watched.
const BEATS = [3000, 1400, 1400, 4200, 1200]
const TURNED = 1   // from this beat the vitals have moved
const RANKED = 2   // from this beat the board has re-ranked

export default function HeroQueue() {
  const [beat, setBeat] = useState(0)
  const still = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (still) return undefined
    const t = setTimeout(() => setBeat((b) => (b + 1) % BEATS.length), BEATS[beat])
    return () => clearTimeout(t)
  }, [beat, still])

  // Reduced motion gets the settled result rather than nothing: the board as
  // it stands once the re-rank has happened, which is a legible still image.
  const at = still ? RANKED : beat
  const turned = at >= TURNED
  const ranked = at >= RANKED

  const rows = ROOM.map((r) => ({
    ...r,
    p: ranked && r.turns ? r.turns.p : r.p,
    hr: r.turns ? r.turns.hr[turned ? 1 : 0] : null,
  }))
  const rank = Object.fromEntries([...rows]
    .sort((a, b) => b.p - a.p).map((r, i) => [r.id, i]))

  return (
    <div className="hero-room" aria-label="A waiting room re-ranking itself">
      <div className="room-head">
        <span>Waiting room</span>
        <span className="room-note">
          {ranked
            ? 'R. Osei\u2019s vitals turned. He now outranks three sicker patients.'
            : 'Ranked by who to check on next, not by who arrived sickest'}
        </span>
      </div>

      <div className="room-rows" style={{ height: ROOM.length * ROW_H }}>
        {rows.map((r) => {
          const moved = r.turns && turned
          return (
            <div key={r.id} className="room-row"
                 style={{ transform: `translateY(${rank[r.id] * ROW_H}px)` }}>
              <Initials name={r.name} size="sm" />
              <span className="room-who">
                <b>{r.name} <i>{r.age}</i></b>
                <span>{r.why}</span>
              </span>
              <EsiBadge esi={r.esi} size="sm" />
              <span className="room-vital">
                {moved
                  ? <b className="room-worse">HR {r.turns.hr[0]} &rarr; {r.turns.hr[1]}</b>
                  : <span>{r.waited} min</span>}
              </span>
              <span className="room-p">
                <b>{r.p.toFixed(2)}</b>
                <Meter value={r.p * 100} tone={r.p >= 0.6 ? 'alert' : 'brand'} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
