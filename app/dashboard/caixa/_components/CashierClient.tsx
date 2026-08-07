'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aggregateTurnClosedOrders } from '@/lib/caixa-payments'
import type { CaixaMovimentacaoDTO, CaixaTurnoDTO } from '@/lib/caixa-types'
import { openCaixaTurnoEscPosPrint } from '@/lib/caixa-print-window'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import type { EntregaDTO, StoreEntregadorDTO } from '@/lib/entregas-types'
import { entregaPendenteAcerto, saldoEntregaLinha } from '@/lib/entregas-types'
import type { PaperMm } from '@/lib/print/layout'
import {
  openOrderTicketPrint,
  orderTicketVariantFromSource,
} from '@/lib/order-print-window'
import {
  canUseConfiguredPrintAgent,
  sendOrderTicketToPrintAgent,
} from '@/lib/print-agent-client'
import type { StorePrintingState } from '@/lib/store-printing'
import type { StoreOrderRow } from '@/lib/store-order'
import { mapStoreOrderRow, ORDER_SELECT } from '@/lib/store-order'
import {
  isFinanciallyClosedOrder,
  isOpenCaixaComanda,
  isPaidInCaixaTurno,
  orderPaymentRegisteredInCaixa,
} from '@/lib/cashier-comanda-close'
import { isPdvWaiterComandaSource } from '@/lib/cashier-pro-delivery-scope'
import { createClient } from '@/lib/supabase/client'
import {
  notifyStoreOrdersChanged,
  subscribeOperationalVisibilityRefresh,
  subscribeStoreOrdersSync,
} from '@/lib/store-operational-realtime.client'
import { IconPrinter } from '@/app/dashboard/_components/NavIcons'
import { ComandaSplitPaymentModal } from './ComandaSplitPaymentModal'
import { comandaDisplayName } from '@/lib/order-payments'
import type { OrderPaymentLine, OrderPaymentRow } from '@/lib/order-payments'
import { notesIndicateWaiterReleasedToCaixa, parseTableFromNotes } from '@/lib/waiter-order-notes'
import {
  type PendingOrderOverlay,
  OPERATIONAL_OVERLAY_CONFIRM_FAIL_MESSAGE,
  clearPendingOrderOverlay,
  reconcileOrdersWithPendingOverlays,
  registerPendingOrderOverlay,
} from '@/lib/operational-sync-reconcile'
import {
  isOperationalActionInFlight,
  operationalActionKey,
} from '@/lib/operational-action-flight.client'

type SourceKey = 'waiter' | 'pdv' | 'menu_link'

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function orderStatusRank(status: string | null | undefined): number {
  const s = status ?? ''
  if (s === 'delivered' || s === 'cancelled') return 2
  if (s === 'ready') return 1
  return 0
}

function shouldKeepCashierOrderOverlay(
  serverRow: StoreOrderRow,
  overlay: StoreOrderRow
): boolean {
  const localPaid = orderPaymentRegisteredInCaixa(overlay.notes)
  const serverPaid = orderPaymentRegisteredInCaixa(serverRow.notes)
  if (localPaid && !serverPaid) return true
  if (orderStatusRank(overlay.status) > orderStatusRank(serverRow.status)) return true
  return false
}

function reconcileCashierOrdersFromServer(
  serverRows: StoreOrderRow[],
  overlays: Map<string, PendingOrderOverlay>,
  onSafetyExpired?: (orderId: string) => void
): StoreOrderRow[] {
  return reconcileOrdersWithPendingOverlays(
    serverRows,
    overlays,
    shouldKeepCashierOrderOverlay,
    {
      isActionInFlight: isOperationalActionInFlight,
      onSafetyExpired: onSafetyExpired
        ? (orderId) => onSafetyExpired(orderId)
        : undefined,
    }
  )
}

const FinanceiroView = dynamic(
  () => import('./FinanceiroView').then((m) => ({ default: m.FinanceiroView })),
  {
    loading: () => (
      <div className="rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center text-sm text-[#6b7280]">
        Carregando financeiro…
      </div>
    ),
  }
)

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const timeOnlyFmt = new Intl.DateTimeFormat('pt-BR', {
  timeStyle: 'short',
})

function mapSource(source: string | null | undefined): SourceKey {
  const s = (source || '').trim().toLowerCase()
  if (s === 'waiter' || s === 'autoatendimento') return 'waiter'
  if (s === 'pdv') return 'pdv'
  return 'menu_link'
}

function sourceLabel(k: SourceKey, opts?: { proDelivery?: boolean }): string {
  if (k === 'waiter') return 'Garçom'
  if (k === 'pdv') return 'Balcão'
  if (opts?.proDelivery) return 'Slug / QR (site)'
  return 'Link de cardápio'
}

type CaixaMetricsPeriod = 'turno' | 'today' | '7d' | '30d' | 'all'

