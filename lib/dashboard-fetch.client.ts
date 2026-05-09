'use client'

import { createClient } from '@/lib/supabase/client'

/** Erros de `requireLojistaAtivoApi` em que a conta deve sair para /acesso-suspenso. */
const LOJISTA_ACCESS_SUSPEND = new Set([
  'pendente',
  'bloqueado',
  'cancelado',
  'plano_vencido',
])

/**
 * `fetch` para APIs do painel: em 403 **só** se o corpo indicar suspensão do lojista
 * (`pendente`, `bloqueado`, `cancelado`, `plano_vencido`) faz signOut e redireciona.
 * Outros 403 (ex.: recurso só Pro, modo errado) devolvem a resposta sem deslogar.
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

  let code = ''
  try {
    const j = (await res.clone().json()) as { error?: unknown }
    if (typeof j.error === 'string') code = j.error.trim()
  } catch {
    return res
  }

  if (!LOJISTA_ACCESS_SUSPEND.has(code)) {
    return res
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
