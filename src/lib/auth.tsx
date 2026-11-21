import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile, Settings } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  settings: Settings | null
  loading: boolean
  isAdmin: boolean
  isStaff: boolean
  isFrontDesk: boolean
  refresh: () => Promise<void>
  refreshSettings: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  const refreshSettings = useCallback(async () => {
    const { data } = await supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle()
    setSettings((data as Settings | null) ?? null)
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      setSession(data.session)
      await Promise.all([loadProfile(data.session?.user.id), refreshSettings()])
      if (alive) setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // Se difiere para no bloquear el callback de auth con otra consulta
      setTimeout(() => void loadProfile(s?.user.id), 0)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile, refreshSettings])

  const value: AuthState = {
    session,
    profile,
    settings,
    loading,
    isAdmin: profile?.role === 'admin' && profile.active,
    isStaff: !!profile && profile.active && profile.role !== 'client',
    isFrontDesk: !!profile && profile.active && (profile.role === 'admin' || profile.role === 'receptionist'),
    refresh: () => loadProfile(session?.user.id),
    refreshSettings,
    signOut: async () => {
      await supabase.auth.signOut()
      setProfile(null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fuera de AuthProvider')
  return v
}
