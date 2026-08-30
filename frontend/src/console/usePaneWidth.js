import { useCallback, useState } from 'react'

// Pane widths survive a reload: a nurse who widened the patient record once
// should not have to do it again at the start of every shift.
//
// The bounds are clamped on the way back in, not only on the way out. A width
// saved before the bounds changed, or edited by hand, would otherwise restore
// a pane the splitter can no longer drag back into range.
export function usePaneWidth(key, fallback, min, max) {
  const clamp = useCallback((v) => Math.min(max, Math.max(min, v)), [min, max])

  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key))
      return Number.isFinite(saved) && saved > 0 ? clamp(saved) : fallback
    } catch {
      return fallback
    }
  })

  const set = useCallback((next) => {
    const bounded = clamp(next)
    setWidth(bounded)
    try { localStorage.setItem(key, String(Math.round(bounded))) } catch { /* ignore */ }
  }, [key, clamp])

  return [width, set]
}
