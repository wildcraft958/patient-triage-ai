// Fast lookup over the rows the console already holds. Nothing is fetched:
// the palette ranks the same board the nurse is looking at, so a result can
// never disagree with the row behind it.

const FIELDS = ['patient_id', 'display_name', 'chief_complaint']
const LIMIT = 8

// A match at the start of a word is what the user meant; one buried mid-word
// is usually a coincidence. Ranking the two apart is the difference between
// "rash" finding the rash and "rash" finding nothing useful.
const wordStart = (text, at) => at === 0 || !/[a-z0-9]/.test(text[at - 1])

// Lower is better. The field decides the tier, so a name hit always beats a
// complaint hit; position breaks ties within a tier.
function score(row, query) {
  for (const [tier, field] of FIELDS.entries()) {
    const value = row[field]
    if (typeof value !== 'string') continue
    const at = value.toLowerCase().indexOf(query)
    if (at < 0) continue
    return { field, score: tier * 100 + (wordStart(value.toLowerCase(), at) ? 0 : 50)
                          + Math.min(at, 49) }
  }
  return null
}

export function rank(rows, query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  // Array.sort is stable, so rows that tie keep board order.
  return rows
    .map((row) => { const hit = score(row, q); return hit && { row, ...hit } })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, LIMIT)
}
