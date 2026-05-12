import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/services/auth.server'
import { getCashierOrdersForStore } from '@/services/cashier.server'
import { parsePrintingFromStore } from '@/lib/store-printing'
import {
  getCaixaTurnosHistorico,
  getMovimentacoesForTurnos,
  getOpenCaixaTurno,
} from '@/services/caixa-turnos.server'
import type { CaixaMovimentacaoDTO, CaixaTurnoDTO } from '@/lib/caixa-types'
import { getStoreByUser } from '@/services/store.server'
import { listEntregadoresForStore } from '@/services/store-entregadores.server'
import { listEntregasForTurno } from '@/services/entregas.server'
import type { EntregaDTO, StoreEntregadorDTO } from '@/lib/entregas-types'
import { CashierClient } from './_components/CashierClient'

export default async function CaixaPage() {
  const user = await getUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Sessão necessária
        </h1>
        <Link
          href="/login"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Ir para login
        </Link>
      </div>
    )
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Precisas de uma loja associada à tua conta.
        </p>
        <Link
          href="/dashboard/settings"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Configurações
        </Link>
      </div>
    )
  }

  const storeId = String(store.id)
  const storeRow = store as Record<string, unknown>
  const storeName =
    typeof storeRow.name === 'string' && storeRow.name.trim()
      ? storeRow.name.trim()
      : 'Meu estabelecimento'
  const printPaperMm = parsePrintingFromStore(storeRow).print_paper_mm
  const supabase = await createClient()
  const [orders, turnoAberto, historico] = await Promise.all([
    getCashierOrdersForStore(storeId),
    getOpenCaixaTurno(supabase, storeId),
    getCaixaTurnosHistorico(supabase, storeId, 10),
  ])

  const turnoIds = [
    ...new Set([
      ...historico.map((h) => h.id),
      ...(turnoAberto ? [turnoAberto.id] : []),
    ]),
  ]
  const movimentacoesPorTurno = await getMovimentacoesForTurnos(supabase, turnoIds)

  let entregadoresInicial: StoreEntregadorDTO[] = []
  let entregasTurnoInicial: EntregaDTO[] = []
  try {
    entregadoresInicial = await listEntregadoresForStore(supabase, storeId)
  } catch {
    entregadoresInicial = []
  }
  if (turnoAberto?.id) {
    try {
      entregasTurnoInicial = await listEntregasForTurno(supabase, storeId, turnoAberto.id)
    } catch {
      entregasTurnoInicial = []
    }
  }

  const operatorLabel =
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    user.email ||
    'Operador'
  return (
    <CashierClient
      storeId={storeId}
      storeName={storeName}
      printPaperMm={printPaperMm}
      initialOrders={orders}
      operatorLabel={operatorLabel}
      initialTurno={turnoAberto as CaixaTurnoDTO | null}
      initialHistorico={historico as CaixaTurnoDTO[]}
      initialMovimentacoesPorTurno={movimentacoesPorTurno as Record<string, CaixaMovimentacaoDTO[]>}
      initialEntregadores={entregadoresInicial}
      initialEntregasTurno={entregasTurnoInicial}
    />
  )
}
