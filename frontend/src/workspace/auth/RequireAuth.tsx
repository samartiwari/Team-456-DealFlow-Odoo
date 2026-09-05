import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ApiError } from '@/shared/api/client'
import { me } from '@/shared/api/endpoints'
import { adoptUser, clearSession, currentUser, getToken, useSession } from '@/shared/api/session'
import { Spinner } from '@/shared/ui'

/**
 * The route guard, and the boot check.
 *
 * A stored token has to be confirmed before the app renders: an expired one
 * looks exactly like a good one until it is used, and a blank shell that fails
 * on its first query is worse than a login form. So `me` is called first, and a
 * 401 there clears the session.
 */
export default function RequireAuth() {
  const user = useSession()
  const location = useLocation()
  const [checking, setChecking] = useState(() => getToken() !== null && currentUser() === null)

  useEffect(() => {
    if (!checking) return
    let cancelled = false
    me()
      .then((u) => { if (!cancelled) { adoptUser(u); setChecking(false) } })
      .catch((e: unknown) => {
        if (cancelled) return
        // The client already clears on 401; this covers anything else.
        if (!(e instanceof ApiError && e.status === 401)) clearSession()
        setChecking(false)
      })
    return () => { cancelled = true }
  }, [checking])

  if (checking) {
    return (
      <div className="flex min-h-full items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  // No token means the login screen, never a blank app shell. `from` is carried
  // so a deep link survives signing in.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <Outlet />
}
