import { createClient } from '@/lib/supabase/client'
import { getPasswordResetRedirectUrlClient } from '@/lib/auth-public-url'

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

/** URL absoluta para o email de recuperação (whitelist no Supabase: Authentication → URL Configuration). */
export function getPasswordResetRedirectUrl(): string {
  return getPasswordResetRedirectUrlClient()
}

/** Envia email com link para definir nova senha (utilizador não autenticado). */
export async function requestPasswordResetEmail(email: string) {
  const supabase = createClient()
  const redirectTo = getPasswordResetRedirectUrl()
  return supabase.auth.resetPasswordForEmail(email.trim(), {
    ...(redirectTo ? { redirectTo } : {}),
  })
}

/** Altera a senha da sessão atual (utilizador autenticado ou fluxo PASSWORD_RECOVERY). */
export async function updatePassword(newPassword: string) {
  const supabase = createClient()
  return supabase.auth.updateUser({ password: newPassword })
}
