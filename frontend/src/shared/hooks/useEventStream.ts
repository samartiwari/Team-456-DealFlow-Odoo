import { useEffect } from 'react'
import { getToken } from '@/shared/lib/storage'

/** SSE events the backend publishes on GET /api/stream. */
export type StreamEvent =
  | 'approval.decided'
  | 'stock.changed'
  | 'negotiation.message'
  | 'alert.raised'

/**
 * Subscribes to the server-sent event stream.
 *
 * EventSource cannot set an Authorization header, so the JWT rides as a query
 * param; the backend reads it there for this endpoint only.
 */
export function useEventStream(
  events: StreamEvent[],
  onEvent: (event: StreamEvent, payload: unknown) => void,
): void {
  useEffect(() => {
    const token = getToken()
    if (!token) return

    const base = import.meta.env.VITE_API_BASE_URL ?? '/api'
    const source = new EventSource(`${base}/stream?token=${encodeURIComponent(token)}`)

    const handlers = events.map((name) => {
      const handler = (message: MessageEvent<string>) => {
        try {
          onEvent(name, JSON.parse(message.data))
        } catch {
          onEvent(name, message.data)
        }
      }
      source.addEventListener(name, handler as EventListener)
      return [name, handler] as const
    })

    return () => {
      for (const [name, handler] of handlers) {
        source.removeEventListener(name, handler as EventListener)
      }
      source.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join(','), onEvent])
}
