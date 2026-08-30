import { Component } from 'react'

// Above the router, so an unexpected throw anywhere leaves something a person
// can act on instead of a blank page. The console is the only screen in this
// product a clinician cannot simply walk away from mid-shift.
export default class AppBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="min-h-screen grid place-items-center bg-app p-6">
        <div className="max-w-md">
          <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            The console hit an error it could not recover from. Nothing you
            recorded is affected: every decision is written to the audit
            database as it happens, not when you leave the page.
          </p>
          <button onClick={() => window.location.reload()}
                  className="mt-4 rounded-sm bg-brand text-brand-fg font-semibold
                             text-xs px-4 py-2 cursor-pointer">
            Reload the console
          </button>
        </div>
      </div>
    )
  }
}
