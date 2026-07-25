'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { EntregadoresManagePanel } from '@/app/dashboard/entregadores/_components/EntregadoresManagePanel'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import { notifyStoreOrdersChanged, subscribeStoreOrdersSync } from '@/lib/store-operational-realtime.client'
import type {
  CourierBalanceGroup,
  DeliveryOpsPayload,
  OrderOnRouteDTO,
  StoreEntregadorOpsDTO,
} from '@/lib/delivery-ops-types'
import type { EntregadorStatusOperacional } from '@/lib/entregas-types'

type OpsTab = 'na_rua' | 'disponiveis' | 'atrasados' | 'acertos' | 'cadastro'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

const TAB_LABELS: Record<OpsTab, string> = {
  na_rua: 'Na rua',
  disponiveis: 'Disponíveis',
  atrasados: 'Atrasados',
  acertos: 'Acertos',
  cadastro: 'Cadastro',
}

const STATUS_LABELS: Record<EntregadorStatusOperacional, string> = {
  disponivel: 'Disponível',
  em_rota: 'Em rota',
  pausado: 'Pausado',
  indisponivel: 'Indisponível',
}

function parseMoneyInput(raw: string): number {
  const n = Number(raw.replace(',', '.').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

function formatDurationMinutes(m?: number): string {
  if (m == null || m < 0) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}h ${rm}min`
}

function orderTotal(o: OrderOnRouteDTO): number {
  if (typeof o.total === 'number') return o.total
  if (typeof o.total === 'string') {
    const n = Number(o.total.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function deliveryFeeNumber(o: OrderOnRouteDTO): number {
  if (typeof o.delivery_fee === 'number') return o.delivery_fee
  if (typeof o.delivery_fee === 'string') {
    const n = Number(o.delivery_fee.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function EntregadoresOpsClient({ storeId }: { storeId: string }) {
  const [tab, setTab] = useState<OpsTab>('na_rua')
  const [payload, setPayload] = useState<DeliveryOpsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [deliveryOrder, setDeliveryOrder] = useState<OrderOnRouteDTO | null>(null)
  const [delValorCorrida, setDelValorCorrida] = useState('')
  const [delClientePagou, setDelClientePagou] = useState(false)
  const [delValorRecebido, setDelValorRecebido] = useState('')
  const [delForma, setDelForma] = useState<'dinheiro' | 'pix' | 'cartao'>('dinheiro')
  const [delObs, setDelObs] = useState('')
  const [delSubmitting, setDelSubmitting] = useState(false)

  const [settlementGroup, setSettlementGroup] = useState<CourierBalanceGroup | null>(null)
  const [settlementValor, setSettlementValor] = useState('')
  const [settlementForma, setSettlementForma] = useState<'dinheiro' | 'pix'>('dinheiro')
  const [settlementObs, setSettlementObs] = useState('')
  const [settlementBusy, setSettlementBusy] = useState(false)

  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  const loadOps = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const res = await dashboardFetch('/api/delivery-ops')
      const json = (await res.json().catch(() => ({}))) as DeliveryOpsPayload & {
        error?: string
        ok?: boolean
      }
      if (!res.ok) {
        setError(json.error || 'Não foi possível carregar os dados operacionais.')
        return
      }
      setPayload({
        summary: json.summary,
        on_route: json.on_route ?? [],
        delayed: json.delayed ?? [],
        couriers: json.couriers ?? [],
        balances: json.balances ?? [],
        missingColumns: json.missingColumns,
      })
    } catch {
      setError('Erro de rede ao carregar entregadores.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadOps()
    const id = window.setInterval(() => void loadOps(true), 30_000)
    return () => window.clearInterval(id)
  }, [loadOps])

  useEffect(() => {
    if (!storeId) return
    const unsubscribe = subscribeStoreOrdersSync(storeId, (detail) => {
      if (detail.source !== 'orders' && detail.source !== 'order_items') return
      void loadOps(true)
    })
    return unsubscribe
  }, [storeId, loadOps])

  const onRouteIds = useMemo(
    () => new Set(payload?.on_route.map((o) => o.entregador_id).filter(Boolean)),
    [payload?.on_route]
  )

  const disponiveisList = useMemo(() => {
    if (!payload) return []
    return payload.couriers.filter(
      (c) =>
        c.ativo &&
        !onRouteIds.has(c.id) &&
        (c.status_operacional === 'disponivel' || c.status_operacional === 'pausado')
    )
  }, [payload, onRouteIds])

  function openDeliveryModal(order: OrderOnRouteDTO) {
    const courier = payload?.couriers.find((c) => c.id === order.entregador_id)
    const fee = deliveryFeeNumber(order)
    const defaultCorrida =
      courier?.valor_padrao_corrida && courier.valor_padrao_corrida > 0
        ? courier.valor_padrao_corrida
        : 0
    setDeliveryOrder(order)
    setDelValorCorrida(
      defaultCorrida > 0 ? String(defaultCorrida).replace('.', ',') : ''
    )
    setDelClientePagou(false)
    setDelValorRecebido(fee > 0 ? String(fee).replace('.', ',') : '')
    setDelForma('dinheiro')
    setDelObs('')
  }

  async function submitDelivery() {
    if (!deliveryOrder) return
    const valorCorrida = parseMoneyInput(delValorCorrida)
    const valorRecebido = delClientePagou ? parseMoneyInput(delValorRecebido) : 0
    if (delClientePagou && valorRecebido <= 0) {
      alert('Indica o valor recebido do cliente.')
      return
    }
    setDelSubmitting(true)
    try {
      const res = await dashboardFetch('/api/orders/register-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: deliveryOrder.id,
          skip: false,
          entregadorId: deliveryOrder.entregador_id,
          valorCorrida,
          clientePagouTaxa: delClientePagou,
          valorRecebidoCliente: delClientePagou ? valorRecebido : 0,
          formaPagamentoEntrega: delClientePagou ? delForma : undefined,
          observacao: delObs.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        alert(json.error || 'Não foi possível registar a entrega.')
        return
      }
      setDeliveryOrder(null)
      notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
      await loadOps(true)
    } finally {
      setDelSubmitting(false)
    }
  }

  function openSettlement(group: CourierBalanceGroup) {
    if (group.entregas.length === 0 || Math.abs(group.saldo) < 0.005) return
    setSettlementGroup(group)
    setSettlementValor(String(Math.abs(group.saldo)).replace('.', ','))
    setSettlementForma('dinheiro')
    setSettlementObs('')
  }

  async function submitSettlement() {
    if (!settlementGroup) return
    const valor = parseMoneyInput(settlementValor)
    if (valor <= 0) {
      alert('Indica um valor válido para o acerto.')
      return
    }
    setSettlementBusy(true)
    try {
      const res = await dashboardFetch('/api/delivery-ops/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entregadorId: settlementGroup.entregador_id,
          entregadorNome: settlementGroup.nome,
          entregaIds: settlementGroup.entregas.map((e) => e.id),
          valor,
          forma: settlementForma,
          observacao: settlementObs.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        alert(json.error || 'Não foi possível registar o acerto.')
        return
      }
      setSettlementGroup(null)
      await loadOps(true)
    } finally {
      setSettlementBusy(false)
    }
  }

  async function patchCourierStatus(id: string, status: EntregadorStatusOperacional) {
    setStatusBusyId(id)
    try {
      const res = await dashboardFetch('/api/store/entregadores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status_operacional: status }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        alert(json.error || 'Não foi possível atualizar o status.')
        return
      }
      await loadOps(true)
    } finally {
      setStatusBusyId(null)
    }
  }

  const summary = payload?.summary

  return (
    <div className="space-y-6">
      {payload?.missingColumns ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Migração operacional pendente. Aplica{' '}
          <code className="rounded bg-amber-100 px-1 text-xs">
            supabase/migrations/20260725190003_entregadores_schema.sql
          </code>{' '}
          no Supabase para despacho e painel completo.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}{' '}
          <button
            type="button"
            onClick={() => void loadOps()}
            className="font-semibold underline"
          >
            Tentar novamente
          </button>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ['disponiveis', summary?.disponiveis ?? 0, 'Disponíveis', 'disponiveis'],
            ['na_rua', summary?.na_rua ?? 0, 'Na rua', 'na_rua'],
            ['atrasados', summary?.atrasados ?? 0, 'Atrasados', 'atrasados'],
            [
              'saldo_pagar',
              money.format(summary?.saldo_loja_deve ?? 0),
              'Loja deve',
              'acertos',
            ],
            [
              'saldo_receber',
              money.format(summary?.saldo_entregador_deve ?? 0),
              'Entregador deve',
              'acertos',
            ],
          ] as const
        ).map(([key, value, label, targetTab]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(targetTab as OpsTab)}
            className={`rounded-2xl border px-4 py-3 text-left shadow-sm transition-all ${
              tab === targetTab
                ? 'border-[var(--dash-primary)]/30 bg-[var(--dash-primary)]/5 ring-1 ring-[var(--dash-primary)]/20'
                : 'border-[var(--card-border)] bg-white hover:border-[var(--dash-primary)]/20'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
              {label}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[#1a1614]">{value}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TAB_LABELS) as OpsTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t
                ? 'bg-[var(--dash-primary)] text-white shadow-sm'
                : 'bg-white text-[#374151] ring-1 ring-[var(--card-border)] hover:bg-[#fafafa]'
            }`}
          >
            {TAB_LABELS[t]}
            {t === 'na_rua' && summary ? (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">
                {summary.na_rua}
              </span>
            ) : null}
            {t === 'atrasados' && summary && summary.atrasados > 0 ? (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-xs text-white">
                {summary.atrasados}
              </span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void loadOps(true)}
          className="ml-auto rounded-full px-3 py-2 text-xs font-semibold text-[var(--dash-primary)] hover:underline disabled:opacity-50"
        >
          {refreshing ? 'A atualizar…' : 'Atualizar'}
        </button>
      </div>

      {loading && !payload ? (
        <p className="text-sm text-[#6b7280]">A carregar painel operacional…</p>
      ) : null}

      {tab === 'na_rua' ? (
        <section className="space-y-3">
          {!payload?.on_route.length ? (
            <EmptyState message="Nenhum pedido a caminho com entregador atribuído." />
          ) : (
            payload.on_route.map((o) => (
              <OnRouteCard key={o.id} order={o} onDeliver={() => openDeliveryModal(o)} />
            ))
          )}
        </section>
      ) : null}

      {tab === 'atrasados' ? (
        <section className="space-y-3">
          {!payload?.delayed.length ? (
            <EmptyState message="Nenhum pedido atrasado no momento." />
          ) : (
            payload.delayed.map((o) => (
              <OnRouteCard
                key={o.id}
                order={o}
                delayed
                onDeliver={() => openDeliveryModal(o)}
              />
            ))
          )}
        </section>
      ) : null}

      {tab === 'disponiveis' ? (
        <section className="space-y-3">
          {!disponiveisList.length ? (
            <EmptyState message="Nenhum entregador disponível ou em pausa sem rota." />
          ) : (
            disponiveisList.map((c) => (
              <CourierCard
                key={c.id}
                courier={c}
                busy={statusBusyId === c.id}
                onStatusChange={(s) => void patchCourierStatus(c.id, s)}
              />
            ))
          )}
          {payload?.couriers.some((c) => c.ativo && c.status_operacional === 'em_rota') ? (
            <p className="text-xs text-[#6b7280]">
              Entregadores em rota aparecem nos pedidos «Na rua» e voltam a disponível após a
              entrega.
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === 'acertos' ? (
        <section className="space-y-4">
          <p className="text-sm text-[#6b7280]">
            Acertos registam movimentação no{' '}
            <Link href="/dashboard/caixa" className="font-semibold text-[var(--dash-primary)] hover:underline">
              Caixa
            </Link>{' '}
            e marcam entregas como quitadas. É necessário turno aberto.
          </p>
          {!payload?.balances.filter((b) => b.pending_settlement).length ? (
            <EmptyState message="Nenhum acerto pendente hoje." />
          ) : (
            payload.balances
              .filter((b) => b.pending_settlement)
              .map((g) => (
                <BalanceCard
                  key={g.key}
                  group={g}
                  onSettle={() => openSettlement(g)}
                />
              ))
          )}
        </section>
      ) : null}

      {tab === 'cadastro' ? <EntregadoresManagePanel /> : null}

      {deliveryOrder ? (
        <ModalShell
          title={`Registar entrega — #${deliveryOrder.display_ref ?? deliveryOrder.id.slice(0, 8)}`}
          onClose={() => !delSubmitting && setDeliveryOrder(null)}
        >
          <div className="space-y-1 text-sm text-[#374151]">
            <p>
              <span className="text-[#6b7280]">Cliente:</span>{' '}
              {deliveryOrder.customer_name || '—'}
            </p>
            <p>
              <span className="text-[#6b7280]">Entregador:</span>{' '}
              {deliveryOrder.entregador_nome || '—'}
            </p>
            {deliveryOrder.delivery_address ? (
              <p className="text-xs text-[#6b7280]">{deliveryOrder.delivery_address}</p>
            ) : null}
          </div>

          <label className="mt-4 block text-xs font-medium text-[#6b7280]">
            Valor da corrida (R$)
            <input
              type="text"
              inputMode="decimal"
              value={delValorCorrida}
              onChange={(e) => setDelValorCorrida(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-3 py-3">
            <span className="text-sm font-medium text-[#374151]">
              Cliente pagou taxa ao entregador?
            </span>
            <button
              type="button"
              onClick={() => {
                setDelClientePagou((v) => {
                  if (!v) {
                    const fee = deliveryFeeNumber(deliveryOrder)
                    setDelValorRecebido(
                      fee > 0 ? String(fee).replace('.', ',') : ''
                    )
                  }
                  return !v
                })
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                delClientePagou
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-[#6b7280] ring-1 ring-[var(--card-border)]'
              }`}
            >
              {delClientePagou ? 'Sim' : 'Não'}
            </button>
          </div>

          {delClientePagou ? (
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-[#6b7280]">
                Valor recebido (R$)
                <input
                  type="text"
                  inputMode="decimal"
                  value={delValorRecebido}
                  onChange={(e) => setDelValorRecebido(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-[#6b7280]">
                Forma de pagamento
                <select
                  value={delForma}
                  onChange={(e) =>
                    setDelForma(e.target.value as 'dinheiro' | 'pix' | 'cartao')
                  }
                  className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="cartao">Cartão</option>
                </select>
              </label>
            </div>
          ) : null}

          <label className="mt-4 block text-xs font-medium text-[#6b7280]">
            Observação <span className="font-normal text-[#9ca3af]">(opcional)</span>
            <input
              value={delObs}
              onChange={(e) => setDelObs(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={delSubmitting}
              onClick={() => setDeliveryOrder(null)}
              className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-[#374151]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={delSubmitting}
              onClick={() => void submitDelivery()}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {delSubmitting ? 'A guardar…' : 'Confirmar entrega'}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {settlementGroup ? (
        <ModalShell
          title={`Acerto — ${settlementGroup.nome}`}
          onClose={() => !settlementBusy && setSettlementGroup(null)}
        >
          <p className="text-sm text-[#6b7280]">
            {settlementGroup.entregas.length} entrega(s) · Corridas{' '}
            {money.format(settlementGroup.total_corrida)} · Recebido{' '}
            {money.format(settlementGroup.total_recebido)} · Saldo{' '}
            <strong className={settlementGroup.saldo >= 0 ? 'text-emerald-700' : 'text-amber-800'}>
              {money.format(settlementGroup.saldo)}
            </strong>
          </p>

          <label className="mt-4 block text-xs font-medium text-[#6b7280]">
            Valor do acerto (R$)
            <input
              type="text"
              inputMode="decimal"
              value={settlementValor}
              onChange={(e) => setSettlementValor(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>

          <label className="mt-3 block text-xs font-medium text-[#6b7280]">
            Forma
            <select
              value={settlementForma}
              onChange={(e) => setSettlementForma(e.target.value as 'dinheiro' | 'pix')}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            >
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
            </select>
          </label>

          <label className="mt-3 block text-xs font-medium text-[#6b7280]">
            Observação <span className="font-normal text-[#9ca3af]">(opcional)</span>
            <input
              value={settlementObs}
              onChange={(e) => setSettlementObs(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={settlementBusy}
              onClick={() => setSettlementGroup(null)}
              className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-[#374151]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={settlementBusy}
              onClick={() => void submitSettlement()}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {settlementBusy ? 'A registar…' : 'Registrar acerto'}
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--card-border)] bg-[#fafafa] px-6 py-10 text-center text-sm text-[#6b7280]">
      {message}
    </div>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-[#1a1614]">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function OnRouteCard({
  order,
  delayed,
  onDeliver,
}: {
  order: OrderOnRouteDTO
  delayed?: boolean
  onDeliver: () => void
}) {
  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        delayed ? 'border-red-200 ring-1 ring-red-100' : 'border-[var(--card-border)]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            #{order.display_ref ?? '—'}
            {delayed ? (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-800">
                Atrasado
              </span>
            ) : null}
          </p>
          <p className="mt-1 font-semibold text-[#1a1614]">
            {order.customer_name || 'Cliente'}
          </p>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {order.delivery_address || 'Sem morada'}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-bold text-[#1a1614]">{money.format(orderTotal(order))}</p>
          <p className="text-xs text-[#6b7280]">
            {order.entrega_despachada_em
              ? `Saída ${timeFmt.format(new Date(order.entrega_despachada_em))}`
              : '—'}
          </p>
          <p
            className={`text-xs font-semibold ${
              delayed ? 'text-red-700' : 'text-[var(--dash-primary)]'
            }`}
          >
            {formatDurationMinutes(order.minutes_on_route)} em rota
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)]/80 pt-3">
        <p className="text-sm text-[#374151]">
          <span className="text-[#6b7280]">Entregador:</span>{' '}
          {order.entregador_nome || '—'}
        </p>
        <button
          type="button"
          onClick={onDeliver}
          className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          Registar entrega
        </button>
      </div>
    </article>
  )
}

function CourierCard({
  courier,
  busy,
  onStatusChange,
}: {
  courier: StoreEntregadorOpsDTO
  busy: boolean
  onStatusChange: (s: EntregadorStatusOperacional) => void
}) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
      <div>
        <p className="font-semibold text-[#1a1614]">{courier.nome}</p>
        <p className="text-xs text-[#6b7280]">{courier.telefone || 'Sem telefone'}</p>
        {courier.valor_padrao_corrida > 0 ? (
          <p className="mt-1 text-xs text-[#6b7280]">
            Corrida padrão: {money.format(courier.valor_padrao_corrida)}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
            courier.status_operacional === 'disponivel'
              ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
              : courier.status_operacional === 'pausado'
                ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                : 'bg-[#f3f4f6] text-[#6b7280] ring-1 ring-[var(--card-border)]'
          }`}
        >
          {STATUS_LABELS[courier.status_operacional]}
        </span>
        <select
          disabled={busy || courier.status_operacional === 'em_rota'}
          value={courier.status_operacional === 'em_rota' ? 'disponivel' : courier.status_operacional}
          onChange={(e) =>
            onStatusChange(e.target.value as EntregadorStatusOperacional)
          }
          className="rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-xs font-semibold"
        >
          <option value="disponivel">Disponível</option>
          <option value="pausado">Pausado</option>
          <option value="indisponivel">Indisponível</option>
        </select>
      </div>
    </article>
  )
}

function BalanceCard({
  group,
  onSettle,
}: {
  group: CourierBalanceGroup
  onSettle: () => void
}) {
  const canSettle = group.entregas.length > 0 && Math.abs(group.saldo) >= 0.005
  return (
    <article className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#1a1614]">{group.nome}</p>
          <p className="mt-1 text-xs text-[#6b7280]">
            {group.entregas.length} entrega(s) pendente(s)
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-[#6b7280]">
            Corridas {money.format(group.total_corrida)}
          </p>
          <p className="text-[#6b7280]">
            Recebido {money.format(group.total_recebido)}
          </p>
          <p
            className={`font-bold ${
              group.saldo >= 0 ? 'text-emerald-700' : 'text-amber-800'
            }`}
          >
            Saldo {money.format(group.saldo)}
          </p>
        </div>
      </div>
      {canSettle ? (
        <button
          type="button"
          onClick={onSettle}
          className="mt-3 w-full rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm sm:w-auto"
        >
          Registrar acerto
        </button>
      ) : null}
    </article>
  )
}
