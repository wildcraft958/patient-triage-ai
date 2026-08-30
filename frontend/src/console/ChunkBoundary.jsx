import { Component } from 'react'
import { clearStaleChunkFlag } from './chunkRecovery'
import { Btn, Card } from './ui'

export default class ChunkBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <Card className="p-6">
        <h2 className="text-sm font-bold text-ink">This view could not load</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2 max-w-xl">
          The application was updated while this shift was open, so part of it is
          no longer on disk. The board and everything you have recorded are
          unaffected. Reloading picks up the new version.
        </p>
        <Btn variant="primary" className="mt-4"
             onClick={() => { clearStaleChunkFlag(); window.location.reload() }}>
          Reload the console
        </Btn>
      </Card>
    )
  }
}
