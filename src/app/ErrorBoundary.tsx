import { Component, type ReactNode } from 'react'
import i18n from '../shared/i18n'

const isChunkError = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(String((e as Error)?.message ?? e))

/** Catches render crashes so the user never sees a blank page. Stale-code errors reload once on their own. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: unknown) {
    const key = 'mm-reloaded-at'
    if (isChunkError(error) && Date.now() - Number(sessionStorage.getItem(key) ?? 0) > 10_000) {
      sessionStorage.setItem(key, String(Date.now()))
      window.location.reload()
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="splash" role="alert" style={{ flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
        <p>{i18n.t('errors.crashed')}</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>{i18n.t('errors.reload')}</button>
      </div>
    )
  }
}
