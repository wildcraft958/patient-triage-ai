// The PatientTriage.ai mark: one sharp deflection, then a dot still sitting on
// the line. A patient is scored once and then kept under watch rather than
// left to flatline, which is the whole product in a glyph.
//
// Drawn on a 32 grid. The stroke weight is set so the silhouette survives a
// 16px favicon, which is where three earlier candidates fell apart. Colour
// comes from tokens, so the mark follows the theme without a second asset:
// the tile is the brand purple and the glyph is whatever reads on it.

const GLYPH = 'M4.5 19h4.6l2.6-8 3.6 13 2.4-5.6h2.6'

export function Mark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"
         className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path d={GLYPH} fill="none" className="stroke-brand-fg" strokeWidth="2.9"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.6" cy="18.4" r="3.1" className="fill-brand-fg" />
    </svg>
  )
}

// Mark plus name. `tone` picks the text colour for the surface it sits on:
// the dark navigation rail, or an ordinary light or dark page.
export function Wordmark({ size = 26, tone = 'page', className = '' }) {
  const text = tone === 'rail' ? 'text-rail-fg' : 'text-ink'
  return (
    <span className={`inline-flex items-center gap-2.5 font-bold tracking-tight
                      ${text} ${className}`}>
      <Mark size={size} />
      <span className="truncate">
        PatientTriage<span className="text-brand">.ai</span>
      </span>
    </span>
  )
}
