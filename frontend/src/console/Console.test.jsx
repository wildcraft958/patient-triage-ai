import { act, screen, waitFor, within } from '@testing-library/react'
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
  // Auto-play and live mode reschedule themselves. A tick that lands before
  // cleanup would otherwise hit the bare automock, resolve undefined and
  // reject inside a timeout where no test can see it. Individual tests
  // override these where the response is the thing under test.
  api.loadScenario.mockResolvedValue({ events: 0 })
  api.stepScenario.mockResolvedValue({ remaining: 0, done: true, event: null, alerts: [] })
  api.advanceClock.mockResolvedValue({ alerts: [], state: {} })
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

describe('a board nobody has arrived on', () => {
  // How the deployed demo actually sits between shifts: a scenario is loaded
  // and its events are queued, but no patient has walked in yet. Treating a
  // loaded scenario as a started shift suppresses the shift picker and leaves
  // whoever opens the link looking at one italic line on an empty screen.
  const loadedNotStepped = {
    queue: [], in_care: [], scenario_remaining: 27,
    state: { ...QUEUE.state, total_patients: 0, waiting: 0, in_care: 0 },
  }

  it('offers the shift picker when a scenario is loaded but not stepped', async () => {
    api.getQueue.mockResolvedValue(loadedNotStepped)
    renderSignedIn(<Console />)

    expect(await screen.findByText(/normal shift/i)).toBeInTheDocument()
    expect(screen.getByText(/surge stress test/i)).toBeInTheDocument()
    expect(screen.queryByText(/nobody is on the board yet/i)).not.toBeInTheDocument()
  })

  it('opens the board as soon as a shift is chosen, before anyone arrives', async () => {
    // Loading a scenario only queues the arrivals; patients walk in as the
    // clock runs. Waiting for the first of them to appear left the picker on
    // screen after the click, which reads as a dead button.
    api.getQueue.mockResolvedValue(loadedNotStepped)
    api.loadScenario.mockResolvedValue({ events: 27 })
    const user = userEvent.setup()
    renderSignedIn(<Console />)

    await user.click(await screen.findByText(/normal shift/i))

    await waitFor(() =>
      expect(screen.queryByText(/normal shift/i)).not.toBeInTheDocument())
    expect(screen.getByText(/nobody is on the board yet/i)).toBeInTheDocument()
  })

  it('answers the click while the shift is still opening', async () => {
    // Scoring two dozen patients through both engines takes seconds on a cold
    // container. Without a word on screen the card reads as a dead button.
    api.getQueue.mockResolvedValue(loadedNotStepped)
    const gate = deferred()
    api.loadScenario.mockReturnValue(gate.promise)
    const user = userEvent.setup()
    renderSignedIn(<Console />)

    const card = (await screen.findByText(/normal shift/i)).closest('button')
    await user.click(card)

    // The card itself, not the toast that announces the same thing beside it.
    await waitFor(() =>
      expect(within(card).getByText(/scoring the first arrivals/i)).toBeInTheDocument())

    await act(async () => { gate.resolve({ events: 27 }) })
    expect(within(card).queryByText(/scoring the first arrivals/i)).not.toBeInTheDocument()
  })

  it('starts walking the arrivals in without a second click', async () => {
    // "Open a shift to bring patients onto the board" is what the card
    // promises. Live mode only advances the clock, so without auto-play the
    // board sits empty while the shift appears to be running.
    api.getQueue.mockResolvedValue(loadedNotStepped)
    api.loadScenario.mockResolvedValue({ events: 27 })
    api.stepScenario.mockResolvedValue({ remaining: 26, event: null, alerts: [] })
    const user = userEvent.setup()
    renderSignedIn(<Console />)

    await user.click(await screen.findByText(/normal shift/i))
    await waitFor(() => expect(api.stepScenario).toHaveBeenCalled(), { timeout: 3000 })
  })

  it('leaves the board up once patients have arrived', async () => {
    // The other half: the picker must not come back mid-shift just because
    // the queue momentarily empties while everyone is in a treatment bay.
    api.getQueue.mockResolvedValue({
      ...loadedNotStepped,
      state: { ...loadedNotStepped.state, total_patients: 4, in_care: 4 },
    })
    renderSignedIn(<Console />)

    expect(await screen.findByText(/nobody is on the board yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/normal shift/i)).not.toBeInTheDocument()
  })
})

