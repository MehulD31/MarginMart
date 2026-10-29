import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ApiError, callFunction, type Profile } from './functions'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  signIn: (phone: string, pin: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('user_id', s.user.id).maybeSingle()
    setProfile(data && data.active ? (data as Profile) : null)
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Defer the query: calling Supabase inside this callback can deadlock the auth lock.
      setTimeout(() => void loadProfile(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const signIn = useCallback(async (phone: string, pin: string) => {
    const tokens = await callFunction<{ access_token: string; refresh_token: string }>('pin-login', { phone, pin })
    const { data, error } = await supabase.auth.setSession(tokens)
    if (error) throw new ApiError('NETWORK')
    await loadProfile(data.session)
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session])

  const value = useMemo(
    () => ({ loading, session, profile, signIn, signOut, refreshProfile }),
    [loading, session, profile, signIn, signOut, refreshProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
