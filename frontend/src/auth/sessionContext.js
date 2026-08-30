import { createContext, useContext } from 'react'

// The context and its hook, apart from the provider component, so a
// fast-refresh reload of the provider never re-creates the context identity.
export const SessionContext = createContext(null)

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession used outside a SessionProvider')
  return ctx
}
