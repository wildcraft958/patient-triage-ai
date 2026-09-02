import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// Governance filters. The unfiltered panel is "what have the components been
// doing"; with a filter it becomes "show me every override by this clinician",
// which is a compliance question and has to answer honestly.
describe('filtering the trail', () => {
  const override = (id, clinician) => ({
    id, sim_min: id, patient_id: 'P1', event_type: 'override',
    payload: { clinician_id: clinician, original_esi: 3, new_esi: 1,
               reason: 'septic shock picture' },
  })

  const mount = async (recent = []) => {
    api.getRecentAudit.mockResolvedValue({ events: recent })
    api.searchAudit.mockResolvedValue({ events: [], truncated: false })
    const view = render(<ActivityLog refreshKey={0} />)
    await waitFor(() => expect(api.getRecentAudit).toHaveBeenCalled())
    return { ...view, user: userEvent.setup() }
  }

  it('reads the whole shift until a filter is set', async () => {
    await mount([ev(1, 10)])
    expect(api.searchAudit).not.toHaveBeenCalled()
  })

  it('searches the trail once an event type is chosen', async () => {
    const { user } = await mount()
    api.searchAudit.mockResolvedValue({
      events: [override(1, 'RN-07')], truncated: false })
    await user.selectOptions(screen.getByLabelText(/event type/i), 'override')
    await waitFor(() => expect(api.searchAudit)
      .toHaveBeenCalledWith(expect.objectContaining({ event_type: 'override' })))
    expect(await screen.findByText(/RN-07 set ESI-1/)).toBeInTheDocument()
  })

  it('narrows to one clinician', async () => {
    const { user } = await mount()
    await user.type(screen.getByLabelText(/clinician/i), 'RN-07')
    await waitFor(() => expect(api.searchAudit)
      .toHaveBeenCalledWith(expect.objectContaining({ clinician_id: 'RN-07' })))
  })

  // A compliance count read off a truncated list is wrong, and nothing on
  // screen would say so.
  it('says when the answer was cut short', async () => {
    const { user } = await mount()
    api.searchAudit.mockResolvedValue({
      events: [override(1, 'RN-07')], truncated: true })
    await user.type(screen.getByLabelText(/clinician/i), 'RN-07')
    expect(await screen.findByText(/more than this/i)).toBeInTheDocument()
  })

  // The unfiltered panel deliberately shows only component actions. A
  // filtered search must not silently drop the rows it was asked for.
  it('shows a filtered event type it has no description for', async () => {
    const { user } = await mount()
    api.searchAudit.mockResolvedValue({
      events: [{ id: 9, sim_min: 4, patient_id: 'P1',
                 event_type: 'observation', payload: { hr: 124 } }],
      truncated: false })
    await user.selectOptions(screen.getByLabelText(/event type/i), 'observation')
    await waitFor(() => expect(rows()).toHaveLength(1))
  })

  it('goes back to the whole shift when the filter is cleared', async () => {
    const { user } = await mount()
    await user.type(screen.getByLabelText(/clinician/i), 'RN-07')
    await waitFor(() => expect(api.searchAudit).toHaveBeenCalled())
    api.getRecentAudit.mockClear()
    await user.clear(screen.getByLabelText(/clinician/i))
    await waitFor(() => expect(api.getRecentAudit).toHaveBeenCalled())
  })
})
