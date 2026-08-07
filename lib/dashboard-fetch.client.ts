'use client'

import { createClient } from '@/lib/supabase/client'
import {
  trackDashboardFetchEnd,
  trackDashboardFetchStart,
} from '@/lib/client-reload-guard'
import {
  beginOperationalAction,
  endOperationalAction,
} from '@/lib/operational-action-flight.client'

/** Erros de `requireLojistaAtivoApi` em que a conta deve sair para /acesso-suspenso. */
const LOJISTA_ACCESS_SUSPEND = new Set([
  'pendente',
  'bloqueado',
  'cancelado',
  'plano_vencido',
])

export type DashboardFetchInit = RequestInit & {
  /** Mantém overlay optimista enquanto este request estiver em voo. */
  operationalActionKey?: string
}

/**
 * `fetch` para APIs do painel: em 403 **só** se o corpo indicar suspensão do lojista
 * (`pendente`, `bloqueado`, `cancelado`, `plano_vencido`) faz signOut e redireciona.
 * Outros 403 (ex.: recurso só Pro, modo errado) devolvem a resposta sem deslogar.
 */
export async function dashboardFetch(
  input: RequestInfo | URL,
  init?: DashboardFetchInit
): Promise<Response> {
  const actionKey = init?.operationalActionKey
  const { operationalActionKey: _actionKey, ...fetchInit } = init ?? {}

  if (actionKey) beginOperationalAction(actionKey)
  trackDashboardFetchStart()
  try {
    const res = await fetch(input, {
      credentials: 'include',
      ...fetchInit,
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
  } finally {
    trackDashboardFetchEnd()
    if (actionKey) endOperationalAction(actionKey)
  }
}
