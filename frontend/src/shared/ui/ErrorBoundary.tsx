import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches a render crash and says so.
 *
 * React unmounts the whole tree when a component throws during render, so without
 * this the screen goes blank or freezes mid-update and every control on it stops
 * responding — which reads as "the buttons are disabled" rather than "this page
 * fell over". The brief's ship checklist puts it plainly: a red stack trace on
 * stage costs more than a missing feature.
 *
 * A class because there is still no hook for this.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept: the message on screen is for the user, this is for whoever debugs it.
    console.error('Screen crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex max-w-md flex-col gap-3 rounded-card border border-danger-br bg-danger-bg px-5 py-4">
          <h2 className="text-sm font-semibold text-danger-tx">This screen stopped working</h2>
          <p className="text-[13px] text-danger-tx">
            Something on the page failed to render, so its controls will not respond.
            Reloading usually clears it.
          </p>
          <p className="font-mono text-[12px] text-danger-tx opacity-80">
            {this.state.error.message}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-control bg-primary px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              Reload the page
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-control border border-default px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-hover"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
