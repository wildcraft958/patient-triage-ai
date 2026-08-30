import { createContext, useContext } from 'react'

// The context and its hook, apart from the provider component, so a
// fast-refresh reload of the provider never re-creates the context identity.
export const ThemeContext = createContext(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme used outside a ThemeProvider')
  return ctx
}
