import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { hasSession, setPortalToken, verify } from './client'
import { PortalError } from './types'
import { Negotiation } from './Negotiation'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

type Phase =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'dead'; message: string }

/** Read once: the effect below strips it from the URL after a successful exchange. */
const magicFromUrl = (): string | null =>
  new URL(window.location.href).searchParams.get('token')

/**
 * One exchange per link, however many times the effect runs.
 *
 * A magic link is single use, and StrictMode mounts an effect twice in
 * development: the second run fired a second exchange against a token the first
 * had already burned, the server correctly answered 401, and the customer was
 * shown "this link has expired or has already been used" for a link they had
 * just been sent. The cancelled flag below only stopped the stale *response*
 * from setting state; it could not un-send the request.
 *
 * Keyed by the token rather than guarded by a boolean, so a second link opened
 * in the same tab still exchanges. Deliberately never cleared: the whole point
 * is that a token which has been through here is not sent again.
 */
const exchanges = new Map<string, ReturnType<typeof verify>>()

function exchangeOnce(magic: string) {
  const running = exchanges.get(magic)
  if (running) return running
  const started = verify(magic)
  exchanges.set(magic, started)
  return started
}

/**
 * Customer bundle. Imports nothing from src/workspace and nothing from
 * shared/api/types, so no internal screen, cost figure, margin or risk score
 * can reach a customer through this build.
 *
 * The magic link is single use. It is exchanged once for a session token, and
 * the `token` parameter is stripped from the URL immediately — a refresh must
 * not replay a link that has already been burned.
 */
export default function App() {
  const [magic] = useState(magicFromUrl)

  // Derived during render, not set from the effect: with no link in the URL the
  // answer is already known, and only the token exchange is genuinely async.
  const [phase, setPhase] = useState<Phase>(() =>
    magic
      ? { kind: 'checking' }
      : hasSession()
        ? { kind: 'ready' }
        : { kind: 'dead', message: 'This page needs the link your account manager sent you.' },
  )

  useEffect(() => {
    if (!magic) return

    let cancelled = false
    exchangeOnce(magic)
      .then((result) => {
        if (cancelled) return
        setPortalToken(result.portalToken)
        // Strip it before anything can reload and retry a burned token.
        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.replaceState({}, '', url.toString())
        setPhase({ kind: 'ready' })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setPhase({
          kind: 'dead',
          message: e instanceof PortalError ? e.message : 'This link could not be opened.',
        })
      })

    return () => { cancelled = true }
  }, [magic])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-full bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-6 py-4">
            <span className="grid h-6 w-6 place-items-center rounded bg-slate-900 text-[11px] font-bold text-white">
              DF
            </span>
            <span className="text-sm font-semibold text-slate-900">DealFlow360</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-6 py-10">
          {phase.kind === 'checking' && (
            <p className="py-16 text-center text-sm text-slate-500">Opening your quotation…</p>
          )}

          {/* A burned link cannot be revived, so there is no retry button —
              a retry loop against a single-use token only confuses. */}
          {phase.kind === 'dead' && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
              <h1 className="text-lg font-semibold text-slate-900">This link is no longer valid</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{phase.message}</p>
              <p className="mt-4 text-sm text-slate-500">
                Please ask your account manager to send a new one.
              </p>
            </div>
          )}

          {phase.kind === 'ready' && <Negotiation />}
        </main>
      </div>
    </QueryClientProvider>
  )
}
