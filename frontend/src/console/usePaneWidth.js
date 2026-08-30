import { useCallback, useState } from 'react'

// Pane widths survive a reload: a nurse who widened the patient record once
// should not have to do it again at the start of every shift.
export function usePaneWidth(key, fallback) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key))
      return Number.isFinite(saved) && saved > 0 ? saved : fallback
    } catch {
      return fallback
    }
  })

  const set = useCallback((next) => {
    setWidth(next)
    try { localStorage.setItem(key, String(Math.round(next))) } catch { /* ignore */ }
  }, [key])

  return [width, set]
}
