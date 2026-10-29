import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../shared/api/auth'
import { homeFor, type Role } from '../shared/api/functions'
import { Brand } from '../shared/ui/kit'
import ChangePinPage from '../features/auth/ChangePinPage'

export function Splash() {
  return <div className="splash" role="status" aria-label="Loading"><Brand /><span className="spinner" aria-hidden="true" /></div>
}

/**
 * UI gate only. Real enforcement is RLS + RPC checks in the database.
 * Sends signed-out users to /login, wrong-role users to their own home,
 * and anyone with a one-time PIN to the change-PIN screen.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { loading, profile } = useAuth()
  if (loading) return <Splash />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.must_change_pin) return <ChangePinPage />
  if (!roles.includes(profile.role)) return <Navigate to={homeFor(profile.role)} replace />
  return <>{children}</>
}

export function HomeRedirect() {
  const { loading, profile } = useAuth()
  if (loading) return <Splash />
  return <Navigate to={profile ? homeFor(profile.role) : '/login'} replace />
}
