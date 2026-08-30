import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { renderSignedIn } from '../test/helpers'
import Registry from './Registry'

vi.mock('../api')

// The backend computes a caveat on the Path B millisecond figure precisely so
// it is not read as live inference time. A caveat that never reaches a screen
// is the same as no caveat, so it is pinned here rather than assumed.
const NOTE = 'replayed from the committed cache in this build; ' +
             'a live model call is 1 to 3 seconds'

const REGISTRY = {
  boundary: {
    phi: 'Runs on the record as it arrived, on this machine',
    deidentified: 'Receives a de-identified copy only',
  },
  egress: 'Transmits patient-derived data off this machine',
  components: [
    {
      id: 'rules_engine', code: 'ESI', name: 'ESI rules engine',
      kind: 'deterministic', stage: 'Path A', boundary: 'phi', status: 'active',
      implementation: 'ESI v4 decision points, hand-coded', summary: 'Scores the record.',
      decides: 'a defensible level', cannot: 'read missing context',
      on_failure: 'it is the fallback', invocations: 3, latency_ms: 0.4, egress: false,
    },
    {
      id: 'clinical_reasoning', code: 'LLM', name: 'Clinical reasoning',
      kind: 'language model', stage: 'Path B', boundary: 'deidentified',
      status: 'active', implementation: 'a model over BM25 retrieval',
      summary: 'Argues a level.', decides: 'a second opinion',
      cannot: 'see a name', on_failure: 'falls back to Path A',
      invocations: 3, latency_ms: 2.1, latency_note: NOTE, egress: true,
    },
    {
      id: 'phi_redactor', code: 'RDX', name: 'PHI redaction',
      kind: 'deterministic', stage: 'Redaction', boundary: 'phi', status: 'active',
      implementation: 'Microsoft Presidio on spaCy en_core_web_lg',
      summary: 'Removes identifiers.', decides: 'what leaves the building',
      cannot: 'remove clinical signal', on_failure: 'triage stops',
      invocations: 3, latency_ms: 5.0, egress: false,
    },
  ],
}

beforeEach(() => {
  api.getRegistry.mockResolvedValue(REGISTRY)
})

describe('the component registry', () => {
  it('shows the cache caveat with the figure it qualifies', async () => {
    renderSignedIn(<Registry refreshKey={0} />)
    await userEvent.click(await screen.findByRole('button',
      { name: /details for Clinical reasoning/i }))

    const note = await screen.findByText(new RegExp(NOTE.slice(0, 40), 'i'))
    expect(note).toBeInTheDocument()
    expect(note).toHaveTextContent('2.1 ms')
  })

  it('adds no caveat to a component that has none', async () => {
    renderSignedIn(<Registry refreshKey={0} />)
    await userEvent.click(await screen.findByRole('button',
      { name: /details for ESI rules engine/i }))

    expect(screen.queryByText(/On the 0.4 ms figure/i)).not.toBeInTheDocument()
  })

  it('sets only real identifiers as code, not the English around them', async () => {
    // The implementation line is mostly prose. Rendering all of it monospace
    // was most of why the console read like a terminal, and it made the two
    // values that genuinely are identifiers indistinguishable from the rest.
    const { container } = renderSignedIn(<Registry refreshKey={0} />)
    await screen.findByText(/PHI redaction/i)

    const code = [...container.querySelectorAll('code')].map((e) => e.textContent)
    expect(code).toContain('en_core_web_lg')
    expect(code).not.toContain('Presidio')
    expect(code.join(' ')).not.toMatch(/hand-coded|Microsoft|spaCy/)
  })

  it('counts the components it publishes', async () => {
    renderSignedIn(<Registry refreshKey={0} />)
    await waitFor(() => expect(screen.getByText('Components')).toBeInTheDocument())
    const stat = screen.getByText('Components').parentElement
    expect(stat).toHaveTextContent('3')
  })
})
