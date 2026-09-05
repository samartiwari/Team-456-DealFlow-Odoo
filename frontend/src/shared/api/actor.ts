import { useSyncExternalStore } from 'react'

/**
 * There is no authentication in this slice. The acting user is a query param,
 * which is crude on purpose but in the right shape — real auth swaps the source
 * here without touching a single call site.
 */

export interface Actor {
  id: number
  name: string
  role: 'REP' | 'MANAGER' | 'FINANCE'
}

export const ACTORS: Actor[] = [
  { id: 1, name: 'Rep One', role: 'REP' },
  { id: 2, name: 'Meera Manager', role: 'MANAGER' },
  { id: 3, name: 'Farid Finance', role: 'FINANCE' },
  // A second rep, because the anomaly rule measures a rep against their own
  // history: with one rep there is nothing to be an outlier from.
  { id: 4, name: 'Rep Two', role: 'REP' },
]

const STORAGE_KEY = 'df360.actorId'

function read(): Actor {
  try {
    const id = Number(localStorage.getItem(STORAGE_KEY))
    return ACTORS.find((a) => a.id === id) ?? ACTORS[0]
  } catch {
    return ACTORS[0]
  }
}

let current: Actor = read()
const listeners = new Set<() => void>()

export function getActor(): Actor {
  return current
}

export function setActor(id: number): void {
  const next = ACTORS.find((a) => a.id === id)
  if (!next || next.id === current.id) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, String(next.id))
  } catch {
    /* private browsing — the choice just does not persist */
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** React binding for the header switcher. */
export function useActor(): Actor {
  return useSyncExternalStore(subscribe, getActor, getActor)
}
