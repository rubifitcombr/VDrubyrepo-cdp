'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * `fetch` para APIs do painel: em 403 faz signOut e redireciona para /acesso-suspenso com `error`.
 */
export async function dashboardFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
  })
  if (res.status !== 403) return res

  let code = 'bloqueado'
  try {
    const j = (await res.clone().json()) as { error?: unknown }
    if (typeof j.error === 'string') code = j.error
  } catch {
    /* ignore */
  }

  const supabase = createClient()
  await supabase.auth.signOut()
  if (typeof window !== 'undefined') {
    window.location.assign(
      `/acesso-suspenso?error=${encodeURIComponent(code)}`
    )
  }

  return res
}
