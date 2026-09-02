import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Palette from './Palette'
import { QUEUE, renderSignedIn } from '../../test/helpers'

const ROWS = QUEUE.queue

const open = (props = {}) => {
  const spies = { onClose: vi.fn(), onSelect: vi.fn() }
  renderSignedIn(<Palette rows={ROWS} {...spies} {...props} />)
  return { ...spies, user: userEvent.setup() }
}

describe('the search palette', () => {
  it('opens focused on the field, so you can just type', () => {
    open()
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  // An empty box must not read as "no patient matches". Nothing has been
  // asked yet, and a clinical tool that renders an empty result for an empty
  // question teaches the user to distrust the ones that matter.
  it('prompts rather than reporting no results before anything is typed', () => {
    open()
    expect(screen.getByText(/name, record number or complaint/i)).toBeInTheDocument()
    expect(screen.queryByText(/no patient/i)).toBeNull()
  })

  it('lists the patients a query matches', async () => {
    const { user } = open()
    await user.type(screen.getByRole('combobox'), 'alma')
    const hits = screen.getAllByRole('option')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toHaveTextContent('Alma Whitfield')
  })

  it('says plainly when a query matches no one', async () => {
    const { user } = open()
    await user.type(screen.getByRole('combobox'), 'zzzz')
    expect(screen.getByText(/no patient matches/i)).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('selects the highlighted patient on Enter and closes', async () => {
    const { user, onSelect, onClose } = open()
    await user.type(screen.getByRole('combobox'), 'bianca')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('B')
    expect(onClose).toHaveBeenCalled()
  })

  it('moves the highlight with the arrow keys', async () => {
    const { user, onSelect } = open()
    await user.type(screen.getByRole('combobox'), 'al')  // A by name, B by complaint
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('B')
  })

  it('does not run off the end of the list', async () => {
    const { user, onSelect } = open()
    await user.type(screen.getByRole('combobox'), 'al')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('B')   // clamped to the last row
  })

  // The board polls, so the result set can shrink while the cursor sits on a
  // row that no longer exists. Without clamping, Enter selects nobody.
  it('keeps Enter usable when the board shrinks under the cursor', async () => {
    const spies = { onClose: vi.fn(), onSelect: vi.fn() }
    // Rendered bare on purpose: ui.jsx is context-free, and rerendering
    // through the signed-in wrapper would swap the root element type, which
    // remounts Palette and resets the very cursor this test is about.
    const { rerender } = render(<Palette rows={ROWS} {...spies} />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'al')
    await user.keyboard('{ArrowDown}')            // cursor now on the 2nd row
    rerender(<Palette rows={[ROWS[0]]} {...spies} />)
    await user.keyboard('{Enter}')
    expect(spies.onSelect).toHaveBeenCalledWith('A')
  })

  it('closes on Escape without selecting anyone', async () => {
    const { user, onSelect, onClose } = open()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('selects a patient when their row is clicked', async () => {
    const { user, onSelect } = open()
    await user.type(screen.getByRole('combobox'), 'alma')
    await user.click(screen.getByRole('option'))
    expect(onSelect).toHaveBeenCalledWith('A')
  })

  it('does nothing on Enter when nothing matches', async () => {
    const { user, onSelect } = open()
    await user.type(screen.getByRole('combobox'), 'zzzz')
    await user.keyboard('{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
  })
})

// The parse is shown back before the count is trusted. A cohort filter that
// quietly meant something else than the words on screen is the failure mode
// this whole design exists to avoid, so the chips are not decoration.
describe('cohort queries', () => {
  const COHORT = [
    { patient_id: 'P1', display_name: 'A. One', esi: 2, age_years: 8,
      waited_min: 40, status: 'waiting', category: 'fever',
      chief_complaint: 'fever since last night' },
    { patient_id: 'P2', display_name: 'B. Two', esi: 3, age_years: 44,
      waited_min: 40, status: 'waiting', category: 'fever',
      chief_complaint: 'fever and cough' },
    { patient_id: 'P3', display_name: 'C. Three', esi: 4, age_years: 9,
      waited_min: 2, status: 'waiting', category: 'rash',
      chief_complaint: 'itchy rash' },
  ]
  const cohort = (props = {}) => {
    const spies = { onClose: vi.fn(), onSelect: vi.fn() }
    renderSignedIn(<Palette rows={COHORT} {...spies} {...props} />)
    return { ...spies, user: userEvent.setup() }
  }

  it('shows what it understood the query to mean', async () => {
    const { user } = cohort()
    await user.type(screen.getByRole('combobox'), 'pediatric fever waiting over 20 minutes')
    for (const chip of ['age under 18', 'fever', 'waiting over 20 min']) {
      expect(screen.getByText(chip), chip).toBeInTheDocument()
    }
  })

  it('filters to the cohort rather than ranking the whole board', async () => {
    const { user } = cohort()
    await user.type(screen.getByRole('combobox'), 'pediatric fever waiting over 20 minutes')
    const hits = screen.getAllByRole('option')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toHaveTextContent('A. One')
  })

  it('says how many patients are in the cohort', async () => {
    const { user } = cohort()
    await user.type(screen.getByRole('combobox'), 'fever')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByText(/2 patients/i)).toBeInTheDocument()
  })

  it('still selects on Enter', async () => {
    const { user, onSelect } = cohort()
    await user.type(screen.getByRole('combobox'), 'rash')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('P3')
  })

  // The whole point. An unresolved term must be named, because a board shown
  // without the filter the user asked for answers a question nobody asked.
  it('names a term it could not resolve', async () => {
    const { user } = cohort()
    await user.type(screen.getByRole('combobox'), 'fever waiting over')
    expect(screen.getByText(/could not read/i)).toBeInTheDocument()
    expect(screen.getByText(/waiting/)).toBeInTheDocument()
  })

  it('still applies the part it did understand, and says so', async () => {
    const { user } = cohort()
    await user.type(screen.getByRole('combobox'), 'fever waiting over')
    expect(screen.getByText('fever'), 'the chip for the part that parsed')
      .toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('reports an empty cohort as an empty cohort, not as no such patient', async () => {
    const { user } = cohort()
    await user.type(screen.getByRole('combobox'), 'pediatric rash waiting over 90 minutes')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(/no patient on this board matches/i)).toBeInTheDocument()
  })
})
