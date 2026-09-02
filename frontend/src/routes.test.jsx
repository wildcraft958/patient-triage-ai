import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import { routes } from './routes'
import { DETAIL, QUEUE, drawerRecord, signIn } from './test/helpers'
import ThemeProvider from './theme/ThemeProvider'

vi.mock('./api')

// The console's six sections used to be component state, so /console was one
// URL for all of them: nothing could be linked to, and the back button left
// the console instead of going back a section.

beforeEach(() => {
  sessionStorage.clear()
  api.getQueue.mockResolvedValue(QUEUE)
  api.getMetrics.mockResolvedValue({ latency: {}, state: {} })
  api.getRecentAudit.mockResolvedValue({ events: [] })
  api.getPatient.mockResolvedValue(null)
  api.getRegistry.mockResolvedValue({ components: [] })
})

const at = (path) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>)
  return router
}

describe('the address space', () => {
  it('opens a console section straight from its own address', async () => {
    signIn()
    at('/console/registry')
    expect(await screen.findByRole('link', { name: /registry/i }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('sends /console to the board rather than to nothing', async () => {
    signIn()
    const router = at('/console')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/console/queue'))
  })

  it('sends a section that does not exist back to the board', async () => {
    signIn()
    const router = at('/console/nonsense')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/console/queue'))
  })

  // The rail hides settings from a role that cannot use it, and the service
  // refuses it too. A typed address has to agree with both.
  it('refuses a section the signed-in role does not have', async () => {
    signIn('ma')
    const router = at('/console/settings')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/console/queue'))
  })

  it('lands a mistyped address on a page that is still the product', async () => {
    at('/evidnce')
    expect(await screen.findByText(/that page isn't here/i)).toBeInTheDocument()
    // the site's own navigation, not the router's unstyled error screen
    expect(screen.getByRole('link', { name: /launch/i })).toBeInTheDocument()
  })
})

// Search reaches every patient, including from a section that shows no
// patients at all. Landing on a hit therefore has to move you to the board
// and open the record, or the search appears to do nothing.
describe('searching from a section that has no patient list', () => {
  it('lands on the board with the record open', async () => {
    api.getPatient.mockImplementation((id) => Promise.resolve(DETAIL[id]))
    signIn()
    const user = userEvent.setup()
    const router = at('/console/pipeline')
    await waitFor(() => expect(router.state.location.pathname).toBe('/console/pipeline'))

    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByRole('combobox'), 'bianca')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/console/queue'))
    await waitFor(() => expect(drawerRecord()).toBe('B'))
  })
})
