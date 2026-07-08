import 'server-only'

import type { GarcomReportRow, GarconsReportDTO } from '@/lib/garcons-report-types'
import {
  addCalendarDaysSpGarcons,
  defaultGarconsReportRange,
  spYmdToStartUtcMsGarcons,
} from '@/lib/garcons-report-dates'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listGarconsForStore } from '@/services/store-garcons.server'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseYmd(raw: string | null | undefined): string | null {
  if (!raw) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

type OrderRow = {
  total: number | string | null
  service_fee_brl: number | string | null
  garcom_id: string | null
  garcom_nome: string | null
}

function parseMoney(v: number | string | null | undefined): number {
  if (typeof v === 'number') return v
  return Number(String(v ?? '').replace(',', '.')) || 0
}

export async function buildGarconsReport(
  svc: SupabaseClient,
  storeId: string,
  fromYmd: string,
  toYmd: string
): Promise<GarconsReportDTO> {
  const from = parseYmd(fromYmd) ?? defaultGarconsReportRange().from
  const to = parseYmd(toYmd) ?? defaultGarconsReportRange().to
  const rangeEndExclusive = addCalendarDaysSpGarcons(to, 1)
  const fromIso = new Date(spYmdToStartUtcMsGarcons(from)).toISOString()
  const toIso = new Date(spYmdToStartUtcMsGarcons(rangeEndExclusive)).toISOString()

  const garcons = await listGarconsForStore(svc, storeId)
  const garconsAtivos = garcons.filter((g) => g.ativo).length

  const { data, error } = await svc
    .from('orders')
    .select('total, service_fee_brl, garcom_id, garcom_nome')
    .eq('store_id', storeId)
    .eq('source', 'waiter')
    .eq('status', 'delivered')
    .gte('created_at', fromIso)
    .lt('created_at', toIso)

  if (error) {
    if (/garcom_id|service_fee_brl|column|does not exist/i.test(error.message)) {
      return {
        from,
        to,
        summary: {
          faturamento: 0,
          ticket_medio: 0,
          total_pedidos: 0,
          taxa_servico: 0,
          garcons_ativos: garconsAtivos,
        },
        rows: [],
        missingColumns: true,
      }
    }
    throw new Error(error.message)
  }

  const byGarcom = new Map<
    string,
    { nome: string; pedidos: number; valor: number; taxa: number }
  >()

  for (const g of garcons) {
    byGarcom.set(g.id, { nome: g.nome, pedidos: 0, valor: 0, taxa: 0 })
  }

  let totalPedidos = 0
  let faturamento = 0
  let taxaServico = 0

  for (const row of (data ?? []) as OrderRow[]) {
    const total = parseMoney(row.total)
    const fee = parseMoney(row.service_fee_brl)

    totalPedidos += 1
    faturamento += total
    taxaServico += fee

    const gid = row.garcom_id?.trim() || '__sem_garcom__'
    const nome =
      row.garcom_nome?.trim() ||
      (gid === '__sem_garcom__' ? 'Sem garçom' : 'Garçom removido')

    const bucket = byGarcom.get(gid) ?? {
      nome,
      pedidos: 0,
      valor: 0,
      taxa: 0,
    }
    if (!byGarcom.has(gid)) byGarcom.set(gid, bucket)
    bucket.pedidos += 1
    bucket.valor += total
    bucket.taxa += fee
  }

  const rows: GarcomReportRow[] = Array.from(byGarcom.entries())
    .filter(([, v]) => v.pedidos > 0)
    .map(([garcom_id, v]) => ({
      garcom_id: garcom_id === '__sem_garcom__' ? null : garcom_id,
      nome: v.nome,
      total_pedidos: v.pedidos,
      valor_pedidos: round2(v.valor),
      ticket_medio: v.pedidos > 0 ? round2(v.valor / v.pedidos) : 0,
      taxa_servico: round2(v.taxa),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const activeWithSales = rows.filter(
    (r) => r.garcom_id && garcons.some((g) => g.id === r.garcom_id && g.ativo)
  ).length

  return {
    from,
    to,
    summary: {
      faturamento: round2(faturamento),
      ticket_medio: totalPedidos > 0 ? round2(faturamento / totalPedidos) : 0,
      total_pedidos: totalPedidos,
      taxa_servico: round2(taxaServico),
      garcons_ativos: activeWithSales > 0 ? activeWithSales : garconsAtivos,
    },
    rows,
  }
}