function periodStart(period: Exclude<CaixaMetricsPeriod, 'turno'>): number {
  if (period === 'all') return 0
  const now = Date.now()
  if (period === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (period === '7d') return now - 7 * 86400000
  return now - 30 * 86400000
}

function formatDurationFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h}h ${rm}min`
}

function parseMoneyInput(raw: string): number {
  const n = Number(raw.replace(',', '.').trim())
  if (Number.isNaN(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function entregaGroupKey(e: EntregaDTO): string {
  return e.entregador_id ? e.entregador_id : `av:${e.entregador_nome.trim().toLowerCase()}`
}

function entregasPendentesAcerto(items: EntregaDTO[]): EntregaDTO[] {
  return items.filter(entregaPendenteAcerto)
}

function saldoPendenteEntregas(items: EntregaDTO[]): number {
  return round2(entregasPendentesAcerto(items).reduce((s, e) => s + saldoEntregaLinha(e), 0))
}

function movTipoLabel(t: CaixaMovimentacaoDTO['tipo']): string {
  if (t === 'sangria') return 'Sangria'
  if (t === 'suprimento') return 'Suprimento'
  return 'Acerto entregador'
}

type CashierClientProps = {
  storeId: string
  storeName: string
  printPaperMm: PaperMm
  initialOrders: StoreOrderRow[]
  operatorLabel: string
  initialTurno: CaixaTurnoDTO | null
  initialHistorico: CaixaTurnoDTO[]
  initialMovimentacoesPorTurno: Record<string, CaixaMovimentacaoDTO[]>
  initialEntregadores?: StoreEntregadorDTO[]
  initialEntregasTurno?: EntregaDTO[]
  initialTurnoSplitPayments?: OrderPaymentRow[]
  deliveryPipelineEnabled?: boolean
  entregasCaixaEnabled?: boolean
  /** Pro + modo delivery: sem comandas PDV/garçom; métricas só pedidos do site (slug/QR) + entregas na secção dedicada. */
  caixaProDeliveryOnly?: boolean
  showThermalPrint?: boolean
  printAgentUrl?: string
  printing: StorePrintingState
}

type CashierTab = 'operacao' | 'financeiro'

export function CashierClient(props: CashierClientProps) {
  const [activeTab, setActiveTab] = useState<CashierTab>('operacao')

  return (
    <div className="mx-auto w-full max-w-7xl pb-10">
      <div className="mb-5 inline-flex rounded-2xl border border-[var(--card-border)] bg-white p-1 shadow-sm">
        {(
          [
            ['operacao', 'Operação'],
            ['financeiro', 'Financeiro'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === id
                ? 'bg-[var(--dash-primary)] text-white shadow-sm'
                : 'text-[#374151] hover:bg-[#f9fafb]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'operacao' ? <OperacaoView {...props} /> : <FinanceiroView storeId={props.storeId} />}
    </div>
  )
}

function OperacaoView({
  storeId,
  storeName,
  printPaperMm,
  initialOrders,
  operatorLabel,
  initialTurno,
  initialHistorico,
  initialMovimentacoesPorTurno,
  initialEntregadores = [],
  initialEntregasTurno = [],
  initialTurnoSplitPayments = [],
  deliveryPipelineEnabled = true,
  /** Secção entregas / entregadores e chamadas à API de entregas — Growth+ com pipeline de entregas. */
  entregasCaixaEnabled = false,
  caixaProDeliveryOnly = false,
  showThermalPrint = false,
  printAgentUrl = '',
  printing,
}: CashierClientProps) {
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  const pendingOrderOverlaysRef = useRef<Map<string, PendingOrderOverlay>>(new Map())
  const onOverlaySafetyExpiredRef = useRef<(orderId: string) => void>(() => {})
  const [turno, setTurno] = useState<CaixaTurnoDTO | null>(initialTurno)
  const [historico, setHistorico] = useState(initialHistorico)
  const [movMap, setMovMap] = useState(initialMovimentacoesPorTurno)
  const [period, setPeriod] = useState<CaixaMetricsPeriod>('turno')
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceKey>('all')
  const [openingCashInput, setOpeningCashInput] = useState('')
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null)
  const [thermalBusyOrderId, setThermalBusyOrderId] = useState<string | null>(null)
  const [cashierError, setCashierError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busyOpen, setBusyOpen] = useState(false)
  const [busyClose, setBusyClose] = useState(false)
  const [movModalOpen, setMovModalOpen] = useState(false)
  const [movTipo, setMovTipo] = useState<'suprimento' | 'sangria'>('suprimento')
  const [movValor, setMovValor] = useState('')
  const [movMotivo, setMovMotivo] = useState('')
  const [busyMov, setBusyMov] = useState(false)
  const [closeFlow, setCloseFlow] = useState<
    null | { step: 'warn' | 'summary'; comandasCount: number }
  >(null)
  const [infD, setInfD] = useState('')
  const [infP, setInfP] = useState('')
  const [infC, setInfC] = useState('')
  const [infCr, setInfCr] = useState('')
  const [fundoProximo, setFundoProximo] = useState('')
  const [expandedHistoricoId, setExpandedHistoricoId] = useState<string | null>(null)

  const [entregadores, setEntregadores] = useState<StoreEntregadorDTO[]>(initialEntregadores)
  const [entregasApi, setEntregasApi] = useState<EntregaDTO[]>(initialEntregasTurno)
  const [entPeriod, setEntPeriod] = useState<'turno' | 'hoje' | '7d'>('turno')
  const [entFilterQuick, setEntFilterQuick] = useState<'all' | 'pendente' | 'by_driver'>('all')
  const [entDriverKey, setEntDriverKey] = useState('')
  const [busyEntregas, setBusyEntregas] = useState(false)
  const [acertoModal, setAcertoModal] = useState<
    | null
    | {
        key: string
        nome: string
        tipo: 'fixo' | 'autonomo' | null
        n: number
        saldo: number
        entregadorId: string | null
        entregaIds: string[]
      }
  >(null)
  const [acertoValor, setAcertoValor] = useState('')
  const [acertoForma, setAcertoForma] = useState<'dinheiro' | 'pix'>('dinheiro')
  const [acertoObs, setAcertoObs] = useState('')
  const [busyAcerto, setBusyAcerto] = useState(false)
  const [acertoFeitoPorKey, setAcertoFeitoPorKey] = useState<Record<string, boolean>>({})
  const [entregasTurnoAtual, setEntregasTurnoAtual] = useState<EntregaDTO[]>(initialEntregasTurno)
  const [turnoSplitPayments, setTurnoSplitPayments] = useState<OrderPaymentRow[]>(
    initialTurnoSplitPayments
  )
  const [splitModalOrder, setSplitModalOrder] = useState<StoreOrderRow | null>(null)

  const pullCashierOrders = useCallback(async () => {
    const supabase = createClient()
    const from = new Date(Date.now() - 45 * 86400000).toISOString()
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('store_id', storeId)
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error || !data) return
    let rows = (data as Record<string, unknown>[]).map(mapStoreOrderRow)
    if (caixaProDeliveryOnly) {
      rows = rows.filter((o) => !isPdvWaiterComandaSource(o.source))
    }
    setOrders(() =>
      reconcileCashierOrdersFromServer(
        rows,
        pendingOrderOverlaysRef.current,
        (orderId) => onOverlaySafetyExpiredRef.current(orderId)
      )
    )

    const activeTurnoId = turno?.status === 'aberto' ? turno.id : null
    if (!activeTurnoId) {
      setTurnoSplitPayments([])
      return
    }
    const { data: payRows } = await supabase
      .from('order_payments')
      .select('id, order_id, payment_method, amount_brl, caixa_turno_id')
      .eq('store_id', storeId)
      .eq('caixa_turno_id', activeTurnoId)
    setTurnoSplitPayments(
      (payRows ?? []).map((row) => ({
        id: String(row.id),
        order_id: String(row.order_id),
        payment_method: String(row.payment_method),
        amount_brl: Number(row.amount_brl) || 0,
        caixa_turno_id:
          typeof row.caixa_turno_id === 'string' ? row.caixa_turno_id : null,
      }))
    )
  }, [storeId, caixaProDeliveryOnly, turno?.id, turno?.status])

  useEffect(() => {
    setTurnoSplitPayments(initialTurnoSplitPayments)
  }, [initialTurnoSplitPayments])

  useEffect(() => {
    setOrders(() =>
      reconcileCashierOrdersFromServer(initialOrders, pendingOrderOverlaysRef.current)
    )
  }, [initialOrders])
  useEffect(() => {
    setTurno(initialTurno)
  }, [initialTurno])
  useEffect(() => {
    setHistorico(initialHistorico)
  }, [initialHistorico])
  useEffect(() => {
    setMovMap(initialMovimentacoesPorTurno)
  }, [initialMovimentacoesPorTurno])
  useEffect(() => {
    setEntregadores(initialEntregadores)
  }, [initialEntregadores])
  useEffect(() => {
    setEntregasApi(initialEntregasTurno)
  }, [initialEntregasTurno])
  useEffect(() => {
    setEntregasTurnoAtual(initialEntregasTurno)
  }, [initialEntregasTurno])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4500)
  }, [])

  useEffect(() => {
    onOverlaySafetyExpiredRef.current = (orderId: string) => {
      clearPendingOrderOverlay(pendingOrderOverlaysRef.current, orderId)
      showToast(OPERATIONAL_OVERLAY_CONFIRM_FAIL_MESSAGE)
      void pullCashierOrders()
    }
  }, [pullCashierOrders, showToast])

  const displayNumberById = useMemo(() => {
    const sorted = [...orders].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const m = new Map<string, string>()
    sorted.forEach((o, i) => {
      m.set(o.id, String(i + 1).padStart(3, '0'))
    })
    return m
  }, [orders])

  const printComandaCaixa = useCallback(
    (o: StoreOrderRow) => {
      const orderRef =
        displayNumberById.get(o.id) ?? o.id.replace(/-/g, '').slice(0, 8)
      const r = openOrderTicketPrint({
        storeName,
        order: o,
        orderDisplayRef: orderRef,
        printing: {
          print_include_customer_details: printing.print_include_customer_details,
          print_delivery_copy: printing.print_delivery_copy,
          print_paper_mm: printing.print_paper_mm,
        },
        variant: orderTicketVariantFromSource(o.source, o),
      })
      if (r === 'failed') {
        showToast('Permite pop-ups para abrir a comanda.')
      }
    },
    [displayNumberById, printing, showToast, storeName]
  )

  const printOrderDefault = useCallback(
    async (o: StoreOrderRow) => {
      const useThermal =
        showThermalPrint && Boolean(printAgentUrl?.trim())
      if (useThermal) {
        setThermalBusyOrderId(o.id)
        showToast('A imprimir…')
        const orderRef =
          displayNumberById.get(o.id) ?? o.id.replace(/-/g, '').slice(0, 8)
        try {
          if (canUseConfiguredPrintAgent(printing)) {
            const direct = await sendOrderTicketToPrintAgent(
              {
                storeName,
                order: o,
                orderDisplayRef: orderRef,
                printing: {
                  print_include_customer_details:
                    printing.print_include_customer_details,
                  print_delivery_copy: printing.print_delivery_copy,
                  print_paper_mm: printing.print_paper_mm,
                },
                variant: orderTicketVariantFromSource(o.source, o),
              },
              printing
            )
            if (direct.ok) {
              showToast('Comanda enviada à impressora.')
              return
            }
          }
          const res = await dashboardFetch('/api/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store_id: storeId, order_id: o.id }),
          })
          const json = (await res.json().catch(() => ({}))) as {
            error?: string
            ok?: boolean
          }
          if (res.ok && json.ok) {
            showToast('Comanda enviada à impressora.')
            return
          }
        } catch {
          /* abre pré-visualização */
        } finally {
          setThermalBusyOrderId(null)
        }
        showToast('A abrir pré-visualização…')
      }
      printComandaCaixa(o)
    },
    [
      displayNumberById,
      printAgentUrl,
      printComandaCaixa,
      printing,
      showThermalPrint,
      showToast,
      storeId,
      storeName,
    ]
  )

  useEffect(() => {
    if (!deliveryPipelineEnabled && sourceFilter === 'menu_link') {
      setSourceFilter('all')
    }
  }, [deliveryPipelineEnabled, sourceFilter])

  useEffect(() => {
    if (caixaProDeliveryOnly && (sourceFilter === 'waiter' || sourceFilter === 'pdv')) {
      setSourceFilter('all')
    }
  }, [caixaProDeliveryOnly, sourceFilter])

  const filteredOrders = useMemo(() => {
    if (period === 'turno' && (!turno || turno.status !== 'aberto')) return []
    const from =
      period === 'turno'
        ? new Date(turno!.aberto_em).getTime()
        : periodStart(period)
    return orders.filter((o) => {
      const created = new Date(o.created_at).getTime()
      if (period !== 'all' && (!Number.isFinite(created) || created < from)) return false
      if (o.status === 'cancelled') return false
      if (sourceFilter === 'all') return true
      return mapSource(o.source) === sourceFilter
    })
  }, [orders, period, sourceFilter, turno])

  /** Pedidos já recebidos — métricas de faturamento não incluem comandas em aberto. */
  const paidOrdersForMetrics = useMemo(
    () => filteredOrders.filter((o) => isFinanciallyClosedOrder(o)),
    [filteredOrders]
  )

  const summary = useMemo(() => {
    const base: Record<SourceKey, { count: number; total: number }> = {
      waiter: { count: 0, total: 0 },
      pdv: { count: 0, total: 0 },
      menu_link: { count: 0, total: 0 },
    }
    for (const o of paidOrdersForMetrics) {
      const k = mapSource(o.source)
      const total = Number(o.total) || 0
      base[k].count += 1
      base[k].total += total
    }
    return base
  }, [paidOrdersForMetrics])

  const totalCount = paidOrdersForMetrics.length
  const totalRevenue = summary.waiter.total + summary.pdv.total + summary.menu_link.total
  const avgTicket = totalCount > 0 ? totalRevenue / totalCount : 0

  const shiftBreakdown = useMemo(() => {
    if (!turno || turno.status !== 'aberto') return null
    return aggregateTurnClosedOrders(
      orders.filter(
        (o) =>
          o.caixa_turno_id === turno.id && isPaidInCaixaTurno(o)
      ),
      turnoSplitPayments
    )
  }, [orders, turno, turnoSplitPayments])

  const openComandas = useMemo(() => {
    return orders.filter((o) => isOpenCaixaComanda(o))
  }, [orders])

  const movimentacoesTurnoAtual = turno ? movMap[turno.id] ?? [] : []

  const turnoId = turno?.id

  const reloadEntregas = useCallback(async () => {
    if (!entregasCaixaEnabled) {
      setEntregasApi([])
      setEntregasTurnoAtual([])
      setBusyEntregas(false)
      return
    }
    if (entPeriod === 'turno' && !turnoId) {
      setEntregasApi([])
      setEntregasTurnoAtual([])
      return
    }
    setBusyEntregas(true)
    try {
      const params = new URLSearchParams()
      if (entPeriod === 'turno') {
        params.set('period', 'turno')
        params.set('turnoId', turnoId!)
      } else {
        params.set('period', entPeriod === 'hoje' ? 'hoje' : '7d')
      }
      if (entFilterQuick === 'pendente') params.set('pendenteSaldo', '1')
      if (entFilterQuick === 'by_driver' && entDriverKey && !entDriverKey.startsWith('av:')) {
        params.set('entregadorId', entDriverKey)
      }
      const res = await dashboardFetch(`/api/entregas?${params.toString()}`)
      const json = (await res.json().catch(() => ({}))) as {
        entregas?: EntregaDTO[]
        error?: string
      }
      if (!res.ok) {
        showToast(json.error || 'Erro ao listar entregas.')
        return
      }
      const list = json.entregas ?? []
      setEntregasApi(list)
      if (entPeriod === 'turno') setEntregasTurnoAtual(list)
    } finally {
      setBusyEntregas(false)
    }
  }, [
    turnoId,
    entPeriod,
    entFilterQuick,
    entDriverKey,
    showToast,
    entregasCaixaEnabled,
  ])

  useEffect(() => {
    void reloadEntregas()
  }, [reloadEntregas])

  useEffect(() => {
    if (!storeId) return
    let refreshTimer: number | null = null

    function scheduleRefresh() {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        router.refresh()
        void reloadEntregas()
      }, 350)
    }

    const unsubscribe = subscribeStoreOrdersSync(storeId, (detail) => {
      if (detail.source === 'orders' || detail.source === 'order_items' || detail.source === 'order_payments') {
        void pullCashierOrders()
        scheduleRefresh()
        return
      }
      scheduleRefresh()
    })

    const unsubscribeVis = subscribeOperationalVisibilityRefresh(() => {
      void pullCashierOrders()
    })

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      unsubscribe()
      unsubscribeVis()
    }
  }, [storeId, router, reloadEntregas, pullCashierOrders])

  const entregasTabela = useMemo(() => {
    if (entFilterQuick === 'by_driver' && !entDriverKey) return []
    let rows = entregasApi
    if (entFilterQuick === 'by_driver' && entDriverKey.startsWith('av:')) {
      const name = entDriverKey.slice(3).trim().toLowerCase()
      rows = rows.filter(
        (e) => !e.entregador_id && e.entregador_nome.trim().toLowerCase() === name
      )
    }
    return rows
  }, [entregasApi, entFilterQuick, entDriverKey])

  const driverFilterOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { key: string; label: string }[] = []
    for (const e of entregasApi) {
      const k = entregaGroupKey(e)
      if (seen.has(k)) continue
      seen.add(k)
      opts.push({ key: k, label: e.entregador_nome })
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, 'pt'))
  }, [entregasApi])

  const totEntCorr = useMemo(
    () => round2(entregasTabela.reduce((s, e) => s + e.valor_corrida, 0)),
    [entregasTabela]
  )
  const totEntRec = useMemo(
    () => round2(entregasTabela.reduce((s, e) => s + e.valor_recebido_cliente, 0)),
    [entregasTabela]
  )
  const totEntSaldo = useMemo(() => round2(totEntRec - totEntCorr), [totEntRec, totEntCorr])

  const resumoEntregasPendentes = useMemo(() => {
    let receber = 0
    let pagar = 0
    let count = 0
    for (const e of entregasApi) {
      if (!entregaPendenteAcerto(e)) continue
      count += 1
      const s = saldoEntregaLinha(e)
      if (s > 0) receber += s
      else if (s < 0) pagar += Math.abs(s)
    }
    return {
      count,
      receber: round2(receber),
      pagar: round2(pagar),
    }
  }, [entregasApi])

  const gruposEntregador = useMemo(() => {
    const m = new Map<
      string,
      {
        key: string
        nome: string
        tipo: 'fixo' | 'autonomo' | null
        items: EntregaDTO[]
      }
    >()
    for (const e of entregasTabela) {
      const key = entregaGroupKey(e)
      const cur = m.get(key)
      if (!cur) {
        const tipo = e.entregador_id
          ? entregadores.find((x) => x.id === e.entregador_id)?.tipo ?? null
          : null
        m.set(key, { key, nome: e.entregador_nome, tipo: tipo, items: [e] })
      } else {
        cur.items.push(e)
      }
    }
    return [...m.values()]
      .map((g) => {
        const tc = round2(g.items.reduce((s, x) => s + x.valor_corrida, 0))
        const tr = round2(g.items.reduce((s, x) => s + x.valor_recebido_cliente, 0))
        const saldo = round2(tr - tc)
        const pendentes = entregasPendentesAcerto(g.items)
        const saldoPendente = saldoPendenteEntregas(g.items)
        return {
          ...g,
          tc,
          tr,
          saldo,
          saldoPendente,
          n: g.items.length,
          nPendentes: pendentes.length,
          pendentes,
        }
      })
      .sort((a, b) => {
        const aPend = Math.abs(a.saldoPendente) >= 0.005 ? 0 : 1
        const bPend = Math.abs(b.saldoPendente) >= 0.005 ? 0 : 1
        if (aPend !== bPend) return aPend - bPend
        return a.nome.localeCompare(b.nome, 'pt')
      })
  }, [entregasTabela, entregadores])

  const gruposFechoTurno = useMemo(() => {
    const m = new Map<
      string,
      {
        key: string
        nome: string
        tipo: 'fixo' | 'autonomo' | null
        items: EntregaDTO[]
      }
    >()
    for (const e of entregasTurnoAtual) {
      const key = entregaGroupKey(e)
      const cur = m.get(key)
      if (!cur) {
        const tipo = e.entregador_id
          ? entregadores.find((x) => x.id === e.entregador_id)?.tipo ?? null
          : null
        m.set(key, { key, nome: e.entregador_nome, tipo: tipo, items: [e] })
      } else {
        cur.items.push(e)
      }
    }
    return [...m.values()].map((g) => {
      const tc = round2(g.items.reduce((s, x) => s + x.valor_corrida, 0))
      const tr = round2(g.items.reduce((s, x) => s + x.valor_recebido_cliente, 0))
      const saldo = round2(tr - tc)
      const pendentes = entregasPendentesAcerto(g.items)
      const saldoPendente = saldoPendenteEntregas(g.items)
      return {
        ...g,
        tc,
        tr,
        saldo,
        saldoPendente,
        n: g.items.length,
        nPendentes: pendentes.length,
        pendentes,
      }
    })
  }, [entregasTurnoAtual, entregadores])

  async function closeComanda(order: StoreOrderRow, payments: OrderPaymentLine[]) {
    setCashierError(null)
    setClosingOrderId(order.id)
    const actionKey = operationalActionKey('caixa-close', order.id)
    const optimisticClosed: StoreOrderRow = {
      ...order,
      status: 'delivered',
      payment_method:
        payments.length === 1 ? payments[0]!.method : 'split',
    }
    registerPendingOrderOverlay(
      pendingOrderOverlaysRef.current,
      order.id,
      optimisticClosed,
      actionKey
    )
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? optimisticClosed : o))
    )
    try {
      const body = { orderId: order.id, payments }

      const res = await dashboardFetch('/api/cashier/orders/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        operationalActionKey: actionKey,
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        order?: {
          id: string
          status: string
          payment_method: string
          notes?: string
          caixa_turno_id?: string
        }
        payments?: Array<{ method: string; amount: number }>
        fiscal?: {
          attempted?: boolean
          skipped?: boolean
          ok?: boolean
          motivo?: string
        }
      }
      if (!res.ok) {
        const err = json.error || 'Não foi possível fechar a comanda.'
        clearPendingOrderOverlay(pendingOrderOverlaysRef.current, order.id)
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? order : o))
        )
        setCashierError(err)
        showToast(err)
        return
      }
      const updated: StoreOrderRow = {
        ...order,
        status: json.order?.status || 'delivered',
        payment_method:
          json.order?.payment_method ||
          (payments.length === 1 ? payments[0]!.method : 'split'),
        notes: json.order?.notes ?? order.notes,
        caixa_turno_id: json.order?.caixa_turno_id ?? turno?.id ?? order.caixa_turno_id,
      }
      registerPendingOrderOverlay(
        pendingOrderOverlaysRef.current,
        order.id,
        updated,
        actionKey
      )
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? updated : o))
      )
      if (json.payments?.length) {
        setTurnoSplitPayments((prev) => [
          ...prev,
          ...json.payments!.map((p) => ({
            id: crypto.randomUUID(),
            order_id: order.id,
            payment_method: p.method,
            amount_brl: p.amount,
            caixa_turno_id: turno?.id ?? null,
          })),
        ])
      } else if (payments.length > 0) {
        setTurnoSplitPayments((prev) => [
          ...prev,
          ...payments.map((p) => ({
            id: crypto.randomUUID(),
            order_id: order.id,
            payment_method: p.method,
            amount_brl: p.amount,
            caixa_turno_id: turno?.id ?? null,
          })),
        ])
      }
      setSplitModalOrder(null)
      if (json.fiscal?.attempted && json.fiscal.ok) {
        showToast('Comanda fechada. NFC-e emitida.')
      } else if (json.fiscal?.attempted && !json.fiscal.ok) {
        showToast(
          `Comanda fechada. NFC-e: ${json.fiscal.motivo || 'não emitida — pode emitir em Fiscal.'}`
        )
      } else {
        showToast('Comanda fechada.')
      }
      notifyStoreOrdersChanged(storeId, { eventType: 'UPDATE' })
    } finally {
      setClosingOrderId(null)
    }
  }

  async function handleOpenTurno() {
    setBusyOpen(true)
    setCashierError(null)
    try {
      const res = await dashboardFetch('/api/cashier/turno/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundoInicial: parseMoneyInput(openingCashInput) }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível abrir o turno.')
        return
      }
      setOpeningCashInput('')
      showToast('Turno aberto. Já podes receber comandas.')
      router.refresh()
    } finally {
      setBusyOpen(false)
    }
  }

  async function handleMovimentacao() {
    if (!turno) return
    setBusyMov(true)
    try {
      const res = await dashboardFetch('/api/cashier/movimentacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: movTipo,
          valor: parseMoneyInput(movValor),
          motivo: movMotivo.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Erro ao registar.')
        return
      }
      setMovValor('')
      setMovMotivo('')
      setMovModalOpen(false)
      showToast(
        movTipo === 'sangria' ? 'Sangria registada.' : 'Suprimento registado.'
      )
      router.refresh()
    } finally {
      setBusyMov(false)
    }
  }

  function openCloseModal() {
    if (!turno) return
    const n = openComandas.length
    if (n > 0) setCloseFlow({ step: 'warn', comandasCount: n })
    else openCloseSummary()
  }

  function openCloseSummary() {
    if (!shiftBreakdown) return
    setInfD(String(shiftBreakdown.dinheiro.total.toFixed(2)).replace('.', ','))
    setInfP(String(shiftBreakdown.pix.total.toFixed(2)).replace('.', ','))
    setInfC(String(shiftBreakdown.cartao.total.toFixed(2)).replace('.', ','))
    setInfCr(String(shiftBreakdown.credito.total.toFixed(2)).replace('.', ','))
    setFundoProximo('0,00')
    const initialAcertos: Record<string, boolean> = {}
    for (const g of gruposFechoTurno) {
      initialAcertos[g.key] = Math.abs(g.saldoPendente) < 0.005
    }
    setAcertoFeitoPorKey(initialAcertos)
    setCloseFlow({ step: 'summary', comandasCount: openComandas.length })
  }

  async function confirmarAcertoEntregador() {
    if (!acertoModal || !turno) return
    if (acertoModal.entregaIds.length === 0) {
      showToast('Não há entregas pendentes de acerto para este entregador.')
      return
    }
    const v = parseMoneyInput(acertoValor)
    if (v <= 0) {
      showToast('Indica um valor válido para o acerto.')
      return
    }
    setBusyAcerto(true)
    try {
      const res = await dashboardFetch('/api/delivery-ops/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entregadorId: acertoModal.entregadorId,
          entregadorNome: acertoModal.nome,
          entregaIds: acertoModal.entregaIds,
          valor: v,
          forma: acertoForma,
          observacao: acertoObs.trim() || undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível registar o acerto.')
        return
      }
      setAcertoModal(null)
      setAcertoValor('')
      setAcertoObs('')
      setAcertoFeitoPorKey((prev) => ({ ...prev, [acertoModal.key]: true }))
      showToast('Acerto registado.')
      await reloadEntregas()
      router.refresh()
    } finally {
      setBusyAcerto(false)
    }
  }

  function exportarEntregasCsv() {
    const header = [
      'data',
      'pedido_id',
      'entregador',
      'valor_corrida',
      'recebido_cliente',
      'saldo',
      'acerto_realizado',
    ]
    const lines = entregasTabela.map((e) => {
      const saldo = saldoEntregaLinha(e)
      const acerto = e.acertado_em ? 'Sim' : 'Não'
      return [
        e.criado_em,
        e.order_id,
        e.entregador_nome.replaceAll(';', ','),
        String(e.valor_corrida),
        String(e.valor_recebido_cliente),
        String(saldo),
        acerto,
      ]
    })
    const csv = [header, ...lines].map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `entregas-${entPeriod}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function confirmCloseTurno() {
    if (!turno || !shiftBreakdown) return
    setBusyClose(true)
    try {
      const res = await dashboardFetch('/api/cashier/turno/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnoId: turno.id,
          informadoDinheiro: parseMoneyInput(infD),
          informadoPix: parseMoneyInput(infP),
          informadoCartao: parseMoneyInput(infC),
          informadoCredito: parseMoneyInput(infCr),
          fundoProximoTurno: parseMoneyInput(fundoProximo),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível fechar o turno.')
        return
      }
      setCloseFlow(null)
      showToast('Turno fechado com sucesso.')
      router.refresh()
    } finally {
      setBusyClose(false)
    }
  }

  const sysD = shiftBreakdown?.dinheiro.total ?? 0
  const sysP = shiftBreakdown?.pix.total ?? 0
  const sysC = shiftBreakdown?.cartao.total ?? 0
  const sysCr = shiftBreakdown?.credito.total ?? 0
  const sysTotal = round2(sysD + sysP + sysC + sysCr)

  const informedD = parseMoneyInput(infD)
  const informedP = parseMoneyInput(infP)
  const informedC = parseMoneyInput(infC)
  const informedCr = parseMoneyInput(infCr)
  const informedTotal = round2(informedD + informedP + informedC + informedCr)
  const diffD = round2(informedD - sysD)
  const diffP = round2(informedP - sysP)
  const diffC = round2(informedC - sysC)
  const diffCr = round2(informedCr - sysCr)
  const diffTotal = round2(informedTotal - sysTotal)

  function exportCsv() {
    const header = [
      'id',
      'data_hora',
      'responsavel',
      'origem',
      'status',
      'cliente',
      'resumo_itens',
      'total',
      'pagamento',
    ]
    const lines = filteredOrders.map((o) => [
      o.id,
      new Date(o.created_at).toISOString(),
      operatorLabel,
      sourceLabel(mapSource(o.source), { proDelivery: caixaProDeliveryOnly }),
      o.status || '',
      (o.customer_name || '').replaceAll(';', ','),
      (o.items_summary || '').replaceAll(';', ','),
      String(Number(o.total) || 0),
      o.payment_method || '',
    ])
    const csv = [header, ...lines].map((r) => r.join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `caixa-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fatTurno = shiftBreakdown?.totalGeral ?? 0
  const nPedidosFechados = shiftBreakdown?.pedidosFechados ?? 0

  return (
    <div className="mx-auto w-full max-w-7xl pb-10">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[80] w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-[var(--card-border)] bg-[#1a1614] px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Caixa</span>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
              Caixa
            </h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              {caixaProDeliveryOnly
                ? 'Turno, pedidos do link público (slug/QR), entregas dos estafetas e faturamento por origem.'
                : 'Turno, recebimentos, comandas e faturamento por origem.'}
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2 text-sm font-semibold text-[#1f2937] shadow-sm hover:bg-[#f9fafb]"
          >
            Exportar CSV
          </button>
        </div>
      </header>

      {/* BLOCO 1 — Header do turno */}
      {!turno || turno.status !== 'aberto' ? (
        <section className="mt-6 rounded-2xl border border-[var(--card-border)] bg-[#f9fafb] p-6 shadow-sm">
          <p className="text-sm font-semibold text-[#1a1614]">Nenhum turno aberto</p>
          <p className="mt-1 text-sm text-[#6b7280]">
            Abra um turno para começar a registrar vendas
          </p>
          <div className="mt-4 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-medium text-[#6b7280]">
              Fundo inicial (R$)
              <input
                type="text"
                inputMode="decimal"
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                placeholder="0,00"
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm text-[#1a1614]"
              />
            </label>
            <button
              type="button"
              disabled={busyOpen}
              onClick={() => void handleOpenTurno()}
              className="shrink-0 rounded-xl bg-[var(--dash-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 disabled:opacity-50"
            >
              {busyOpen ? 'A abrir…' : 'Abrir turno'}
            </button>
          </div>
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-2xl bg-[#1a1a1a] px-4 py-6 text-white shadow-lg sm:px-8 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-3 lg:items-center">
            <div className="space-y-2">
              <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/40">
                Turno aberto
              </span>
              <p className="text-sm text-white/90">
                Aberto às {timeOnlyFmt.format(new Date(turno.aberto_em))} por{' '}
                <span className="font-semibold">{turno.operador}</span>
              </p>
              <p className="text-xs text-white/50">
                Fundo inicial: {money.format(turno.fundo_inicial)}
              </p>
            </div>
            <div className="text-center lg:px-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                Faturamento do turno
              </p>
              <p className="mt-2 text-3xl font-bold text-[var(--dash-primary)] sm:text-4xl">
                {money.format(fatTurno)}
              </p>
              <p className="mt-1 text-sm text-white/55">
                {nPedidosFechados} pedido{nPedidosFechados === 1 ? '' : 's'} fechado
                {nPedidosFechados === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 lg:flex-nowrap">
              <button
                type="button"
                onClick={() => {
                  if (!turno || !shiftBreakdown) return
                  const ok = openCaixaTurnoEscPosPrint({
                    storeName,
                    paperMm: printPaperMm,
                    turno,
                    breakdown: shiftBreakdown,
                    movimentacoes: movimentacoesTurnoAtual,
                  })
                  if (!ok) showToast('Permite pop-ups para imprimir.')
                }}
                className="rounded-xl border border-white/40 bg-transparent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Imprimir turno (ESC/POS)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMovModalOpen(true)
                  setMovTipo('suprimento')
                  setMovValor('')
                  setMovMotivo('')
                }}
                className="rounded-xl border border-white/40 bg-transparent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Sangria / Suprimento
              </button>
              <button
                type="button"
                onClick={openCloseModal}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-red-700"
              >
                Fechar turno
              </button>
            </div>
          </div>
        </section>
      )}

      {/* BLOCO 2 — Resumo por forma de pagamento */}
      {turno && turno.status === 'aberto' && shiftBreakdown ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-[#1a1614]">Resumo financeiro do turno</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Atualiza automaticamente quando fechas comandas neste turno.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                { key: 'dinheiro', label: 'Dinheiro', b: shiftBreakdown.dinheiro },
                { key: 'pix', label: 'PIX', b: shiftBreakdown.pix },
                { key: 'cartao', label: 'Cartão', b: shiftBreakdown.cartao },
              ] as const
            ).map(({ key, label, b }) => (
              <div
                key={key}
                className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm"
              >
                <div className="text-sm font-semibold text-[#374151]">{label}</div>
                <p className="mt-2 text-xl font-bold text-[#1a1614]">{money.format(b.total)}</p>
                <p className="mt-1 text-xs text-[#6b7280]">
                  {b.count} pedido{b.count === 1 ? '' : 's'}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-[var(--dash-primary)]/35 bg-[var(--dash-primary)]/[0.08] p-4 shadow-sm ring-1 ring-[var(--dash-primary)]/20">
              <div className="text-sm font-semibold text-[#9a3412]">Total</div>
              <p className="mt-2 text-xl font-bold text-[var(--dash-primary)]">
                {money.format(shiftBreakdown.totalGeral)}
              </p>
              <p className="mt-1 text-xs text-[#6b7280]">
                {shiftBreakdown.pedidosFechados} pedido
                {shiftBreakdown.pedidosFechados === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {shiftBreakdown.credito.count > 0 ? (
            <p className="mt-2 text-xs text-[#6b7280]">
              Inclui {shiftBreakdown.credito.count} pedido
              {shiftBreakdown.credito.count === 1 ? '' : 's'} a crédito (
              {money.format(shiftBreakdown.credito.total)}).
            </p>
          ) : null}
        </section>
      ) : null}

      {/* BLOCO 3 — Comandas */}
      <section className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
        {openComandas.length > 0 && (!turno || turno.status !== 'aberto') ? (
          <div
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            <p className="font-semibold">Abre um turno primeiro</p>
            <p className="mt-1 text-amber-900/90">
              Com {openComandas.length} comanda
              {openComandas.length === 1 ? '' : 's'} à espera: usa &quot;Abrir turno&quot; acima.
              Enquanto não houver turno aberto, o botão «Receber e fechar» fica inativo.
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-[#1a1614]">Comandas em aberto</h2>
          <span className="rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-bold text-[#374151]">
            {openComandas.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-[#6b7280]">
          Só é possível receber com turno aberto. O pedido fica como entregue e ligado ao turno
          atual.
        </p>
        {cashierError ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{cashierError}</p>
        ) : null}
        {openComandas.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center gap-2 pb-6 text-center">
            <div className="h-10 w-10 rounded-full bg-[#e5e7eb]" aria-hidden />
            <p className="text-sm font-medium text-[#374151]">Nenhuma comanda em aberto</p>
            <p className="max-w-sm text-xs text-[#6b7280]">
              {caixaProDeliveryOnly
                ? 'Neste modo não há comandas de balcão ou garçom. Pedidos do site aparecem nas métricas; entregas dos estafetas, na secção abaixo.'
                : 'As comandas criadas no Garçom ou no PDV aparecem aqui para pagamento.'}
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {openComandas.map((o) => {
              const src = mapSource(o.source)
              const rawSrc = (o.source ?? '').trim().toLowerCase()
              const badgeWaiter = src === 'waiter'
              const badgeText = badgeWaiter
                ? rawSrc === 'autoatendimento'
                  ? 'QR MESA'
                  : 'GARÇOM'
                : 'BALCÃO'
              const releasedByWaiter = notesIndicateWaiterReleasedToCaixa(o.notes)
              return (
                <li
                  key={o.id}
                  className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm shadow-black/[0.04]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)] bg-[#fafafa] px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          badgeWaiter
                            ? 'bg-sky-100 text-sky-900 ring-1 ring-sky-200'
                            : 'bg-violet-100 text-violet-900 ring-1 ring-violet-200'
                        }`}
                      >
                        {badgeText}
                      </span>
                      {releasedByWaiter ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                          Encaminhada pelo garçom
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[11px] font-medium text-[#6b7280]">
                      {dateTime.format(new Date(o.created_at))}
                    </span>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-[#1a1614]">
                        {comandaDisplayName(o.customer_name)}
                      </p>
                      {parseTableFromNotes(o.notes) ? (
                        <p className="text-[11px] font-medium text-[#6b7280]">
                          Mesa {parseTableFromNotes(o.notes)}
                        </p>
                      ) : null}
                      <p className="line-clamp-2 text-sm text-[#374151]">
                        {o.items_summary || 'Comanda'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[var(--card-border)] pt-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                          Total
                        </p>
                        <p className="text-xl font-bold text-[#1a1614]">
                          {money.format(Number(o.total) || 0)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={thermalBusyOrderId === o.id}
                          onClick={() => void printOrderDefault(o)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] bg-white px-2 py-2 text-xs font-semibold text-[#1f2937] disabled:opacity-50"
                          title="Térmica Wi‑Fi se configurada; senão abre a pré-visualização da comanda."
                        >
                          <IconPrinter className="h-4 w-4 text-[var(--dash-primary)]" />
                          {thermalBusyOrderId === o.id ? '…' : 'Imprimir comanda'}
                        </button>
                        <button
                          type="button"
                          disabled={closingOrderId === o.id || !turno || turno.status !== 'aberto'}
                          title={
                            !turno || turno.status !== 'aberto'
                              ? 'Abre um turno na secção acima para receber pagamentos.'
                              : undefined
                          }
                          onClick={() => setSplitModalOrder(o)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {closingOrderId === o.id ? 'A processar…' : 'Receber e fechar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {entregasCaixaEnabled ? (
      <section className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-[#1a1614]">Entregas do turno</h2>
            <span className="rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-bold text-[#374151]">
              {entregasTabela.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/entregadores"
              className="text-xs font-semibold text-[var(--dash-primary)] hover:underline"
            >
              Gerenciar entregadores
            </Link>
            <button
              type="button"
              disabled={busyEntregas}
              onClick={() => void reloadEntregas()}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
            >
              {busyEntregas ? 'A atualizar…' : 'Atualizar'}
            </button>
            <button
              type="button"
              onClick={() => exportarEntregasCsv()}
              disabled={entregasTabela.length === 0}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50"
            >
              Exportar CSV
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-[#6b7280]">
          Corridas e valores recebidos dos clientes; saldo positivo = entregador deve repassar à
          loja. O acerto marca as entregas como liquidadas no turno.
        </p>

        {entregasApi.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                Entregas no período
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[#1a1614]">
                {entregasApi.length}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                A receber dos entregadores
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-900">
                {money.format(resumoEntregasPendentes.receber)}
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-800">
                {resumoEntregasPendentes.count} pendente(s)
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-800">
                A pagar aos entregadores
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-red-900">
                {money.format(resumoEntregasPendentes.pagar)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['all', 'pendente', 'by_driver'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setEntFilterQuick(id)
                if (id !== 'by_driver') setEntDriverKey('')
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                entFilterQuick === id
                  ? 'bg-[var(--dash-primary)] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              {id === 'all' ? 'Todos' : id === 'pendente' ? 'Com saldo pendente' : 'Por entregador'}
            </button>
          ))}
          {entFilterQuick === 'by_driver' ? (
            <select
              value={entDriverKey}
              onChange={(e) => setEntDriverKey(e.target.value)}
              className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1.5 text-xs font-semibold text-[#1f2937]"
            >
              <option value="">Escolher entregador…</option>
              {driverFilterOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null}
          <span className="hidden h-4 w-px bg-[var(--card-border)] sm:inline" aria-hidden />
          {(['turno', 'hoje', '7d'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setEntPeriod(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                entPeriod === id
                  ? 'bg-[#111827] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              {id === 'turno' ? 'Este turno' : id === 'hoje' ? 'Hoje' : 'Últimos 7 dias'}
            </button>
          ))}
        </div>

        {entPeriod === 'turno' && (!turno || turno.status !== 'aberto') ? (
          <p className="mt-4 text-sm text-[#6b7280]">
            Abre um turno para ver entregas ligadas a este período.
          </p>
        ) : busyEntregas && entregasTabela.length === 0 ? (
          <p className="mt-4 text-sm text-[#6b7280]">A carregar entregas…</p>
        ) : entFilterQuick === 'by_driver' && !entDriverKey ? (
          <p className="mt-4 text-sm text-[#6b7280]">
            Escolhe um entregador para ver as corridas dele.
          </p>
        ) : entregasTabela.length === 0 ? (
          <p className="mt-4 text-sm text-[#6b7280]">Nenhuma entrega neste filtro.</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    <th className="py-2 pr-3">Horário</th>
                    <th className="py-2 pr-3">Pedido</th>
                    <th className="py-2 pr-3">Entregador</th>
                    <th className="py-2 pr-3 text-right">Valor corrida</th>
                    <th className="py-2 pr-3 text-right">Recebeu do cliente</th>
                    <th className="py-2 pr-3 text-right">Saldo</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entregasTabela.map((e) => {
                    const saldo = saldoEntregaLinha(e)
                    const saldoCls =
                      Math.abs(saldo) < 0.005
                        ? 'text-[#6b7280]'
                        : saldo > 0
                          ? 'text-emerald-700'
                          : 'text-red-600'
                    const pedidoRef =
                      displayNumberById.get(e.order_id) ?? e.order_id.slice(0, 8)
                    const statusLabel = e.acertado_em
                      ? 'Acertado'
                      : entregaPendenteAcerto(e)
                        ? 'Pendente'
                        : 'Sem saldo'
                    const statusCls = e.acertado_em
                      ? 'bg-[#f3f4f6] text-[#374151]'
                      : entregaPendenteAcerto(e)
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-[#f3f4f6] text-[#9ca3af]'
                    return (
                      <tr key={e.id} className="border-b border-[var(--card-border)]/80">
                        <td className="py-2.5 pr-3 text-[#374151]">
                          {timeOnlyFmt.format(new Date(e.criado_em))}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs text-[#1a1614]">
                          <Link
                            href="/dashboard/orders"
                            className="hover:text-[var(--dash-primary)] hover:underline"
                            title="Ver em Pedidos"
                          >
                            #{pedidoRef}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3 text-[#1a1614]">{e.entregador_nome}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {money.format(e.valor_corrida)}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {money.format(e.valor_recebido_cliente)}
                        </td>
                        <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${saldoCls}`}>
                          {saldo > 0 ? '+' : ''}
                          {money.format(saldo)}
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCls}`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--card-border)] font-semibold text-[#1a1614]">
                    <td colSpan={3} className="py-3 pr-3">
                      Totais
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{money.format(totEntCorr)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{money.format(totEntRec)}</td>
                    <td
                      className={`py-3 pr-3 text-right tabular-nums ${
                        Math.abs(totEntSaldo) < 0.005
                          ? 'text-[#6b7280]'
                          : totEntSaldo > 0
                            ? 'text-emerald-700'
                            : 'text-red-600'
                      }`}
                    >
                      {totEntSaldo > 0 ? '+' : ''}
                      {money.format(totEntSaldo)}
                    </td>
                    <td className="py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-[#6b7280]">
              {totEntSaldo > 0.005
                ? `Saldo a repassar para a loja: ${money.format(totEntSaldo)}`
                : totEntSaldo < -0.005
                  ? `A pagar entregadores: ${money.format(Math.abs(totEntSaldo))}`
                  : 'Saldo líquido equilibrado neste filtro.'}
            </p>
          </>
        )}

        {gruposEntregador.length > 0 ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {gruposEntregador.map((g) => {
              const tipoBadge =
                g.tipo === 'autonomo' ? 'Autônomo' : g.tipo === 'fixo' ? 'Fixo' : 'Avulso'
              const podeAcerto =
                g.nPendentes > 0 && Math.abs(g.saldoPendente) >= 0.005
              const emDia = g.n > 0 && g.nPendentes === 0
              return (
                <div
                  key={g.key}
                  className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[#fafafa] shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)] bg-white px-4 py-3">
                    <p className="text-sm font-bold text-[#1a1614]">
                      <span aria-hidden>🛵</span> {g.nome}
                      <span className="ml-2 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#374151] ring-1 ring-[var(--card-border)]">
                        {tipoBadge}
                      </span>
                      {emDia ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          Em dia
                        </span>
                      ) : podeAcerto ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          Acerto pendente
                        </span>
                      ) : null}
                    </p>
                    <span className="text-xs font-semibold text-[#6b7280]">
                      {g.n} entrega(s)
                      {g.nPendentes > 0 && g.nPendentes < g.n
                        ? ` · ${g.nPendentes} pendente(s)`
                        : null}
                    </span>
                  </div>
                  <div className="space-y-1 px-4 py-3 text-sm text-[#374151]">
                    <div className="flex justify-between">
                      <span>Corridas realizadas:</span>
                      <span className="font-semibold tabular-nums">{money.format(g.tc)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Recebeu dos clientes:</span>
                      <span className="font-semibold tabular-nums">{money.format(g.tr)}</span>
                    </div>
                    <div className="border-t border-[var(--card-border)] pt-2" />
                    <div className="flex justify-between">
                      <span>Deve repassar à loja:</span>
                      <span
                        className={`font-semibold tabular-nums ${
                          g.saldoPendente > 0.005 ? 'text-emerald-700' : 'text-[#9ca3af]'
                        }`}
                      >
                        {money.format(g.saldoPendente > 0 ? g.saldoPendente : 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Loja deve ao entregador:</span>
                      <span
                        className={`font-semibold tabular-nums ${
                          g.saldoPendente < -0.005 ? 'text-red-600' : 'text-[#9ca3af]'
                        }`}
                      >
                        {money.format(g.saldoPendente < 0 ? Math.abs(g.saldoPendente) : 0)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-[var(--card-border)] bg-white px-4 py-3">
                    <button
                      type="button"
                      disabled={!podeAcerto || !turno || turno.status !== 'aberto'}
                      onClick={() => {
                        setAcertoValor(
                          String(Math.abs(g.saldoPendente).toFixed(2)).replace('.', ',')
                        )
                        setAcertoForma('dinheiro')
                        setAcertoObs('')
                        setAcertoModal({
                          key: g.key,
                          nome: g.nome,
                          tipo: g.tipo,
                          n: g.nPendentes,
                          saldo: g.saldoPendente,
                          entregadorId: g.key.startsWith('av:') ? null : g.key,
                          entregaIds: g.pendentes.map((e) => e.id),
                        })
                      }}
                      className="rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                    >
                      {emDia ? 'Acerto em dia' : 'Registrar acerto'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEntFilterQuick('by_driver')
                        setEntDriverKey(g.key)
                      }}
                      className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151]"
                    >
                      Ver entregas
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>
      ) : null}

      {/* BLOCO 6 — Histórico de turnos */}
      <section className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-[#1a1614]">Histórico de turnos</h2>
        <p className="mt-0.5 text-xs text-[#6b7280]">Últimos {historico.length} turnos fechados.</p>
        {historico.length === 0 ? (
          <p className="mt-4 text-sm text-[#6b7280]">Ainda não há turnos fechados registados.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Operador</th>
                  <th className="py-2 pr-3">Abertura</th>
                  <th className="py-2 pr-3">Fechamento</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Diferença</th>
                  <th className="py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => {
                  const movs = movMap[h.id] ?? []
                  const open = expandedHistoricoId === h.id
                  const diff = h.diferenca
                  return (
                    <Fragment key={h.id}>
                      <tr className="border-b border-[var(--card-border)]/80">
                        <td className="py-3 pr-3 text-[#1a1614]">
                          {h.fechado_em
                            ? dateTime.format(new Date(h.fechado_em))
                            : '—'}
                        </td>
                        <td className="max-w-[8rem] truncate py-3 pr-3 text-[#374151]" title={h.operador}>
                          {h.operador}
                        </td>
                        <td className="py-3 pr-3 text-[#6b7280]">
                          {timeOnlyFmt.format(new Date(h.aberto_em))}
                        </td>
                        <td className="py-3 pr-3 text-[#6b7280]">
                          {h.fechado_em ? timeOnlyFmt.format(new Date(h.fechado_em)) : '—'}
                        </td>
                        <td className="py-3 pr-3 font-semibold text-[#1a1614]">
                          {money.format(h.total_geral)}
                        </td>
                        <td
                          className={`py-3 pr-3 font-semibold ${
                            Math.abs(diff) < 0.005 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {money.format(diff)}
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => setExpandedHistoricoId(open ? null : h.id)}
                            className="text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                          >
                            {open ? 'Ocultar' : 'Ver detalhes'}
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={7} className="bg-[#fafafa] px-4 py-4">
                            <div className="grid gap-4 text-sm md:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold uppercase text-[#6b7280]">
                                  Por forma de pagamento
                                </p>
                                <ul className="mt-2 space-y-1 text-[#374151]">
                                  <li>Dinheiro: {money.format(h.total_dinheiro)}</li>
                                  <li>PIX: {money.format(h.total_pix)}</li>
                                  <li>Cartão: {money.format(h.total_cartao)}</li>
                                  <li>Crédito: {money.format(h.total_credito)}</li>
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase text-[#6b7280]">
                                  Sangrias / suprimentos
                                </p>
                                {movs.length === 0 ? (
                                  <p className="mt-2 text-xs text-[#6b7280]">Nenhuma movimentação.</p>
                                ) : (
                                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[#374151]">
                                    {movs.map((m) => (
                                      <li key={m.id}>
                                        {timeOnlyFmt.format(new Date(m.criado_em))} ·{' '}
                                        {movTipoLabel(m.tipo)} · {m.motivo || '—'} ·{' '}
                                        <span
                                          className={
                                            m.tipo === 'sangria'
                                              ? 'text-red-600'
                                              : m.tipo === 'acerto_entregador'
                                                ? 'text-[#374151]'
                                                : 'text-emerald-700'
                                          }
                                        >
                                          {m.tipo === 'sangria'
                                            ? '−'
                                            : m.tipo === 'acerto_entregador'
                                              ? ''
                                              : '+'}
                                          {money.format(m.valor)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-[#1a1614]">Métricas por origem</h2>
        <p className="mt-0.5 text-xs text-[#6b7280]">
          {caixaProDeliveryOnly
            ? 'Faturamento dos pedidos pelo link público (slug/QR). Entregas de motoboy na secção dedicada.'
            : 'Faturamento consoante o período e a origem selecionados.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['turno', 'Este turno'],
              ['today', 'Hoje'],
              ['7d', 'Últimos 7 dias'],
              ['30d', 'Últimos 30 dias'],
              ['all', 'Todos'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                period === id
                  ? 'bg-[var(--dash-primary)] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-[var(--card-border)] sm:inline" />
          {(caixaProDeliveryOnly
            ? (['all', 'menu_link'] as const)
            : deliveryPipelineEnabled
              ? (['all', 'waiter', 'pdv', 'menu_link'] as const)
              : (['all', 'waiter', 'pdv'] as const)
          ).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSourceFilter(id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                sourceFilter === id
                  ? 'bg-[#111827] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              {id === 'all' ? 'Todos' : sourceLabel(id, { proDelivery: caixaProDeliveryOnly })}
            </button>
          ))}
        </div>
      </section>

      <section
        className={
          caixaProDeliveryOnly
            ? 'mt-5 grid gap-4'
            : deliveryPipelineEnabled
              ? 'mt-5 grid gap-4 lg:grid-cols-3'
              : 'mt-5 grid gap-4 sm:grid-cols-2'
        }
      >
        {(caixaProDeliveryOnly
          ? (['menu_link'] as const)
          : deliveryPipelineEnabled
            ? (['waiter', 'pdv', 'menu_link'] as const)
            : (['waiter', 'pdv'] as const)
        ).map((k) => {
          const pct = totalRevenue > 0 ? Math.round((summary[k].total / totalRevenue) * 1000) / 10 : 0
          const ticket = summary[k].count > 0 ? summary[k].total / summary[k].count : 0
          return (
            <div
              key={k}
              className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-[#1a1614]">
                {sourceLabel(k, { proDelivery: caixaProDeliveryOnly })}
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--dash-primary)]">
                {money.format(summary[k].total)}
              </p>
              <p className="mt-1 text-xs text-[#6b7280]">
                {summary[k].count} pedidos · ticket médio {money.format(ticket)}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
                <div
                  className="h-full rounded-full bg-[var(--dash-primary)]/80 transition-all"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] font-medium text-[#9ca3af]">{pct}% do total filtrado</p>
            </div>
          )
        })}
      </section>

      <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Faturamento (filtro)
          </p>
          <p className="mt-2 text-2xl font-bold text-[#1a1614]">{money.format(totalRevenue)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Pedidos</p>
          <p className="mt-2 text-2xl font-bold text-[#1a1614]">{totalCount}</p>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            Ticket médio
          </p>
          <p className="mt-2 text-2xl font-bold text-[#1a1614]">{money.format(avgTicket)}</p>
        </div>
      </section>

      {/* Modal movimentação */}
      {movModalOpen && turno && turno.status === 'aberto' ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar"
            onClick={() => setMovModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1a1614]">Movimentação de caixa</h3>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMovTipo('suprimento')}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  movTipo === 'suprimento'
                    ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/10 text-[#9a3412]'
                    : 'border-[var(--card-border)] text-[#374151]'
                }`}
              >
                Suprimento (entrada)
              </button>
              <button
                type="button"
                onClick={() => setMovTipo('sangria')}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  movTipo === 'sangria'
                    ? 'border-[var(--dash-primary)] bg-[var(--dash-primary)]/10 text-[#9a3412]'
                    : 'border-[var(--card-border)] text-[#374151]'
                }`}
              >
                Sangria (retirada)
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-[#6b7280]">
              Valor (R$)
              <input
                type="text"
                inputMode="decimal"
                value={movValor}
                onChange={(e) => setMovValor(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-[#6b7280]">
              Motivo
              <input
                type="text"
                value={movMotivo}
                onChange={(e) => setMovMotivo(e.target.value)}
                placeholder={
                  movTipo === 'suprimento'
                    ? 'Ex: troco para o caixa'
                    : 'Ex: pagamento de fornecedor'
                }
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busyMov}
              onClick={() => void handleMovimentacao()}
              className="mt-5 w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busyMov ? 'A guardar…' : 'Confirmar'}
            </button>
            <div className="mt-6 border-t border-[var(--card-border)] pt-4">
              <p className="text-xs font-semibold uppercase text-[#6b7280]">Movimentações do turno</p>
              {movimentacoesTurnoAtual.length === 0 ? (
                <p className="mt-2 text-xs text-[#6b7280]">Nenhuma ainda.</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs text-[#374151]">
                  {movimentacoesTurnoAtual.map((m) => (
                    <li key={m.id} className="flex flex-wrap justify-between gap-1">
                      <span>
                        {timeOnlyFmt.format(new Date(m.criado_em))} · {movTipoLabel(m.tipo)} ·{' '}
                        {m.motivo || '—'}
                      </span>
                      <span
                        className={
                          m.tipo === 'sangria'
                            ? 'text-red-600'
                            : m.tipo === 'acerto_entregador'
                              ? 'text-[#374151]'
                              : 'text-emerald-700'
                        }
                      >
                        {m.tipo === 'sangria'
                          ? '−'
                          : m.tipo === 'acerto_entregador'
                            ? ''
                            : '+'}
                        {money.format(m.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {acertoModal && turno ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar"
            onClick={() => !busyAcerto && setAcertoModal(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1a1614]">
              Acerto com {acertoModal.nome} —{' '}
              {new Date().toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </h3>
            <p className="mt-2 text-sm text-[#374151]">
              {acertoModal.n} entrega(s) pendente(s) de acerto neste período.
            </p>
            {acertoModal.saldo > 0.005 ? (
              <p className="mt-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                Entregador repassa à loja: {money.format(acertoModal.saldo)}
              </p>
            ) : acertoModal.saldo < -0.005 ? (
              <p className="mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
                Loja paga ao entregador: {money.format(Math.abs(acertoModal.saldo))}
              </p>
            ) : null}
            <label className="mt-4 block text-xs font-medium text-[#6b7280]">
              Valor do acerto (R$)
              <input
                type="text"
                inputMode="decimal"
                value={acertoValor}
                onChange={(e) => setAcertoValor(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-[#6b7280]">
              Forma de pagamento
              <select
                value={acertoForma}
                onChange={(e) => setAcertoForma(e.target.value === 'pix' ? 'pix' : 'dinheiro')}
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">PIX</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-medium text-[#6b7280]">
              Observação <span className="font-normal text-[#9ca3af]">(opcional)</span>
              <input
                value={acertoObs}
                onChange={(e) => setAcertoObs(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
              />
            </label>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyAcerto}
                onClick={() => setAcertoModal(null)}
                className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#374151]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busyAcerto}
                onClick={() => void confirmarAcertoEntregador()}
                className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busyAcerto ? 'A guardar…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal fechar turno */}
      {closeFlow && turno && shiftBreakdown ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar"
            onClick={() => setCloseFlow(null)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl">
            {closeFlow.step === 'warn' ? (
              <>
                <h3 className="text-lg font-bold text-[#1a1614]">Comandas em aberto</h3>
                <p className="mt-2 text-sm text-[#374151]">
                  Existem {closeFlow.comandasCount} comanda
                  {closeFlow.comandasCount === 1 ? '' : 's'} em aberto. Deseja fechar o turno mesmo
                  assim?
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCloseFlow(null)}
                    className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#374151]"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => openCloseSummary()}
                    className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-[#1a1614]">Resumo do turno</h3>
                <p className="mt-1 text-sm text-[#6b7280]">
                  Aberto às {timeOnlyFmt.format(new Date(turno.aberto_em))} ·{' '}
                  {formatDurationFrom(turno.aberto_em)} · {turno.operador}
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--card-border)] text-left text-xs text-[#6b7280]">
                        <th className="py-2 pr-2">Forma</th>
                        <th className="py-2 pr-2">Vendas sistema</th>
                        <th className="py-2 pr-2">Valor informado</th>
                        <th className="py-2">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ['Dinheiro', sysD, infD, setInfD, diffD],
                          ['PIX', sysP, infP, setInfP, diffP],
                          ['Cartão', sysC, infC, setInfC, diffC],
                          ['Crédito', sysCr, infCr, setInfCr, diffCr],
                        ] as const
                      ).map(([label, sys, val, setVal, diff]) => (
                        <tr key={label} className="border-b border-[var(--card-border)]/70">
                          <td className="py-2 pr-2 font-medium">{label}</td>
                          <td className="py-2 pr-2">{money.format(sys)}</td>
                          <td className="py-2 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) => setVal(e.target.value)}
                              className="w-full min-w-[5rem] rounded-lg border border-[var(--card-border)] px-2 py-1 text-sm"
                            />
                          </td>
                          <td
                            className={`py-2 font-semibold ${
                              Math.abs(diff) < 0.005 ? 'text-[#374151]' : 'text-red-600'
                            }`}
                          >
                            {money.format(diff)}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="py-2 pr-2">Total</td>
                        <td className="py-2 pr-2">{money.format(sysTotal)}</td>
                        <td className="py-2 pr-2">{money.format(informedTotal)}</td>
                        <td
                          className={`py-2 ${
                            Math.abs(diffTotal) < 0.005 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {money.format(diffTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 rounded-xl bg-[#fafafa] p-3 text-xs text-[#374151]">
                  <p className="font-semibold text-[#6b7280]">Movimentações</p>
                  {movimentacoesTurnoAtual.length === 0 ? (
                    <p className="mt-1 text-[#6b7280]">Nenhuma.</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {movimentacoesTurnoAtual.map((m) => (
                        <li key={m.id}>
                          {timeOnlyFmt.format(new Date(m.criado_em))} — {movTipoLabel(m.tipo)} —{' '}
                          {m.motivo || '—'} (
                          {m.tipo === 'sangria' ? '-' : m.tipo === 'acerto_entregador' ? '' : '+'}
                          {money.format(m.valor)})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {gruposFechoTurno.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-white p-3 text-xs text-[#374151]">
                    <p className="font-bold uppercase tracking-wide text-[#6b7280]">
                      Resumo de entregadores
                    </p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[280px] text-left">
                        <thead>
                          <tr className="border-b border-[var(--card-border)] text-[10px] font-semibold uppercase text-[#6b7280]">
                            <th className="py-1.5 pr-2">Entregador</th>
                            <th className="py-1.5 pr-2 text-right">Corridas</th>
                            <th className="py-1.5 text-right">Saldo pendente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gruposFechoTurno.map((g) => (
                            <tr key={g.key} className="border-b border-[var(--card-border)]/70">
                              <td className="py-1.5 pr-2 font-medium">{g.nome}</td>
                              <td className="py-1.5 pr-2 text-right">{g.n}</td>
                              <td
                                className={`py-1.5 text-right font-semibold ${
                                  Math.abs(g.saldoPendente) < 0.005
                                    ? 'text-[#6b7280]'
                                    : g.saldoPendente > 0
                                      ? 'text-emerald-700'
                                      : 'text-red-600'
                                }`}
                              >
                                {g.saldoPendente > 0 ? '+' : ''}
                                {money.format(g.saldoPendente)}
                                {Math.abs(g.saldoPendente) < 0.005
                                  ? ''
                                  : g.saldoPendente > 0
                                    ? ' (repassa)'
                                    : ' (loja paga)'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p
                      className={`mt-2 border-t border-[var(--card-border)] pt-2 text-sm font-bold ${
                        Math.abs(
                          gruposFechoTurno.reduce((s, g) => s + g.saldoPendente, 0)
                        ) < 0.005
                          ? 'text-[#6b7280]'
                          : gruposFechoTurno.reduce((s, g) => s + g.saldoPendente, 0) > 0
                            ? 'text-emerald-700'
                            : 'text-red-600'
                      }`}
                    >
                      Saldo pendente no turno:{' '}
                      {(() => {
                        const net = round2(
                          gruposFechoTurno.reduce((s, g) => s + g.saldoPendente, 0)
                        )
                        return (
                          <>
                            {net > 0 ? '+' : ''}
                            {money.format(net)}
                          </>
                        )
                      })()}
                    </p>
                    <div className="mt-3 space-y-2 border-t border-[var(--card-border)] pt-2">
                      {gruposFechoTurno.map((g) => {
                        const pendente = Math.abs(g.saldoPendente) >= 0.005
                        return (
                          <label key={g.key} className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(acertoFeitoPorKey[g.key])}
                              disabled={!pendente}
                              onChange={(e) =>
                                setAcertoFeitoPorKey((prev) => ({
                                  ...prev,
                                  [g.key]: e.target.checked,
                                }))
                              }
                              className="rounded border-[var(--card-border)] disabled:opacity-50"
                            />
                            <span>
                              Acerto realizado — <span className="font-semibold">{g.nome}</span>
                              {pendente ? (
                                <span className="ml-1 text-amber-800">
                                  ({g.saldoPendente > 0 ? 'receber' : 'pagar'}{' '}
                                  {money.format(Math.abs(g.saldoPendente))})
                                </span>
                              ) : (
                                <span className="ml-1 text-[#9ca3af]">(sem saldo pendente)</span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {gruposFechoTurno.some(
                      (g) => Math.abs(g.saldoPendente) >= 0.005 && !acertoFeitoPorKey[g.key]
                    ) ? (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
                        Há entregadores com acerto pendente
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <label className="mt-4 block text-xs font-medium text-[#6b7280]">
                  Fundo para o próximo turno (R$)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fundoProximo}
                    onChange={(e) => setFundoProximo(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm"
                  />
                </label>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCloseFlow(null)}
                    className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#374151]"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={busyClose}
                    onClick={() => void confirmCloseTurno()}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busyClose ? 'A fechar…' : 'Confirmar fechamento'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <ComandaSplitPaymentModal
        open={splitModalOrder != null}
        comandaLabel={
          splitModalOrder
            ? `${comandaDisplayName(splitModalOrder.customer_name)}${
                parseTableFromNotes(splitModalOrder.notes)
                  ? ` · Mesa ${parseTableFromNotes(splitModalOrder.notes)}`
                  : ''
              }`
            : ''
        }
        orderTotal={Number(splitModalOrder?.total) || 0}
        busy={closingOrderId === splitModalOrder?.id}
        onClose={() => !closingOrderId && setSplitModalOrder(null)}
        onConfirm={(lines) => {
          if (splitModalOrder) void closeComanda(splitModalOrder, lines)
        }}
      />
    </div>
  )
}
