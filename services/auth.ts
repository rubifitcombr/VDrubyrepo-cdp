import { createClient } from '@/lib/supabase/client'

export async function getUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function signUp(email: string, password: string) {
  const supabase = createClient()
  return supabase.auth.signUp({ email, password })
}

export async function signIn(email: string, password: string) {
  const supabase = createClient()
  return supabase.auth.signInWithPassword({ email, password })
}

export function setRememberLoginPreference(remember: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('vyria.rememberLogin', remember ? '1' : '0')
}

export async function signOut() {
  const supabase = createClient()
  return supabase.auth.signOut()
}
