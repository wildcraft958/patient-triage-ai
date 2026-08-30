import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AlertBand from './AlertBand'
import { renderSignedIn } from '../test/helpers'

// Closing an alert is not a cosmetic hide. It calls the same acknowledge
// endpoint the wordy button used to, so the row leaves the band because the
// server recorded that a clinician saw it, and the audit trail carries who
// and when. The distinction matters: an acknowledgment that quietly cleared
// the queue would make the board look safe without making it safe.

const ROW = {
  patient_id: 'SIM-007', display_name: 'R. Castillo', esi: 2,
  waited_min: 41, alert_kind: 'DETERIORATION', alert_acknowledged: false,
  alert: 'R. Castillo (ESI-2, abdominal pain): HR, Temp worsening',
}

const band = (props, role) => {
  const spies = { onSelect: vi.fn(), onReassess: vi.fn(),
                  onAcknowledge: vi.fn(), onSeeAll: vi.fn() }
  renderSignedIn(<AlertBand rows={[ROW]} busy={false} {...spies} {...props} />, role)
  return spies
}

describe('closing an alert', () => {
  beforeEach(() => sessionStorage.clear())

  it('records that a clinician saw it, rather than hiding the row', async () => {
    const { onAcknowledge } = band()
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onAcknowledge).toHaveBeenCalledWith('SIM-007')
  })

  it('says the patient stays overdue, so closing never reads as resolving', () => {
    band()
    expect(screen.getByRole('button', { name: /dismiss/i }))
      .toHaveAttribute('title', expect.stringMatching(/stays overdue/i))
  })

  // The API refuses this for an administrator in auth.py. The board offering a
  // control the service will refuse is worse than not offering it.
  it('is not offered to a role the service would refuse', () => {
    band({}, 'admin')
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()
  })
})
