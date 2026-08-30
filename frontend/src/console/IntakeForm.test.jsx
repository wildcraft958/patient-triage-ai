import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderSignedIn } from '../test/helpers'
import IntakeForm from './IntakeForm'

// This form had no test, which is why a sweep that humanised backend
// identifiers in three other components did not reach its category dropdown.

const render = (onClose = vi.fn()) => renderSignedIn(
  <IntakeForm onSubmit={vi.fn()} onClose={onClose} nextId="WALKIN-01" />)

describe('the intake form', () => {
  it('offers complaint categories in English', () => {
    render()
    const options = [...screen.getByLabelText(/category/i).options].map((o) => o.text)

    expect(options).toContain('Chest pain')
    expect(options).toContain('Major trauma')
    expect(options.join(' ')).not.toMatch(/_/)
  })

  it('keeps the machine-readable value behind the readable label', () => {
    // The label is for the nurse; the API still receives the category key.
    render()
    const chest = [...screen.getByLabelText(/category/i).options]
      .find((o) => o.text === 'Chest pain')
    expect(chest.value).toBe('chest_pain')
  })
})

describe('the dictation control', () => {
  it('says plainly that it is not recording yet', async () => {
    const user = userEvent.setup()
    render()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /dictate the complaint/i }))
    const note = screen.getByRole('status')
    expect(note).toHaveTextContent(/coming/i)
    expect(note).toHaveTextContent(/not recording yet/i)
  })
})

// Leaving and starting over are different intentions, and one control was
// doing both. Closing is at the corner, where a dialog is closed. Clearing
// empties the form and keeps the nurse in it, which is what is wanted when the
// wrong patient has been half typed in.

describe('leaving versus starting over', () => {
  it('closes from the corner, not from the row of actions', async () => {
    const onClose = vi.fn()
    render(onClose)
    await userEvent.click(screen.getByRole('button', { name: /close without triaging/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('empties the form without closing it', async () => {
    const onClose = vi.fn()
    render(onClose)
    const name = screen.getByLabelText(/patient name/i)
    await userEvent.type(name, 'M. Chen')
    await userEvent.click(screen.getByRole('button', { name: /clear the form/i }))

    expect(name).toHaveValue('')
    expect(screen.getByLabelText(/record id/i)).toHaveValue('WALKIN-01')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers nothing to clear on an untouched form', () => {
    render()
    expect(screen.getByRole('button', { name: /clear the form/i })).toBeDisabled()
  })
})