describe('a shift running unattended', () => {
  const loaded = {
    queue: [], in_care: [], scenario_remaining: 27,
    state: { ...QUEUE.state, total_patients: 0, waiting: 0, in_care: 0 },
  }

  it('stops auto-play when stepping starts failing', async () => {
    // Auto-play reschedules itself. A restarted backend has no scenario and
    // answers 400, and without a catch that became a silent failing request
    // every 1.1 seconds with nothing on screen.
    api.getQueue.mockResolvedValue(loaded)
    api.loadScenario.mockResolvedValue({ events: 27 })
    api.stepScenario.mockRejectedValue(new Error('no scenario loaded'))
    const user = userEvent.setup()
    renderSignedIn(<Console />)

    await user.click(await screen.findByText(/normal shift/i))
    await waitFor(() => expect(api.stepScenario).toHaveBeenCalled(), { timeout: 3000 })
    await screen.findByText(/arrivals stopped/i, {}, { timeout: 3000 })

    const calls = api.stepScenario.mock.calls.length
    await act(async () => { await new Promise((r) => setTimeout(r, 1600)) })
    expect(api.stepScenario).toHaveBeenCalledTimes(calls)
  })

  it('leaves the picker usable when the shift will not open', async () => {
    api.getQueue.mockResolvedValue(loaded)
    api.loadScenario.mockRejectedValue(new Error('backend unreachable'))
    const user = userEvent.setup()
    renderSignedIn(<Console />)

    await user.click(await screen.findByText(/normal shift/i))

    expect(await screen.findByText(/could not open the shift/i)).toBeInTheDocument()
    expect(screen.getByText(/normal shift/i)).toBeInTheDocument()
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

describe('an action the server refuses', () => {
  it('tells the clinician instead of swallowing it', async () => {
    // Permission is decided behind the API now, so a role that may not act
    // gets a 403 even though it reached the control. Without a catch that is
    // an unhandled rejection and a click that silently does nothing.
    api.acceptPatient.mockRejectedValue(
      new Error('"A medical assistant may not accept on this board"'))
    const user = userEvent.setup()
    renderSignedIn(<Console />)

    await user.click(await screen.findByText('Alma Whitfield'))
    await user.click(await screen.findByRole('button', { name: /accept/i }))

    expect(await screen.findByText(/could not accept/i)).toBeInTheDocument()
    expect(screen.getByText(/may not accept on this board/i)).toBeInTheDocument()
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

  it('does not call one path a disagreement', async () => {
    // fuse() reports paths_agree false when there is no reasoning path at all,
    // because nothing agreed. Rendering that as "Paths disagree" tells a
    // clinician two engines reached different levels when only one ran.
    api.getPatient.mockImplementation(() => Promise.resolve(withoutPathB(false)))
    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Alma Whitfield'))

    const drawer = await screen.findByRole('dialog', { name: /triage recommendation/i })
    await waitFor(() => expect(drawer).toHaveTextContent(/path a only/i))
    expect(drawer).not.toHaveTextContent(/paths disagree/i)
  })

  it('still calls a genuine surge deferral queued', async () => {
    api.getPatient.mockImplementation(() => Promise.resolve(withoutPathB(true)))
    renderSignedIn(<Console />)
    await userEvent.click(await screen.findByText('Alma Whitfield'))

    const drawer = await screen.findByRole('dialog', { name: /triage recommendation/i })
    await waitFor(() => expect(drawer).toHaveTextContent(/queued/i))
  })
})

// Search is reachable from anywhere on the board, which means the shortcut
// has to be wired at the window and has to stay out of the way of a dialog
// that already owns focus.
describe('finding a patient from anywhere', () => {
  it('opens the palette on Cmd+K once a shift is running', async () => {
    const user = userEvent.setup()
    renderSignedIn(<Console />)
    await screen.findByText('Alma Whitfield')
    expect(screen.queryByRole('dialog', { name: /find a patient/i })).toBeNull()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByRole('dialog', { name: /find a patient/i })).toBeInTheDocument()
  })

  it('opens on Ctrl+K too, for anyone not on a Mac', async () => {
    const user = userEvent.setup()
    renderSignedIn(<Console />)
    await screen.findByText('Alma Whitfield')
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('dialog', { name: /find a patient/i })).toBeInTheDocument()
  })

  it('closes again on Escape', async () => {
    const user = userEvent.setup()
    renderSignedIn(<Console />)
    await screen.findByText('Alma Whitfield')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /find a patient/i })).toBeNull()
  })

  it('selecting a hit opens that patient rather than whoever was selected', async () => {
    api.getPatient.mockImplementation((id) => Promise.resolve(DETAIL[id]))
    const user = userEvent.setup()
    renderSignedIn(<Console />)
    await screen.findByText('Alma Whitfield')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByRole('combobox'), 'bianca')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(drawerRecord()).toBe('B'))
  })

  // Two overlays fighting over focus is worse than no shortcut at all.
  it('stays shut while a dialog already owns the screen', async () => {
    const user = userEvent.setup()
    renderSignedIn(<Console />)
    await screen.findByText('Alma Whitfield')
    await user.click(screen.getByRole('button', { name: /new patient/i }))
    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.queryByRole('dialog', { name: /find a patient/i })).toBeNull()
  })
})

