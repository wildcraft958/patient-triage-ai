import { useCallback, useMemo, useState } from 'react'
import { DIRECTORY, ROLES } from './roles'
import { SessionContext } from './sessionContext'

const KEY = 'pt.session'

function read() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    // A persisted role that is no longer a role would throw during render and
    // take the whole application with it. An unrecognised session is no
    // session; the worst case is signing in again.
    return parsed && ROLES[parsed.role] ? parsed : null
  } catch {
    return null  // private browsing, blocked storage: sign in again, no crash
  }
}

export default function SessionProvider({ children }) {
  const [user, setUser] = useState(read)

  const signIn = useCallback((role, overrides = {}) => {
    const next = { ...DIRECTORY[role], ...overrides, role, unit: 'Emergency department' }
    try { sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setUser(next)
  }, [])

  const signOut = useCallback(() => {
    try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    setUser(null)
  }, [])

  const value = useMemo(() => ({
    user,
    role: user ? ROLES[user.role] : null,
    can: user ? ROLES[user.role].can : {},
    signIn,
    signOut,
  }), [user, signIn, signOut])

  return <SessionContext value={value}>{children}</SessionContext>
}
