import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DETAIL, renderSignedIn } from '../test/helpers'
import PatientDrawer from './PatientDrawer'

// Path A argues in four short clauses. Path B argues in paragraphs, and
// rendering every one of them pushed the vitals off the bottom of the panel.
// The chain stays complete and auditable; it just stops being the first wall
// a nurse meets mid-shift.

const POINTS = [
  '52-year-old with known gallstones presenting with abdominal pain and chills.',
  'Fever with chills and abdominal pain suggests possible biliary sepsis.',
  'Current vitals are near-normal but this can be an early compensated stage.',
  'Given history of gallstones, this fits a high-risk pattern.',
  'Per ESI guidance, err toward the more acute classification.',
]

function drawer(reasoning) {
  const base = DETAIL.A
  return {
    ...base,
    fused: { ...base.fused, llm: { ...base.fused.llm, reasoning } },
  }
}

const render = (reasoning) => renderSignedIn(
  <PatientDrawer detail={drawer(reasoning)} feedback="" busy={false}
                 width={460} minWidth={360} maxWidth={760}
                 onResize={vi.fn()} onClose={vi.fn()} onAccept={vi.fn()}
                 onOverride={vi.fn()} onReassess={vi.fn()} onVitals={vi.fn()} />)

const pathB = () => screen.getByRole('heading', { name: /path b/i }).closest('div').parentElement

describe('the reasoning chain', () => {
  it('shows the first points and holds the rest behind a control', async () => {
    render(POINTS)
    expect(within(pathB()).getAllByRole('listitem')).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: /all 5 points/i }))
    expect(within(pathB()).getAllByRole('listitem')).toHaveLength(5)
  })

  it('leaves a short chain alone', () => {
    render(POINTS.slice(0, 3))
    expect(within(pathB()).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /points/i })).not.toBeInTheDocument()
  })
})
