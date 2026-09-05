import { useQueryClient } from '@tanstack/react-query'
import { ACTORS, setActor, useActor } from '@/shared/api/actor'

/**
 * Crude on purpose. There is no authentication in this slice, so the acting user
 * is a query param — enough to demo role behaviour, and in the right shape for
 * real auth to replace without touching a call site.
 */
export function ActorSwitcher() {
  const actor = useActor()
  const qc = useQueryClient()

  return (
    <label className="flex items-center gap-2">
      <span className="hidden text-[12px] font-medium text-muted sm:inline">Acting as</span>
      <select
        aria-label="Acting as"
        value={actor.id}
        onChange={(e) => {
          setActor(Number(e.target.value))
          // Everything the screen shows is scoped to the actor, so refetch it all.
          qc.invalidateQueries()
        }}
        className="h-8 rounded-control border border-default bg-card px-2 text-[13px] font-medium text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {ACTORS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.role}
          </option>
        ))}
      </select>
    </label>
  )
}
