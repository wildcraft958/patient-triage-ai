import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SessionProvider from '../auth/Session'
import { DIRECTORY } from '../auth/roles'
import ThemeProvider from '../theme/ThemeProvider'
import fixtures from './fixtures.json'

// Recorded from the running API rather than hand-written, so a response shape
// that changes on the backend breaks these tests instead of quietly leaving
// them asserting against a shape the console never receives.
export const QUEUE = fixtures.queue
export const DETAIL = { A: fixtures.A, B: fixtures.B }

/** A promise whose settlement this test controls, for pinning a race. */
export function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

export function signIn(role = 'nurse') {
  sessionStorage.setItem('pt.session', JSON.stringify({
    ...DIRECTORY[role], role, unit: 'Emergency department',
  }))
}

// The console reads a session, a theme and a router. Mounting it without all
// three throws before any assertion runs, so every test goes through here.
export function renderSignedIn(ui, role = 'nurse') {
  signIn(role)
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SessionProvider>{ui}</SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

/** The record the drawer is currently showing, by patient id, or null. */
export function drawerRecord() {
  const drawer = document.querySelector('[aria-label="Triage recommendation"]')
  if (!drawer) return null
  const match = drawer.textContent.match(/record (\w+)/)
  return match ? match[1] : null
}
