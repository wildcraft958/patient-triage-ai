import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DETAIL, renderSignedIn } from '../test/helpers'
import OverrideModal from './OverrideModal'

// The service rejects a two-level downgrade of a flagged or ESI<=2 patient
// without an explicit acknowledgment. The dialog has to reach the same verdict
// on the same inputs, or a clinician meets a 422 they were never warned about.

/** A record standing at `esi`, optionally with red flags on the rules path. */
function record(esi, redFlags = []) {
  const base = DETAIL.A
  return {
    ...base,
    fused: {
      ...base.fused,
      esi,
      rules: { ...base.fused.rules, esi, red_flags: redFlags },
    },
  }
}

const confirm = () => screen.getByRole('button', { name: /confirm override/i })
const level = (n) => screen.getByRole('button', { name: new RegExp(`^${n}`) })
const ackBox = () => screen.queryByRole('checkbox')

async function fillReason(user) {
  await user.type(screen.getByRole('textbox'), 'Reassessed at the bedside')
}

describe('a high-risk downgrade', () => {
  it('stays blocked until the risk is acknowledged', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderSignedIn(<OverrideModal detail={record(2)} onSubmit={onSubmit} onClose={vi.fn()} />)

    await user.click(level(4))          // ESI-2 down to ESI-4: two levels
    await fillReason(user)
    expect(confirm()).toBeDisabled()

    await user.click(ackBox())
    expect(confirm()).toBeEnabled()

    await user.click(confirm())
    expect(onSubmit).toHaveBeenCalledWith('A', expect.objectContaining({
      new_esi: 4, acknowledge_risk: true,
    }))
  })

  it('counts red flags as high risk even at a lower standing level', async () => {
    const user = userEvent.setup()
    renderSignedIn(
      <OverrideModal detail={record(3, ['chest pain over 50'])}
                     onSubmit={vi.fn()} onClose={vi.fn()} />)

    await user.click(level(5))
    await fillReason(user)
    expect(screen.getByText(/high-risk downgrade/i)).toBeInTheDocument()
    expect(confirm()).toBeDisabled()
  })

  it('re-arms when the level changes after acknowledgment', async () => {
    // A ticked box must not survive a change of mind about the level; the
    // acknowledgment belongs to one specific downgrade.
    const user = userEvent.setup()
    renderSignedIn(<OverrideModal detail={record(2)} onSubmit={vi.fn()} onClose={vi.fn()} />)

    await user.click(level(4))
    await fillReason(user)
    await user.click(ackBox())
    expect(confirm()).toBeEnabled()

    await user.click(level(5))          // still dangerous, still two levels down
    expect(ackBox()).not.toBeChecked()
    expect(confirm()).toBeDisabled()
  })
})

describe('an ordinary override', () => {
  it('asks for no acknowledgment and submits without one', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderSignedIn(<OverrideModal detail={record(3)} onSubmit={onSubmit} onClose={vi.fn()} />)

    await user.click(level(2))          // an escalation is never the risky direction
    await fillReason(user)
    expect(ackBox()).not.toBeInTheDocument()

    await user.click(confirm())
    expect(onSubmit).toHaveBeenCalledWith('A', expect.objectContaining({
      new_esi: 2, acknowledge_risk: false,
    }))
  })

  it('will not submit without a reason', async () => {
    const user = userEvent.setup()
    renderSignedIn(<OverrideModal detail={record(3)} onSubmit={vi.fn()} onClose={vi.fn()} />)

    await user.click(level(4))
    expect(confirm()).toBeDisabled()

    await user.type(screen.getByRole('textbox'), 'ok')
    expect(confirm()).toBeDisabled()    // a two-character reason is not a reason
  })
})
