import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderSignedIn } from '../test/helpers'
import IntakeForm from './IntakeForm'

// This form had no test, which is why a sweep that humanised backend
// identifiers in three other components did not reach its category dropdown.

const render = () => renderSignedIn(
  <IntakeForm onSubmit={vi.fn()} onClose={vi.fn()} nextId="WALKIN-01" />)

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
