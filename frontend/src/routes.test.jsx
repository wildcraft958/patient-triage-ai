import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './api'
import { routes } from './routes'
import { QUEUE, signIn } from './test/helpers'
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
