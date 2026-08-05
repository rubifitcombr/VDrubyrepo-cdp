import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { parsePlan } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { notificarAdminListaVencimentos } from '@/services/notificar-admin.server'

function todayIsoLocal(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * 1) Bloqueia lojas ativas com plano vencido (calendário).
 * 2) Email ao admin com lojas que vencem nos próximos 3 dias.
 */
export async function runVerificarVencimentosJob(): Promise<void> {
  const svc = createServiceRoleClient()
  const today = todayIsoLocal()
  const now = new Date().toISOString()

  await svc
    .from('stores')
    .update({
      status: 'bloqueado',
      merchant_status: 'bloqueado',
      plano_atualizado_em: now,
    })
    .eq('status', 'ativo')
    .not('plano_vence_em', 'is', null)
    .lt('plano_vence_em', today)

  const end = addDaysIso(3)
  const { data: vencendo, error } = await svc
    .from('stores')
    .select('name, plano, plan, plano_vence_em')
    .eq('status', 'ativo')
    .gte('plano_vence_em', today)
    .lte('plano_vence_em', end)

  if (error) {
    console.error('[verificarVencimentos]', error.message)
    return
  }

  const rows = vencendo ?? []
  if (rows.length === 0) return

  const linhas = rows.map((r) => {
    const row = r as Record<string, unknown>
    const nome = String(row.name ?? '—')
    const pl = parsePlan(readStorePlano(row))
    const v =
      typeof row.plano_vence_em === 'string' ? row.plano_vence_em : '—'
    return `${nome} — ${pl} — vence em ${v}`
  })

  await notificarAdminListaVencimentos({
    assunto: `${rows.length} plano(s) vencem em 3 dias`,
    linhas,
  })
}