// Pinned cohorts. A match announces a patient without touching their level,
// so it arrives as its own kind of notification rather than as an alert.
describe('cohorts left running', () => {
  const PINNED = [{ id: 'ab12', label: 'age under 18, waiting over 20 min',
                    query: { predicates: [] }, members: ['B'] }]

  beforeEach(() => {
    api.listCohorts.mockResolvedValue({ cohorts: [] })
    api.pinCohort.mockResolvedValue(PINNED[0])
    api.unpinCohort.mockResolvedValue({ unpinned: 'ab12' })
  })

  const openPalette = async () => {
    const user = userEvent.setup()
    renderSignedIn(<Console />)
    await screen.findByText('Alma Whitfield')
    await user.keyboard('{Meta>}k{/Meta}')
    return user
  }

  it('shows what is already being watched when the palette opens', async () => {
    api.listCohorts.mockResolvedValue({ cohorts: PINNED })
    await openPalette()
    expect(await screen.findByText(/age under 18, waiting over 20 min/))
      .toBeInTheDocument()
  })

  it('pins a cohort and reloads the list from the server', async () => {
    const user = await openPalette()
    await user.type(screen.getByRole('combobox', { name: /find a patient/i }),
                    'esi 3')
    // counted before the click, or the assertion is a tautology
    const before = api.listCohorts.mock.calls.length
    await user.click(screen.getByRole('button', { name: /keep watching/i }))
    await waitFor(() => expect(api.pinCohort).toHaveBeenCalled())
    // reloaded rather than pushed onto local state, so the member counts the
    // console shows are the ones the server is actually sweeping
    await waitFor(() => expect(api.listCohorts.mock.calls.length)
      .toBeGreaterThan(before))
  })

  it('stops watching one', async () => {
    api.listCohorts.mockResolvedValue({ cohorts: PINNED })
    const user = await openPalette()
    await user.click(await screen.findByRole('button', { name: /stop watching/i }))
    await waitFor(() => expect(api.unpinCohort).toHaveBeenCalledWith('ab12'))
  })

  // The distinction the whole design rests on: a cohort match is not an alert
  // and must not be announced as one.
  it('announces a match without calling it a deterioration', async () => {
    api.getQueue.mockResolvedValue({ ...QUEUE, scenario_remaining: 3 })
    api.stepScenario.mockResolvedValue({
      remaining: 2, done: false, event: null, alerts: [],
      cohort_matches: [{ cohort_id: 'ab12', label: 'age under 18',
                         patient_id: 'B', at_min: 25 }],
    })
    const user = userEvent.setup()
    renderSignedIn(<Console />)
    await screen.findByText('Alma Whitfield')
    await user.click(screen.getByRole('button', { name: /next event/i }))
    expect(await screen.findByText(/entered a watched cohort/i)).toBeInTheDocument()
    expect(await screen.findByText(/age under 18/)).toBeInTheDocument()
    expect(screen.queryByText(/deteriorating/i)).toBeNull()
  })
})
