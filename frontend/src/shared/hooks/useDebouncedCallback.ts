import { useCallback, useEffect, useRef } from 'react'

/**
 * Coalesces rapid edits into one call. Typing a discount must not fire a PATCH
 * per keystroke — the contract asks for 250 ms.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay = 250,
): (...args: A) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(fn)

  useEffect(() => {
    latest.current = fn
  }, [fn])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => latest.current(...args), delay)
    },
    [delay],
  )
}
