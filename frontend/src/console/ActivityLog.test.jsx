import { render, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { deferred } from '../test/helpers'
import ActivityLog from './ActivityLog'

vi.mock('../api')

const ev = (id, sim) => ({
  id, sim_min: sim, patient_id: 'P1', event_type: 'triage',
  payload: { esi: 3, confidence: 'high', paths_agree: true },
})

const rows = () => document.querySelectorAll('[data-event-id]')

describe('the activity log', () => {
  it('inserts one arriving event instead of rewriting the list', async () => {
    // Newest-first plus a positional key means every row shifts identity when
    // one event arrives, so React rewrites all eighty rows and the panel
    // visibly flashes. Measured at 161 DOM mutations for a single arrival.
    const first = [ev(1, 10), ev(2, 20), ev(3, 30)]
    api.getRecentAudit.mockResolvedValue({ events: first })
    const { rerender } = render(<ActivityLog refreshKey={0} />)
    await waitFor(() => expect(rows()).toHaveLength(3))

    const before = [...rows()].map((n) => [n.dataset.eventId, n])

    api.getRecentAudit.mockResolvedValue({ events: [...first, ev(4, 40)] })
    rerender(<ActivityLog refreshKey={1} />)
    await waitFor(() => expect(rows()).toHaveLength(4))

    // Every row already on screen must still be the same DOM node.
    for (const [id, node] of before) {
      expect(document.querySelector(`[data-event-id="${id}"]`)).toBe(node)
    }
  })

  it('ignores a response that a newer request has already overtaken', async () => {
    // The one fetch site in the console without the guard Console.jsx uses.
    const slow = deferred()
    api.getRecentAudit.mockReturnValueOnce(slow.promise)
      .mockResolvedValue({ events: [ev(9, 90)] })

    const { rerender } = render(<ActivityLog refreshKey={0} />)
    rerender(<ActivityLog refreshKey={1} />)
    await waitFor(() => expect(rows()).toHaveLength(1))

    await act(async () => { slow.resolve({ events: [ev(1, 1), ev(2, 2)] }) })
    expect(rows()).toHaveLength(1)
    expect(rows()[0].dataset.eventId).toBe('9')
  })
})
