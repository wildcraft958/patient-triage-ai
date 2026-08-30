import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './themeContext'

const KEY = 'pt.theme'

// Three states, not two. An explicit choice stamps data-theme on the root; the
// default stamps nothing and lets prefers-color-scheme decide, so a night-shift
// nurse who never touches the toggle still gets the dark board.
function read() {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'dark' || saved === 'light' ? saved : null
  } catch {
    return null  // private browsing, blocked storage: fall back to the OS
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export default function ThemeProvider({ children }) {
  const [choice, setChoice] = useState(read)

  useEffect(() => {
    const root = document.documentElement
    if (choice) root.dataset.theme = choice
    else delete root.dataset.theme
  }, [choice])

  const setTheme = useCallback((next) => {
    try {
      if (next) localStorage.setItem(KEY, next)
      else localStorage.removeItem(KEY)
    } catch { /* the stamp below still applies for this session */ }
    setChoice(next)
  }, [])

  const value = useMemo(() => {
    const dark = choice ? choice === 'dark' : systemPrefersDark()
    return {
      choice,                                   // 'light' | 'dark' | null
      dark,                                     // what is actually rendered
      setTheme,
      toggle: () => setTheme(dark ? 'light' : 'dark'),
    }
  }, [choice, setTheme])

  return <ThemeContext value={value}>{children}</ThemeContext>
}
