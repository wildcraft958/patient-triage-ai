import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { DETAIL } from '../test/helpers'
import PipelineView from './PipelineView'

vi.mock('../api')

const METRICS = { latency: { n: 3, p50_ms: 12, p95_ms: 21 }, state: { pending_enrichment: 0 } }

function show(metrics = METRICS) {
  api.getRegistry.mockResolvedValue({ components: [] })
  api.getRecentAudit.mockResolvedValue({ events: [] })
  return render(<PipelineView detail={DETAIL.A} metrics={metrics} refreshKey={0} />)
}

describe('the pipeline view', () => {
  it('puts the activity log under the graph, not beside it', async () => {
    // It used to be a left/right split with a drag handle between them. The
    // graph is wide, and a supervisor reads the two together.
    const { container } = show()
    await screen.findByText(/component activity/i)

    expect(screen.queryByRole('separator', { name: /activity log width/i }))
      .not.toBeInTheDocument()

    const graph = screen.getByText(/intake pipeline/i).closest('section')
    const log = screen.getByText(/component activity/i).closest('section')
    expect(graph).not.toBe(log)
    // Document order: the graph precedes the log.
    expect(graph.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
    expect(container.querySelector('[data-branch="fork"]')).toBeTruthy()
    expect(container.querySelector('[data-branch="join"]')).toBeTruthy()
  })

  it('keeps the fork and the join as drawn edges', async () => {
    // The two paths genuinely run concurrently and rejoin. Drawing them in one
    // line would misstate both, so the branch survives the redesign.
    show()
    await screen.findByText(/both paths run concurrently from here/i)
    expect(screen.getByText(/rejoined/i)).toBeInTheDocument()
    expect(screen.getByText(/a de-identified copy only/i)).toBeInTheDocument()
  })
})

describe('the fusion node', () => {
  it('does not report a disagreement when only one path ran', async () => {
    const alone = {
      ...DETAIL.A,
      fused: { ...DETAIL.A.fused, llm: null, paths_agree: false },
      pipeline: { ...DETAIL.A.pipeline, reasoning_ran: false, surge_path: false },
    }
    api.getRegistry.mockResolvedValue({ components: [] })
    api.getRecentAudit.mockResolvedValue({ events: [] })
    render(<PipelineView detail={alone} metrics={METRICS} refreshKey={0} />)

    await screen.findByText(/more acute wins/i)
    expect(screen.queryByText(/paths disagreed/i)).not.toBeInTheDocument()
    expect(screen.getByText(/path a alone/i)).toBeInTheDocument()
  })
})

// The graph used to read left, then down, then left again: intake and
// redaction in a row, the fork, then four more stages in a second row. The
// product site drew the same pipeline as one column, so the two halves of the
// product disagreed about the shape of their own pipeline.
describe('the shape of the graph', () => {
  const follows = (a, b) => !!(screen.getByText(a)
    .compareDocumentPosition(screen.getByText(b)) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('runs the linear stages down one column', async () => {
    const { container } = show()
    await screen.findByText('Redaction')
    // intake to redaction, then fusion to calibration to safety to audit
    expect(container.querySelectorAll('[data-branch="straight"]')).toHaveLength(4)
  })

  it('keeps every stage in the order it runs', async () => {
    show()
    await screen.findByText('Redaction')
    const chain = ['Intake', 'Redaction', 'Path A', 'Fusion',
                   'Calibration', 'Safety', 'Audit']
    const wrong = chain.slice(0, -1)
      .map((k, i) => [k, chain[i + 1]])
      .filter(([a, b]) => !follows(a, b))
    expect(wrong, 'stages out of document order').toEqual([])
  })

  // Only the concurrent pair is side by side, and that is the one place the
  // geometry is making a claim: they run at the same time.
  it('keeps the two concurrent paths beside each other', async () => {
    show()
    await screen.findByText('Path B')
    expect(follows('Path A', 'Path B')).toBe(true)
    expect(screen.getByText('Path A').closest('[class*="grid-cols-2"]')).toBeTruthy()
  })
})
