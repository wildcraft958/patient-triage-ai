import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { DETAIL, renderSignedIn } from '../test/helpers'
import PatientDrawer from './PatientDrawer'

vi.mock('../api')

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

describe('the audit trail', () => {
  // Every row here is a backend enum rendered for a clinician. The service
  // keys its own state in SCREAMING_CASE and snake_case, and none of that is
  // language a nurse should be reading off a patient record.
  const EVENTS = [
    { event_type: 'alert', at: 1, payload: { kind: 'WAIT_BREACH', reasons: ['waited too long'] } },
    { event_type: 'alert_ack', at: 2, payload: { kind: 'DETERIORATION', clinician_id: 'RN-07' } },
    { event_type: 'reassessment', at: 3, payload: { previous_esi: 3, new_esi: 2, trigger: 'DETERIORATION' } },
    { event_type: 'surge_enrichment', at: 4, payload: { outcome: 'llm_unavailable' } },
    { event_type: 'surge_enrichment', at: 5, payload: { outcome: 'clinician_decision_stands' } },
  ]

  it('renders every backend enum as English', async () => {
    api.getAudit.mockResolvedValue({ events: EVENTS })
    const user = userEvent.setup()
    render(POINTS)

    await user.click(screen.getByRole('button', { name: /audit trail/i }))
    const trail = await screen.findByText(/safe wait exceeded/i)
    const panel = trail.closest('section')

    expect(panel).toHaveTextContent(/deterioration detected/i)
    expect(panel).toHaveTextContent(/the reasoning path did not answer/i)
    expect(panel).toHaveTextContent(/a clinician had already decided/i)
    expect(panel.textContent).not.toMatch(/WAIT_BREACH|DETERIORATION|llm_unavailable|clinician_decision_stands/)
  })
})

describe('the vitals panel', () => {
  // The old sparkline needed two readings and returned nothing below that, so
  // for the patient who has only been triaged once - which is most of them -
  // the panel rendered a number and an empty space where a chart belonged.
  const ONE_READING = {
    ...DETAIL.A,
    vital_limits: { hr: { high: 100 }, rr: { high: 20 }, spo2: { low: 92 },
                    temp_c: { high: 38 }, pain: { high: 8 },
                    sbp: { low: 90, high: 220 } },
    vitals_history: [{ at_min: 0, vitals: { hr: 96, rr: 18, spo2: 96, temp_c: 37.4, sbp: 122, pain: 5 } }],
  }

  const show = (detail) => renderSignedIn(
    <PatientDrawer detail={detail} feedback="" busy={false}
                   width={460} minWidth={360} maxWidth={760}
                   onResize={vi.fn()} onClose={vi.fn()} onAccept={vi.fn()}
                   onOverride={vi.fn()} onReassess={vi.fn()} onVitals={vi.fn()} />)

  it('draws a gauge for a patient with one reading', () => {
    show(ONE_READING)
    expect(screen.getAllByRole('img', { name: /against a safe range/i })).toHaveLength(6)
  })

  it('marks a reading past its age-band limit', () => {
    show({
      ...ONE_READING,
      vitals_history: [{ at_min: 0, vitals: { ...ONE_READING.vitals_history[0].vitals, hr: 130 } }],
    })
    // 130 is over the published adult ceiling of 100.
    const hr = screen.getByRole('img', { name: /^130 against a safe range/i })
    expect(hr.querySelector('.bg-esi-2')).toBeTruthy()
  })

  it('shows direction of travel only once there is something to compare', () => {
    show(ONE_READING)
    expect(screen.queryByLabelText(/since triage/i)).not.toBeInTheDocument()

    const v = ONE_READING.vitals_history[0].vitals
    show({ ...ONE_READING,
           vitals_history: [{ at_min: 0, vitals: v },
                            { at_min: 9, vitals: { ...v, hr: 118 } }] })
    expect(screen.getByLabelText(/rising since triage/i)).toBeInTheDocument()
  })
})

// Prior cases that look like this one. Lazy behind a disclosure and keyed by
// patient, which is how the audit trail beside it avoids the same class of
// bug: a fresh instance per patient means no in-flight response can land on
// a record the clinician has already moved away from.
describe('similar prior cases', () => {
  const CASES = {
    note: null,
    cases: [
      { patient_id: 'SIM-001', display_name: 'M. Chen', similarity: 0.457,
        outcome_esi: 2, chief_complaint: 'Chest pain radiating to left arm',
        agrees: { category: false, age_band: true } },
      { patient_id: 'SIM-018', display_name: 'F. Rahman', similarity: 0.419,
        outcome_esi: 4, chief_complaint: 'Burning with urination',
        agrees: { category: true, age_band: true } },
    ],
  }

  const open = async (payload = CASES) => {
    api.getSimilar.mockResolvedValue(payload)
    render(POINTS)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /similar/i }))
    return user
  }

  it('asks for nothing until it is opened', () => {
    api.getSimilar.mockResolvedValue(CASES)
    render(POINTS)
    expect(api.getSimilar).not.toHaveBeenCalled()
  })

  it('asks once, not again on every toggle', async () => {
    const user = await open()
    await screen.findByText('M. Chen')
    await user.click(screen.getByRole('button', { name: /hide similar/i }))
    await user.click(screen.getByRole('button', { name: /similar/i }))
    expect(api.getSimilar).toHaveBeenCalledTimes(1)
  })

  it('lists each prior case with what it turned out to be', async () => {
    await open()
    expect(await screen.findByText('M. Chen')).toBeInTheDocument()
    const row = screen.getByText('M. Chen').closest('li')
    expect(row).toHaveTextContent('ESI-2')
    expect(row).toHaveTextContent('46%')
  })

  // The similarity number alone looks more authoritative than it is. The
  // whole mechanism by which a clinician discounts a match is seeing that the
  // complaint category disagreed.
  it('marks a neighbour whose category disagrees', async () => {
    await open()
    await screen.findByText('M. Chen')
    expect(screen.getByText('M. Chen').closest('li'))
      .toHaveTextContent(/different complaint/i)
    expect(screen.getByText('F. Rahman').closest('li'))
      .not.toHaveTextContent(/different complaint/i)
  })

  // An empty list on its own reads as "unlike every prior case", which is a
  // clinical claim. The model being unloadable is not that claim.
  it('gives the reason rather than an empty list', async () => {
    await open({ cases: [], note: 'The embedding model is unavailable, so '
                                 + 'similar-case retrieval is off.' })
    expect(await screen.findByText(/embedding model is unavailable/i))
      .toBeInTheDocument()
  })

  it('says plainly when there is genuinely no close case', async () => {
    await open({ cases: [], note: null })
    expect(await screen.findByText(/no prior case/i)).toBeInTheDocument()
  })
})
