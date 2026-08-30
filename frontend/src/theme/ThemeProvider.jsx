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
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // The OS can flip mid-shift. Without this the stylesheet followed and the
  // toggle did not, so its label read backwards and the first click was a
  // no-op the user could not explain.
  useEffect(() => {
    let mq
    try { mq = window.matchMedia('(prefers-color-scheme: dark)') } catch { return }
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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
    const dark = choice ? choice === 'dark' : systemDark
    return {
      choice,                                   // 'light' | 'dark' | null
      dark,                                     // what is actually rendered
      setTheme,
      toggle: () => setTheme(dark ? 'light' : 'dark'),
    }
  }, [choice, systemDark, setTheme])

  return <ThemeContext value={value}>{children}</ThemeContext>
}
