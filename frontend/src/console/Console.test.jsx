import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { DETAIL, QUEUE, deferred, drawerRecord, renderSignedIn } from '../test/helpers'
import Console from './Console'

vi.mock('../api')

// Which patient the clinician is looking at, and which patient an action would
// be submitted against, are two separate pieces of state in this component:
// the highlighted row, and the record the drawer holds. Both dialogs submit
// the drawer's patient_id, so every test here is about the two agreeing.

beforeEach(() => {
  api.getQueue.mockResolvedValue(QUEUE)
  api.getMetrics.mockResolvedValue({ latency: {}, state: {} })
  api.getRecentAudit.mockResolvedValue({ events: [] })
})

/** getPatient resolves immediately for everyone except `slow`. */
function holdRecord(slow) {
  const gate = deferred()
  api.getPatient.mockImplementation((id) =>
    id === slow ? gate.promise : Promise.resolve(DETAIL[id]))
  return gate
}

describe('patient selection', () => {
  it('keeps the clicked patient when the reload restore answers late', async () => {
    // The restore effect claims the first queued patient on mount. A click
    // landing while that fetch is open must not be undone when it returns.
    const restore = holdRecord('A')

    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Bianca Reyes'))
    await waitFor(() => expect(drawerRecord()).toBe('B'))

    // Flush the stale response and its render before asserting: a waitFor here
    // would pass on the frame before it landed and prove nothing.
    await act(async () => { restore.resolve(DETAIL.A) })

    expect(drawerRecord()).toBe('B')
    const drawer = screen.getByRole('dialog', { name: /triage recommendation/i })
    expect(drawer).not.toHaveTextContent('Alma Whitfield')
  })

  it('never shows a record for a patient other than the selected row', async () => {
    // The narrower half of the same bug: after any click the drawer used to
    // keep rendering the previous record until the new fetch landed.
    const slowB = holdRecord('B')

    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Alma Whitfield'))
    await waitFor(() => expect(drawerRecord()).toBe('A'))

    await userEvent.click(screen.getByText('Bianca Reyes'))
    expect(drawerRecord()).not.toBe('A')

    slowB.resolve(DETAIL.B)
    await waitFor(() => expect(drawerRecord()).toBe('B'))
  })

  it('keeps the drawer open while the selected record loads', async () => {
    // The drawer stays mounted rather than flickering out and replaying its
    // entrance animation on every click.
    const slowB = holdRecord('B')

    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Alma Whitfield'))
    await waitFor(() => expect(drawerRecord()).toBe('A'))

    await userEvent.click(screen.getByText('Bianca Reyes'))
    expect(screen.getByRole('dialog', { name: /triage recommendation/i }))
      .toBeInTheDocument()

    slowB.resolve(DETAIL.B)
    await waitFor(() => expect(drawerRecord()).toBe('B'))
  })
})

describe('acting on the selected patient', () => {
  it('offers no decision controls until the selected record is on screen', async () => {
    // The wrong-patient vector itself. Both dialogs read the drawer's record
    // and submit its patient_id, so a decision control backed by the previous
    // patient's record is an action against the wrong patient.
    const slowB = holdRecord('B')

    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Alma Whitfield'))
    await waitFor(() => expect(drawerRecord()).toBe('A'))
    expect(screen.getByRole('button', { name: /override level/i })).toBeInTheDocument()

    await userEvent.click(screen.getByText('Bianca Reyes'))
    expect(screen.queryByRole('button', { name: /override level/i }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record vitals/i }))
      .not.toBeInTheDocument()

    slowB.resolve(DETAIL.B)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /override level/i })).toBeInTheDocument())
  })
})

describe('when Path B does not return', () => {
  // A live panel typing a novel complaint misses the response cache. The board
  // must not call that a surge deferral: nothing was queued, and saying so
  // would be the one screen in the system telling a clinician something false.
  const withoutPathB = (surge) => {
    const base = DETAIL.A
    return {
      ...base,
      fused: { ...base.fused, llm: null },
      pipeline: { ...base.pipeline, reasoning_ran: false, surge_path: surge },
    }
  }

  it('says the path did not return, not that it was queued', async () => {
    api.getPatient.mockImplementation(() => Promise.resolve(withoutPathB(false)))
    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Alma Whitfield'))

    const drawer = await screen.findByRole('dialog', { name: /triage recommendation/i })
    await waitFor(() => expect(drawer).toHaveTextContent(/did not return/i))
    expect(drawer).not.toHaveTextContent(/queued/i)
  })

  it('still calls a genuine surge deferral queued', async () => {
    api.getPatient.mockImplementation(() => Promise.resolve(withoutPathB(true)))
    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Alma Whitfield'))

    const drawer = await screen.findByRole('dialog', { name: /triage recommendation/i })
    await waitFor(() => expect(drawer).toHaveTextContent(/queued/i))
  })
})
