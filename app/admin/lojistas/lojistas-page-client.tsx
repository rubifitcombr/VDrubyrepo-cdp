'use client'

import { adminPlanOptionsForOperationMode } from '@/lib/admin-plans'
import { planMonthlyPriceLabel } from '@/lib/plan'
import { createClient } from '@/lib/supabase/client'
import type { MerchantStatus } from '@/lib/merchant-status'
import {
  parseMerchantStatus,
  statusBadgeClass,
  statusLabel,
} from '@/lib/merchant-status'
import {
  operationModeLabel,
  parseOperationModeFromStore,
  type MerchantOperationMode,
} from '@/lib/merchant-operation-mode'
import { parsePlan, planShortLabel, type Plan } from '@/lib/plan'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type LojistaRow = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  plano: Plan
  /** `null` = legado no painel (só plano). */
  operation_mode: MerchantOperationMode | null
  status: MerchantStatus
  plano_vence_em: string | null
  cadastrado_em: string | null
  cancelamento_solicitado: boolean
  produtos_count: number
  faturamento_pedidos: number
}

type Metrics = {
  total: number
  ativos: number
  pendentes: number
  bloqueadosCancelados: number
  mrr: number
  urgentesCount: number
}

type CadastroPorDia = { data: string; count: number }
type StatusSlice = { name: string; value: number }

type ChartsPayload = {
  cadastros14d: CadastroPorDia[]
  statusDistrib: StatusSlice[]
}

type AdminNotif = {
  id: string
  tipo: string
  mensagem: string
  store_id: string | null
  lida: boolean
  criado_em: string
}

const STATUS_CHART_COLORS: Record<string, string> = {
  Pendente: '#f59e0b',
  Ativo: '#10b981',
  Bloqueado: '#6b7280',
  Cancelado: '#ef4444',
}

type FaturaRow = {
  id: string
  criado_em: string
  descricao: string
  valor: number
  status: 'pago' | 'pendente' | 'falhou'
}

type AdminLogRow = {
  id: number
  criado_em: string
  acao: string
  detalhes: string | null
  admin_email: string | null
}

const filtros = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'ativo', label: 'Ativos' },
  { id: 'bloqueado', label: 'Bloqueados' },
  { id: 'cancelado', label: 'Cancelados' },
  { id: 'urgentes', label: 'Urgentes' },
] as const

const moneyBr = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return d.toLocaleDateString('pt-BR')
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function todayIsoLocal(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function addDaysIso(iso: string | null, days: number): string {
  const d = iso
    ? new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
    : new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysUntilVencimento(planoVenceEm: string | null): number | null {
  if (!planoVenceEm || !/^\d{4}-\d{2}-\d{2}$/.test(planoVenceEm.trim())) {
    return null
  }
  const iso = planoVenceEm.trim()
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y!, m! - 1, d!)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function defaultRenovarVenceEm(row: LojistaRow): string {
  const today = todayIsoLocal()
  const cur = row.plano_vence_em?.trim()
  if (cur && /^\d{4}-\d{2}-\d{2}$/.test(cur)) {
    const base = cur >= today ? cur : today
    return addDaysIso(base, 30)
  }
  return addDaysIso(null, 30)
}

function isNovo(cadastradoEm: string | null): boolean {
  if (!cadastradoEm) return false
  const t = new Date(cadastradoEm).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t < 24 * 3600 * 1000
}

function faturaStatusBadgeClass(s: FaturaRow['status']) {
  switch (s) {
    case 'pago':
      return 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80'
    case 'pendente':
      return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80'
    case 'falhou':
      return 'bg-red-50 text-red-800 ring-1 ring-red-200/80'
    default:
      return 'bg-[#f3f4f6] text-[#374151]'
  }
}

function faturaStatusLabel(s: FaturaRow['status']) {
  switch (s) {
    case 'pago':
      return 'Pago'
    case 'pendente':
      return 'Pendente'
    case 'falhou':
      return 'Falhou'
    default:
      return s
  }
}

function IconReceipt(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375H5.25A2.25 2.25 0 003 12v9.75m16.5 0h-9m-9 0H3m3.75-9h9M8.25 6h7.5m-7.5 3h7.5"
      />
    </svg>
  )
}

function IconLockClosed(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  )
}

function IconXCircle(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  )
}

function IconBell(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  )
}

function VenceUrgenciaBadge({ plano_vence_em }: { plano_vence_em: string | null }) {
  const days = daysUntilVencimento(plano_vence_em)
  if (days === null) return null
  if (days <= 0) {
    return (
      <span className="ml-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 ring-1 ring-red-200/80">
        Vencido
      </span>
    )
  }
  if (days >= 1 && days <= 3) {
    return (
      <span className="ml-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-800 ring-1 ring-red-200/80">
        {days} {days === 1 ? 'dia' : 'dias'}
      </span>
    )
  }
  if (days >= 4 && days <= 7) {
    return (
      <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200/80">
        {days} dias
      </span>
    )
  }
  return null
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-3 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
          <h2 id="admin-modal-title" className="text-base font-semibold text-[#1a1614]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f5f5f5]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

function numFromApi(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function operationModeBadgeLabel(mode: MerchantOperationMode | null): string {
  if (mode == null) return 'Legado'
  return operationModeLabel(mode)
}

function normalizeLojista(raw: Record<string, unknown>): LojistaRow {
  const c = raw.cancelamento_solicitado
  const operation_mode = parseOperationModeFromStore({
    operation_mode: raw.operation_mode,
  })
  return {
    id: String(raw.id ?? ''),
    nome: String(raw.nome ?? ''),
    email: typeof raw.email === 'string' ? raw.email : null,
    telefone: typeof raw.telefone === 'string' ? raw.telefone : null,
    plano: parsePlan(raw.plano),
    operation_mode,
    status: parseMerchantStatus(raw.status),
    plano_vence_em: typeof raw.plano_vence_em === 'string' ? raw.plano_vence_em : null,
    cadastrado_em: typeof raw.cadastrado_em === 'string' ? raw.cadastrado_em : null,
    cancelamento_solicitado: c === true || c === 'true' || c === 1,
    produtos_count: Math.max(0, Math.floor(numFromApi(raw.produtos_count))),
    faturamento_pedidos: Math.max(0, numFromApi(raw.faturamento_pedidos)),
  }
}

function fmtChartDay(iso: string) {
  if (!iso || iso.length < 10) return iso
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

export function LojistasPageClient() {
  const [filtro, setFiltro] = useState<string>('todos')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [charts, setCharts] = useState<ChartsPayload | null>(null)
  const [rows, setRows] = useState<LojistaRow[]>([])

  const [notifications, setNotifications] = useState<AdminNotif[]>([])
  const [notifUnread, setNotifUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifWrapRef = useRef<HTMLDivElement>(null)

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  const [planoModal, setPlanoModal] = useState<{
    mode: 'ativar' | 'renovar'
    row: LojistaRow
  } | null>(null)
  const [planoPick, setPlanoPick] = useState<Plan>('GROWTH')
  const [planoVenceEm, setPlanoVenceEm] = useState(() => addDaysIso(null, 30))

  const [faturaModalRow, setFaturaModalRow] = useState<LojistaRow | null>(null)
  const [faturaDesc, setFaturaDesc] = useState('')
  const [faturaValor, setFaturaValor] = useState('')
  const [faturaStatus, setFaturaStatus] = useState<FaturaRow['status']>('pendente')

  const [confirmBlock, setConfirmBlock] = useState<LojistaRow | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<LojistaRow | null>(null)
  const [confirmPurge, setConfirmPurge] = useState<LojistaRow | null>(null)
  const [purgeConfirmName, setPurgeConfirmName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyPurge, setBusyPurge] = useState(false)

  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerLojista, setDrawerLojista] = useState<LojistaRow | null>(null)
  const [drawerFaturas, setDrawerFaturas] = useState<FaturaRow[]>([])
  const [drawerLogs, setDrawerLogs] = useState<AdminLogRow[]>([])
  const [editingDados, setEditingDados] = useState(false)
  const [editNome, setEditNome] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [drawerFaturaDesc, setDrawerFaturaDesc] = useState('')
  const [drawerFaturaValor, setDrawerFaturaValor] = useState('')
  const [drawerFaturaStatus, setDrawerFaturaStatus] =
    useState<FaturaRow['status']>('pendente')
  const [busyDrawerPatch, setBusyDrawerPatch] = useState(false)
  const [busyDrawerOperationMode, setBusyDrawerOperationMode] = useState(false)
  const [drawerOperationModeDraft, setDrawerOperationModeDraft] = useState('')
  const [busyDrawerFatura, setBusyDrawerFatura] = useState(false)

  const planOptionsInModal = useMemo(
    () =>
      adminPlanOptionsForOperationMode(
        planoModal?.row.operation_mode ?? null
      ),
    [planoModal?.row.operation_mode]
  )
  const [ownerPwdNew, setOwnerPwdNew] = useState('')
  const [ownerPwdConfirm, setOwnerPwdConfirm] = useState('')
  const [busyOwnerPwd, setBusyOwnerPwd] = useState(false)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!notifOpen) return
    function onDoc(e: MouseEvent) {
      const el = notifWrapRef.current
      if (el && !el.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [notifOpen])

  const loadNotifications = useCallback(async () => {
    const res = await fetch('/api/admin/notifications', { credentials: 'include' })
    const data = (await res.json()) as {
      ok?: boolean
      items?: AdminNotif[]
      unread?: number
      error?: string
    }
    if (data.ok && data.items) {
      setNotifications(data.items)
      setNotifUnread(typeof data.unread === 'number' ? data.unread : data.items.filter((n) => !n.lida).length)
    }
  }, [])

  useEffect(() => {
    if (!drawerId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerId])

  const load = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true)
      const params = new URLSearchParams()
      params.set('filtro', filtro)
      if (q.trim()) params.set('q', q.trim())
      try {
        const res = await fetch(`/api/admin/lojistas?${params.toString()}`, {
          credentials: 'include',
        })
        let data: {
          ok?: boolean
          metrics?: Metrics
          charts?: ChartsPayload
          lojistas?: Record<string, unknown>[]
          error?: string
          code?: string
        }
        try {
          data = (await res.json()) as typeof data
        } catch {
          setListError('Resposta inválida do servidor.')
          setMetrics(null)
          setCharts(null)
          setRows([])
          if (!silent) setLoading(false)
          return
        }

        if (!res.ok || !data.ok) {
          const msg =
            typeof data.error === 'string' && data.error.trim()
              ? data.error.trim()
              : res.status === 503
                ? 'Servidor incompleto ou indisponível. Verifica SUPABASE_SERVICE_ROLE_KEY no ambiente.'
                : `Erro ao carregar (${res.status}).`
          setListError(msg)
          setMetrics(null)
          setCharts(null)
          setRows([])
          if (!silent) setLoading(false)
          return
        }

        if (data.metrics && data.lojistas) {
          setListError(null)
          setMetrics(data.metrics)
          setCharts(data.charts ?? null)
          setRows(data.lojistas.map((r) => normalizeLojista(r)))
        } else {
          setListError('Resposta incompleta da API admin.')
          setMetrics(null)
          setCharts(null)
          setRows([])
        }
      } catch {
        setListError('Não foi possível ligar ao servidor.')
        setMetrics(null)
        setCharts(null)
        setRows([])
      }
      if (!silent) setLoading(false)
    },
    [filtro, q]
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const refreshFromStoresRealtime = useCallback(async () => {
    await loadNotifications()
    await load(true)
  }, [load, loadNotifications])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stores' },
        () => {
          void refreshFromStoresRealtime()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stores' },
        () => {
          void refreshFromStoresRealtime()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refreshFromStoresRealtime])

  async function patchNotifications(body: { markAll?: boolean; ids?: string[] }) {
    const res = await fetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      ok?: boolean
      items?: AdminNotif[]
      unread?: number
    }
    if (data.ok && data.items) {
      setNotifications(data.items)
      setNotifUnread(typeof data.unread === 'number' ? data.unread : 0)
    }
  }

  async function onSelectNotification(n: AdminNotif) {
    if (!n.lida) {
      await patchNotifications({ ids: [n.id] })
    }
    if (n.store_id) setDrawerId(n.store_id)
    setNotifOpen(false)
  }

  const refreshDrawerDetail = useCallback(async () => {
    if (!drawerId) return
    setDrawerLoading(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${drawerId}`, {
        credentials: 'include',
      })
      const data = (await res.json()) as {
        ok?: boolean
        lojista?: Record<string, unknown>
        faturas?: FaturaRow[]
        logs?: AdminLogRow[]
        error?: string
      }
      if (data.ok && data.lojista) {
        const L = normalizeLojista(data.lojista)
        setDrawerLojista(L)
        setEditNome(L.nome)
        setEditPhone(L.telefone ?? '')
        setDrawerFaturas(data.faturas ?? [])
        setDrawerLogs(data.logs ?? [])
      } else if (typeof data.error === 'string' && data.error.trim()) {
        setToast({ type: 'err', msg: data.error.trim() })
      } else if (!res.ok) {
        setToast({
          type: 'err',
          msg: `Não foi possível carregar o detalhe (${res.status}).`,
        })
      }
    } finally {
      setDrawerLoading(false)
    }
  }, [drawerId])

  useEffect(() => {
    if (!drawerId) {
      setDrawerLojista(null)
      setDrawerFaturas([])
      setDrawerLogs([])
      setEditingDados(false)
      setOwnerPwdNew('')
      setOwnerPwdConfirm('')
      return
    }
    void refreshDrawerDetail()
  }, [drawerId, refreshDrawerDetail])

  useEffect(() => {
    if (drawerLojista) {
      setDrawerOperationModeDraft(drawerLojista.operation_mode ?? '')
    }
  }, [drawerLojista])

  function mergeRowFromApi(raw: Record<string, unknown> | undefined) {
    if (!raw) return
    const next = normalizeLojista(raw)
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
    if (drawerId === next.id) {
      setDrawerLojista(next)
      setEditNome(next.nome)
      setEditPhone(next.telefone ?? '')
    }
  }

  function openPlanoModal(mode: 'ativar' | 'renovar', row: LojistaRow) {
    setPlanoModal({ mode, row })
    if (mode === 'ativar') {
      if (row.status === 'cancelado') {
        setPlanoPick(row.plano)
        setPlanoVenceEm(defaultRenovarVenceEm(row))
      } else {
        setPlanoPick('GROWTH')
        setPlanoVenceEm(addDaysIso(null, 30))
      }
    } else {
      setPlanoPick(row.plano)
      setPlanoVenceEm(defaultRenovarVenceEm(row))
    }
  }

  async function confirmPlanoModal() {
    if (!planoModal) return
    const { mode, row } = planoModal
    setBusyId(row.id)
    try {
      if (mode === 'ativar') {
        const res = await fetch(`/api/admin/lojistas/${row.id}/ativar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ plano: planoPick, plano_vence_em: planoVenceEm }),
        })
        const data = (await res.json()) as { error?: string; lojista?: Record<string, unknown> }
        if (!res.ok) {
          setToast({ type: 'err', msg: data.error || 'Erro ao ativar.' })
          return
        }
        mergeRowFromApi(data.lojista)
        setToast({
          type: 'ok',
          msg:
            row.status === 'cancelado'
              ? `${row.nome} reativado · ${planShortLabel(planoPick)}`
              : `Plano de ${row.nome} atualizado para ${planShortLabel(planoPick)}`,
        })
        void load(true)
      } else {
        const res = await fetch(`/api/admin/lojistas/${row.id}/renovar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ plano: planoPick, plano_vence_em: planoVenceEm }),
        })
        const data = (await res.json()) as { error?: string; lojista?: Record<string, unknown> }
        if (!res.ok) {
          setToast({ type: 'err', msg: data.error || 'Erro ao renovar.' })
          return
        }
        mergeRowFromApi(data.lojista)
        setToast({
          type: 'ok',
          msg: `Plano de ${row.nome} atualizado para ${planShortLabel(planoPick)}`,
        })
        void load(true)
      }
      setPlanoModal(null)
      void refreshDrawerDetail()
    } finally {
      setBusyId(null)
    }
  }

  async function postRegistrarFatura(storeId: string, nome: string) {
    const descricao = faturaDesc.trim()
    const valor = Number(String(faturaValor).replace(',', '.'))
    if (!descricao) {
      setToast({ type: 'err', msg: 'Indica uma descrição.' })
      return
    }
    if (!Number.isFinite(valor) || valor < 0) {
      setToast({ type: 'err', msg: 'Valor inválido.' })
      return
    }
    setBusyId(storeId)
    try {
      const res = await fetch(`/api/admin/lojistas/${storeId}/faturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ descricao, valor, status: faturaStatus }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setToast({ type: 'err', msg: data.error || 'Erro ao registar.' })
        return
      }
      setToast({ type: 'ok', msg: `Fatura registada para ${nome}.` })
      setFaturaModalRow(null)
      setFaturaDesc('')
      setFaturaValor('')
      setFaturaStatus('pendente')
      void load(true)
      void refreshDrawerDetail()
    } finally {
      setBusyId(null)
    }
  }

  async function postDrawerFatura() {
    if (!drawerId || !drawerLojista) return
    const descricao = drawerFaturaDesc.trim()
    const valor = Number(String(drawerFaturaValor).replace(',', '.'))
    if (!descricao) {
      setToast({ type: 'err', msg: 'Indica uma descrição.' })
      return
    }
    if (!Number.isFinite(valor) || valor < 0) {
      setToast({ type: 'err', msg: 'Valor inválido.' })
      return
    }
    setBusyDrawerFatura(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${drawerId}/faturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          descricao,
          valor,
          status: drawerFaturaStatus,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setToast({ type: 'err', msg: data.error || 'Erro ao registar.' })
        return
      }
      setToast({ type: 'ok', msg: 'Fatura registada.' })
      setDrawerFaturaDesc('')
      setDrawerFaturaValor('')
      setDrawerFaturaStatus('pendente')
      void load(true)
      void refreshDrawerDetail()
    } finally {
      setBusyDrawerFatura(false)
    }
  }

  async function postBloquear(row: LojistaRow) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/lojistas/${row.id}/bloquear`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await res.json()) as { error?: string; lojista?: Record<string, unknown> }
      if (!res.ok) {
        setToast({ type: 'err', msg: data.error || 'Erro' })
        return
      }
      mergeRowFromApi(data.lojista)
      setConfirmBlock(null)
      setToast({ type: 'ok', msg: `Acesso de ${row.nome} bloqueado.` })
      void load(true)
      void refreshDrawerDetail()
    } finally {
      setBusyId(null)
    }
  }

  async function postCancelar(row: LojistaRow) {
    setBusyId(row.id)
    try {
      const res = await fetch(`/api/admin/lojistas/${row.id}/cancelar`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await res.json()) as { error?: string; lojista?: Record<string, unknown> }
      if (!res.ok) {
        setToast({ type: 'err', msg: data.error || 'Erro' })
        return
      }
      mergeRowFromApi(data.lojista)
      setConfirmCancel(null)
      setToast({ type: 'ok', msg: `Assinatura de ${row.nome} cancelada.` })
      void load(true)
      void refreshDrawerDetail()
    } finally {
      setBusyId(null)
    }
  }

  async function postPurgeLoja(row: LojistaRow, confirmName: string) {
    setBusyPurge(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${row.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmName }),
      })
      const data = (await res.json()) as {
        error?: string
        message?: string
        ok?: boolean
      }
      if (!res.ok) {
        setToast({ type: 'err', msg: data.error || 'Erro ao eliminar.' })
        return
      }
      setConfirmPurge(null)
      setPurgeConfirmName('')
      setDrawerId(null)
      setToast({ type: 'ok', msg: data.message || 'Loja eliminada.' })
      await load(true)
    } finally {
      setBusyPurge(false)
    }
  }

  async function postOwnerPassword() {
    if (!drawerId) return
    if (ownerPwdNew.length < 6) {
      setToast({ type: 'err', msg: 'A senha deve ter pelo menos 6 caracteres.' })
      return
    }
    if (ownerPwdNew !== ownerPwdConfirm) {
      setToast({ type: 'err', msg: 'As senhas não coincidem.' })
      return
    }
    setBusyOwnerPwd(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${drawerId}/owner-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: ownerPwdNew }),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) {
        setToast({
          type: 'err',
          msg: data.error?.trim() || `Erro ao atualizar (${res.status}).`,
        })
        return
      }
      setOwnerPwdNew('')
      setOwnerPwdConfirm('')
      setToast({
        type: 'ok',
        msg: 'Senha de acesso do titular atualizada. Informa o lojista por um canal seguro.',
      })
      void refreshDrawerDetail()
    } finally {
      setBusyOwnerPwd(false)
    }
  }

  async function saveDrawerDados() {
    if (!drawerId) return
    setBusyDrawerPatch(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${drawerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editNome, phone: editPhone }),
      })
      const data = (await res.json()) as { error?: string; lojista?: Record<string, unknown> }
      if (!res.ok) {
        setToast({ type: 'err', msg: data.error || 'Erro ao guardar.' })
        return
      }
      mergeRowFromApi(data.lojista)
      setEditingDados(false)
      setToast({ type: 'ok', msg: 'Dados atualizados.' })
      void load(true)
      void refreshDrawerDetail()
    } finally {
      setBusyDrawerPatch(false)
    }
  }

  async function saveDrawerOperationMode() {
    if (!drawerId) return
    const t = drawerOperationModeDraft.trim()
    if (
      t !== '' &&
      t !== 'delivery' &&
      t !== 'presencial' &&
      t !== 'hibrido'
    ) {
      setToast({ type: 'err', msg: 'Selecciona um modelo válido ou vazio para legado.' })
      return
    }
    setBusyDrawerOperationMode(true)
    try {
      const res = await fetch(`/api/admin/lojistas/${drawerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          operation_mode: t === '' ? null : t,
        }),
      })
      const data = (await res.json()) as { error?: string; lojista?: Record<string, unknown> }
      if (!res.ok) {
        setToast({ type: 'err', msg: data.error || 'Erro ao guardar modelo.' })
        return
      }
      mergeRowFromApi(data.lojista)
      setToast({ type: 'ok', msg: 'Modelo de operação actualizado.' })
      void load(true)
      void refreshDrawerDetail()
    } finally {
      setBusyDrawerOperationMode(false)
    }
  }

  const mrrFmt = metrics
    ? moneyBr.format(metrics.mrr)
    : '—'

  const badgeUnread =
    notifUnread > 99 ? '99+' : String(notifUnread)

  return (
    <div className="relative mx-auto max-w-[1400px] px-0 sm:px-1">
      {toast ? (
        <div
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 z-[70] w-[min(92vw,28rem)] -translate-x-1/2 sm:bottom-6"
          role="status"
        >
          <div
            className={`rounded-2xl border px-4 py-3 text-center text-sm font-medium shadow-lg ${
              toast.type === 'ok'
                ? 'border-emerald-200/80 bg-emerald-50 text-emerald-950'
                : 'border-red-200/80 bg-red-50 text-red-950'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      ) : null}

      {listError ? (
        <div
          className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 shadow-sm"
          role="alert"
        >
          <p className="font-semibold">Não foi possível carregar os lojistas</p>
          <p className="mt-1 leading-relaxed text-red-900/90">{listError}</p>
        </div>
      ) : null}

      {/* Bloco 1 — header + notificações */}
      <header className="flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-white p-3 shadow-sm sm:gap-4 sm:p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1a1614] sm:text-2xl">
            Vyria Admin
          </h1>
          <p className="mt-0.5 text-sm text-[#6b7280]">Gestão de lojistas</p>
        </div>
        <div className="relative w-full shrink-0 sm:w-auto sm:self-start" ref={notifWrapRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((o) => !o)}
            className="relative inline-flex h-11 w-11 items-center justify-center self-end rounded-xl border border-[var(--card-border)] bg-[#fafafa] text-[#374151] shadow-sm transition hover:bg-white sm:self-auto"
            aria-expanded={notifOpen}
            aria-haspopup="true"
            aria-label="Notificações"
          >
            <IconBell className="h-5 w-5" />
            {notifUnread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {badgeUnread}
              </span>
            ) : null}
          </button>
          {notifOpen ? (
            <div
              className="absolute left-1/2 z-50 mt-2 w-[min(calc(100vw-1.5rem),22rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-xl sm:left-auto sm:right-0 sm:translate-x-0"
              role="menu"
            >
              <div className="flex items-center justify-between border-b border-[var(--card-border)] px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  Recentes
                </span>
                {notifUnread > 0 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                    onClick={() => void patchNotifications({ markAll: true })}
                  >
                    Marcar todas lidas
                  </button>
                ) : null}
              </div>
              <div className="max-h-[min(60vh,22rem)] overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[#9ca3af]">
                    Sem notificações recentes. Eventos de lojas (cadastro, plano,
                    cancelamento) aparecem aqui quando a base de dados estiver
                    configurada para as gravar.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--card-border)]">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void onSelectNotification(n)}
                          className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-[#f9fafb] ${
                            n.lida ? 'text-[#6b7280]' : 'bg-sky-50/40 font-medium text-[#1a1614]'
                          }`}
                        >
                          <span className="leading-snug">{n.mensagem}</span>
                          <span className="text-[10px] tabular-nums text-[#9ca3af]">
                            {fmtDateTime(n.criado_em)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Bloco 2 — métricas + gráficos */}
      <section className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {metrics ? (
            <>
              <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  Total de lojistas
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#1a1614]">
                  {metrics.total}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  Ativos
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--dash-success)]">
                  {metrics.ativos}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Pendentes
                  </p>
                  {metrics.pendentes > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-200/80">
                      {metrics.pendentes}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-amber-800">
                  {metrics.pendentes}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    Bloqueados / Cancelados
                  </p>
                  {metrics.bloqueadosCancelados > 0 ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900 ring-1 ring-red-200/80">
                      {metrics.bloqueadosCancelados}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#374151]">
                  {metrics.bloqueadosCancelados}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  MRR estimado
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#1a1614]">{mrrFmt}</p>
                <p className="mt-1 text-[11px] text-[#9ca3af]">Soma dos planos ativos</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#6b7280] sm:col-span-2">A carregar métricas…</p>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-bold text-[#1a1614]">Novos cadastros (14 dias)</h2>
            <p className="mt-0.5 text-xs text-[#6b7280]">Por dia de criação da loja</p>
            <div className="mt-4 h-[180px] w-full min-w-0 sm:h-[220px]">
              {charts && charts.cadastros14d.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={charts.cadastros14d}
                    margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="adminCadastroFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--dash-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--dash-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="data"
                      tick={{ fontSize: 9, fill: '#6b7280' }}
                      tickFormatter={fmtChartDay}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <Tooltip
                      formatter={(v) => [String(v), 'Novos']}
                      labelFormatter={(l) => (typeof l === 'string' ? fmtDate(l) : String(l))}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Cadastros"
                      stroke="var(--dash-primary)"
                      strokeWidth={2}
                      fill="url(#adminCadastroFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-[#9ca3af]">
                  Sem dados de gráfico.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-bold text-[#1a1614]">Lojistas por estado</h2>
            <p className="mt-0.5 text-xs text-[#6b7280]">Distribuição global (todos os filtros)</p>
            <div className="mt-4 h-[180px] w-full min-w-0 sm:h-[220px]">
              {charts && charts.statusDistrib.some((s) => s.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.statusDistrib}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                    >
                      {charts.statusDistrib.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_CHART_COLORS[entry.name] ?? '#94a3b8'}
                        />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => [v, 'Lojistas']} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-[#9ca3af]">
                  Sem dados.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bloco 3 — tabela */}
      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filtros.map((f) => {
            const urgentBadge =
              f.id === 'urgentes' && metrics && metrics.urgentesCount > 0
                ? metrics.urgentesCount
                : null
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filtro === f.id
                    ? 'bg-[var(--dash-primary)] text-white shadow-sm'
                    : 'border border-[var(--card-border)] bg-white text-[#374151] hover:bg-[#f9fafb]'
                }`}
              >
                {f.label}
                {urgentBadge !== null ? (
                  <span
                    className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                      filtro === f.id ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {urgentBadge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <input
          type="search"
          placeholder="Buscar nome, email ou telefone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-md rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm text-[#1a1614] outline-none focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12 lg:w-80"
        />
      </div>

      <p className="mb-2 text-xs text-[#6b7280] sm:hidden">
        Desliza a tabela na horizontal para ver todas as colunas.
      </p>
      <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-white shadow-sm [-webkit-overflow-scrolling:touch] sm:mt-6">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="border-b border-[var(--card-border)] bg-[#f9fafb] text-[10px] font-semibold uppercase tracking-wide text-[#6b7280] sm:text-xs">
            <tr>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Nome</th>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Email</th>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Telefone</th>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Plano</th>
              <th
                className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3"
                title="Define o menu do painel do lojista em conjunto com o plano"
              >
                Modelo
              </th>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Status</th>
              <th
                className="whitespace-nowrap px-2 py-2 text-right sm:px-4 sm:py-3"
                title="Itens no cardápio (tabela products)"
              >
                Produtos
              </th>
              <th
                className="whitespace-nowrap px-2 py-2 text-right sm:px-4 sm:py-3"
                title="Soma do total dos pedidos, exceto cancelados"
              >
                Fat. pedidos
              </th>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Vence em</th>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Cadastro</th>
              <th className="whitespace-nowrap px-2 py-2 sm:px-4 sm:py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--card-border)]">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-[#6b7280] sm:px-4 sm:py-8">
                  A carregar…
                </td>
              </tr>
            ) : listError ? (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-red-800 sm:px-4 sm:py-8">
                  Corrige o erro acima e recarrega a página ou altera o filtro para tentar de novo.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-[#6b7280] sm:px-4 sm:py-8">
                  Nenhum resultado.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-2 py-2 font-medium text-[#1a1614] sm:px-4 sm:py-3">
                    <button
                      type="button"
                      onClick={() => setDrawerId(row.id)}
                      className="text-left font-medium text-[var(--dash-primary)] hover:underline"
                    >
                      {row.nome || '—'}
                    </button>
                  </td>
                  <td className="max-w-[12rem] truncate px-2 py-2 text-[#374151] sm:px-4 sm:py-3">
                    {row.email ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-[#374151] sm:px-4 sm:py-3">{row.telefone ?? '—'}</td>
                  <td className="px-2 py-2 font-medium text-[#1a1614] sm:px-4 sm:py-3">
                    {planShortLabel(row.plano)}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="flex flex-col gap-1.5">
                      <span
                        className={`inline-flex w-fit max-w-[10rem] rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ring-1 ${
                          row.operation_mode == null
                            ? 'bg-[#f3f4f6] text-[#4b5563] ring-black/10'
                            : 'bg-violet-50 text-violet-950 ring-violet-200/90'
                        }`}
                        title="Clica no nome do lojista para alterar o modelo no painel lateral"
                      >
                        {operationModeBadgeLabel(row.operation_mode)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDrawerId(row.id)}
                        className="w-fit text-left text-[11px] font-semibold text-[var(--dash-primary)] hover:underline"
                      >
                        Definir / alterar…
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="flex flex-col gap-1.5">
                      <span
                        className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {row.cancelamento_solicitado ? (
                          <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-900 ring-1 ring-orange-200/80">
                            Quer cancelar
                          </span>
                        ) : null}
                        {isNovo(row.cadastrado_em) ? (
                          <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900 ring-1 ring-sky-200/80">
                            Novo
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium text-[#1a1614] sm:px-4 sm:py-3">
                    {row.produtos_count}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium text-[#1a1614] sm:px-4 sm:py-3">
                    {moneyBr.format(row.faturamento_pedidos)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-[#374151] sm:px-4 sm:py-3">
                    <span className="inline-flex flex-wrap items-center">
                      {fmtDate(row.plano_vence_em)}
                      <VenceUrgenciaBadge plano_vence_em={row.plano_vence_em} />
                    </span>
                  </td>
                  <td className="px-2 py-2 tabular-nums text-[#6b7280] sm:px-4 sm:py-3">
                    {fmtDate(row.cadastrado_em)}
                  </td>
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(row.status === 'pendente' ||
                        row.status === 'bloqueado' ||
                        row.status === 'cancelado') && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => openPlanoModal('ativar', row)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {row.status === 'cancelado' ? 'Reativar' : 'Ativar'}
                        </button>
                      )}
                      {row.status === 'ativo' && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => openPlanoModal('renovar', row)}
                          className="rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
                        >
                          Renovar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => {
                          setFaturaModalRow(row)
                          setFaturaDesc('')
                          setFaturaValor('')
                          setFaturaStatus('pendente')
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
                      >
                        <IconReceipt className="h-3.5 w-3.5 opacity-70" />
                        Registrar fatura
                      </button>
                      {row.status === 'ativo' && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          title="Bloquear acesso"
                          aria-label="Bloquear acesso"
                          onClick={() => setConfirmBlock(row)}
                          className="rounded-lg p-1.5 text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
                        >
                          <IconLockClosed className="h-5 w-5" />
                        </button>
                      )}
                      {(row.status === 'ativo' || row.status === 'bloqueado') && (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          title="Cancelar assinatura"
                          aria-label="Cancelar assinatura"
                          onClick={() => setConfirmCancel(row)}
                          className="rounded-lg p-1.5 text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
                        >
                          <IconXCircle className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!planoModal}
        title={
          planoModal
            ? `${
                planoModal.mode === 'ativar'
                  ? planoModal.row.status === 'cancelado'
                    ? 'Reativar'
                    : 'Ativar'
                  : 'Renovar'
              } · ${planoModal.row.nome}`
            : ''
        }
        onClose={() => !busyId && setPlanoModal(null)}
      >
        {planoModal ? (
          <div className="space-y-4">
            {planoModal.mode === 'ativar' && planoModal.row.status === 'cancelado' ? (
              <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-950">
                Esta conta estava cancelada. Define o plano e a nova data de vencimento para voltar
                a ativar o acesso do lojista.
              </p>
            ) : null}
            <label className="block text-sm font-medium text-[#374151]">
              Plano
              <select
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={planoPick}
                onChange={(e) => setPlanoPick(e.target.value as Plan)}
              >
                {planOptionsInModal.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label} {o.priceLabel}/mês
                  </option>
                ))}
              </select>
            </label>
            {planoModal.row.operation_mode === 'hibrido' ? (
              <p className="rounded-xl border border-vyria-plum/20 bg-[var(--dash-primary)]/[0.06] px-3 py-2 text-xs leading-snug text-[#374151]">
                Preços do modelo <strong>Híbrido</strong> (Delivery + Presencial): valores
                superiores à tabela só delivery ou só presencial.
              </p>
            ) : planoModal.row.operation_mode ? (
              <p className="text-xs text-[#6b7280]">
                Tabela {operationModeLabel(planoModal.row.operation_mode)}:{' '}
                {planOptionsInModal.map((o) => `${o.label} ${o.priceLabel}`).join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-[#6b7280]">
                Loja sem modelo definido — preços base Delivery/Presencial (
                {planOptionsInModal.map((o) => `${o.label} ${o.priceLabel}`).join(' · ')}).
              </p>
            )}
            <label className="block text-sm font-medium text-[#374151]">
              Data de vencimento
              <input
                type="date"
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={planoVenceEm}
                onChange={(e) => setPlanoVenceEm(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void confirmPlanoModal()}
              className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!faturaModalRow}
        title={faturaModalRow ? `Registrar fatura · ${faturaModalRow.nome}` : ''}
        onClose={() => !busyId && setFaturaModalRow(null)}
      >
        {faturaModalRow ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-[#374151]">
              Descrição
              <input
                type="text"
                placeholder="Ex: Vyria Growth — Maio 2026"
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={faturaDesc}
                onChange={(e) => setFaturaDesc(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              Valor (R$)
              <input
                type="text"
                inputMode="decimal"
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={faturaValor}
                onChange={(e) => setFaturaValor(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              Estado
              <select
                className="mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                value={faturaStatus}
                onChange={(e) =>
                  setFaturaStatus(e.target.value as FaturaRow['status'])
                }
              >
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="falhou">Falhou</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void postRegistrarFatura(faturaModalRow.id, faturaModalRow.nome)}
              className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            >
              Registrar
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!confirmBlock}
        title="Bloquear acesso"
        onClose={() => !busyId && setConfirmBlock(null)}
      >
        {confirmBlock ? (
          <div className="space-y-4">
            <p className="text-sm text-[#374151]">
              Bloquear acesso de <strong>{confirmBlock.nome}</strong>?
            </p>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void postBloquear(confirmBlock)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[#f3f4f6] py-2.5 text-sm font-semibold text-[#374151] disabled:opacity-50"
            >
              Bloquear
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!confirmCancel}
        title="Cancelar assinatura"
        onClose={() => !busyId && setConfirmCancel(null)}
      >
        {confirmCancel ? (
          <div className="space-y-4">
            <p className="text-sm text-[#374151]">
              Cancelar assinatura de <strong>{confirmCancel.nome}</strong>?
            </p>
            <button
              type="button"
              disabled={!!busyId}
              onClick={() => void postCancelar(confirmCancel)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[#f3f4f6] py-2.5 text-sm font-semibold text-[#374151] disabled:opacity-50"
            >
              Cancelar assinatura
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!confirmPurge}
        title="Eliminar loja permanentemente"
        onClose={() => {
          if (!busyPurge) {
            setConfirmPurge(null)
            setPurgeConfirmName('')
          }
        }}
      >
        {confirmPurge ? (
          <div className="space-y-4">
            <p className="text-sm text-red-900">
              Isto apaga a loja <strong>{confirmPurge.nome}</strong>, todos os pedidos, produtos,
              caixa, faturas registadas no painel e restantes dados ligados a esta loja. Se o
              dono não tiver outras lojas, a conta de utilizador também é removida.
            </p>
            <p className="text-sm font-medium text-[#374151]">
              Escreve o nome exacto da loja para confirmar:
            </p>
            <input
              type="text"
              autoComplete="off"
              className="w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
              placeholder={confirmPurge.nome}
              value={purgeConfirmName}
              onChange={(e) => setPurgeConfirmName(e.target.value)}
            />
            <button
              type="button"
              disabled={
                busyPurge || purgeConfirmName.trim() !== confirmPurge.nome.trim()
              }
              onClick={() => void postPurgeLoja(confirmPurge, purgeConfirmName.trim())}
              className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            >
              {busyPurge ? 'A eliminar…' : 'Eliminar para sempre'}
            </button>
          </div>
        ) : null}
      </Modal>

      {drawerId ? (
        <div
          className="fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] justify-end"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Fechar painel"
            onClick={() => setDrawerId(null)}
          />
          <aside
            className="relative z-10 flex h-full w-full max-w-full flex-col border-l border-[var(--card-border)] bg-white shadow-2xl sm:max-w-[min(420px,100vw)]"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhe do lojista"
          >
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
              <h2 className="min-w-0 truncate text-base font-semibold text-[#1a1614]">
                {drawerLojista?.nome ?? 'Lojista'}
              </h2>
              <button
                type="button"
                onClick={() => setDrawerId(null)}
                className="rounded-lg px-2 py-1 text-xl leading-none text-[#6b7280] hover:bg-[#f5f5f5]"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {drawerLoading || !drawerLojista ? (
                <p className="text-sm text-[#6b7280]">A carregar…</p>
              ) : (
                <div className="space-y-6">
                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Dados
                    </h3>
                    {editingDados ? (
                      <div className="mt-3 space-y-3">
                        <label className="block text-sm text-[#374151]">
                          Nome
                          <input
                            className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                          />
                        </label>
                        <label className="block text-sm text-[#374151]">
                          Telefone
                          <input
                            className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                          />
                        </label>
                        <p className="text-sm text-[#6b7280]">
                          Email: {drawerLojista.email ?? '—'}
                        </p>
                        <p className="text-sm text-[#6b7280]">
                          Cadastro: {fmtDate(drawerLojista.cadastrado_em)}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyDrawerPatch}
                            onClick={() => void saveDrawerDados()}
                            className="rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDados(false)
                              setEditNome(drawerLojista.nome)
                              setEditPhone(drawerLojista.telefone ?? '')
                            }}
                            className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold text-[#374151]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2 text-sm">
                        <p>
                          <span className="text-[#6b7280]">Nome:</span>{' '}
                          <span className="font-medium text-[#1a1614]">{drawerLojista.nome}</span>
                        </p>
                        <p>
                          <span className="text-[#6b7280]">Email:</span>{' '}
                          {drawerLojista.email ?? '—'}
                        </p>
                        <p>
                          <span className="text-[#6b7280]">Telefone:</span>{' '}
                          {drawerLojista.telefone ?? '—'}
                        </p>
                        <p className="tabular-nums text-[#6b7280]">
                          Cadastro: {fmtDate(drawerLojista.cadastrado_em)}
                        </p>
                        <p>
                          <span className="text-[#6b7280]">Modelo de operação:</span>{' '}
                          <span className="font-medium text-[#1a1614]">
                            {operationModeBadgeLabel(drawerLojista.operation_mode)}
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingDados(true)}
                          className="mt-2 rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]"
                        >
                          Editar dados
                        </button>
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Senha de acesso (titular)
                    </h3>
                    <p className="mt-1 text-[11px] leading-snug text-[#9ca3af]">
                      Define uma nova senha para a conta Supabase Auth do dono desta loja (o mesmo email
                      indicado em «Email»). A senha anterior deixa de funcionar. Não envies a nova senha
                      por email em claro.
                    </p>
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm text-[#374151]">
                        Nova senha
                        <input
                          type="password"
                          autoComplete="new-password"
                          className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
                          value={ownerPwdNew}
                          onChange={(e) => setOwnerPwdNew(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm text-[#374151]">
                        Confirmar senha
                        <input
                          type="password"
                          autoComplete="new-password"
                          className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
                          value={ownerPwdConfirm}
                          onChange={(e) => setOwnerPwdConfirm(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busyOwnerPwd}
                        onClick={() => void postOwnerPassword()}
                        className="w-full rounded-lg bg-[#1a1614] px-3 py-2.5 text-xs font-semibold text-white hover:bg-black/90 disabled:opacity-50"
                      >
                        {busyOwnerPwd ? 'A atualizar…' : 'Atualizar senha de acesso'}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Modelo de operação
                    </h3>
                    <p className="mt-1 text-[11px] leading-snug text-[#9ca3af]">
                      «Não definido» mantém o menu só por plano. <strong>Híbrido</strong> = união
                      Delivery + Presencial no mesmo tier; cobrança com tabela própria (Start R$ 69,90 ·
                      Growth R$ 109,90 · Pro R$ 149,90). Ao ativar/renovar plano, os valores do select
                      seguem o modelo guardado aqui.
                    </p>
                    <label className="mt-3 block text-sm text-[#374151]">
                      Modo
                      <select
                        className="mt-1 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
                        value={drawerOperationModeDraft}
                        onChange={(e) => setDrawerOperationModeDraft(e.target.value)}
                      >
                        <option value="">Não definido (legado — só plano)</option>
                        <option value="delivery">{operationModeLabel('delivery')}</option>
                        <option value="presencial">{operationModeLabel('presencial')}</option>
                        <option value="hibrido">{operationModeLabel('hibrido')}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busyDrawerOperationMode}
                      onClick={() => void saveDrawerOperationMode()}
                      className="mt-3 rounded-lg bg-[var(--dash-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busyDrawerOperationMode ? 'A guardar…' : 'Guardar modelo'}
                    </button>
                  </section>

                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Loja / vendas
                    </h3>
                    <p className="mt-1 text-[11px] leading-snug text-[#9ca3af]">
                      Produtos no cardápio. Faturamento = soma do total dos pedidos na base (exceto
                      cancelados).
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5">
                        <dt className="text-[11px] font-medium text-[#6b7280]">Produtos</dt>
                        <dd className="mt-0.5 text-lg font-bold tabular-nums text-[#1a1614]">
                          {drawerLojista.produtos_count}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5">
                        <dt className="text-[11px] font-medium text-[#6b7280]">Fat. pedidos</dt>
                        <dd className="mt-0.5 text-lg font-bold tabular-nums text-[var(--dash-primary)]">
                          {moneyBr.format(drawerLojista.faturamento_pedidos)}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Assinatura
                    </h3>
                    <p className="mt-2 text-sm text-[#374151]">
                      <span className="text-[#6b7280]">Mensalidade indicativa:</span>{' '}
                      <span className="font-semibold tabular-nums text-[#1a1614]">
                        {planMonthlyPriceLabel(
                          drawerLojista.plano,
                          drawerLojista.operation_mode
                        )}
                      </span>
                      {drawerLojista.operation_mode === 'hibrido' ? (
                        <span className="ml-1 text-xs text-[#6b7280]">(tabela Híbrido)</span>
                      ) : null}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#1a1614] ring-1 ring-black/10">
                        {planShortLabel(drawerLojista.plano)}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(drawerLojista.status)}`}
                      >
                        {statusLabel(drawerLojista.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-[#374151]">
                      <span className="text-[#6b7280]">Vence em:</span>{' '}
                      <span className="tabular-nums">{fmtDate(drawerLojista.plano_vence_em)}</span>
                      <VenceUrgenciaBadge plano_vence_em={drawerLojista.plano_vence_em} />
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(drawerLojista.status === 'pendente' ||
                        drawerLojista.status === 'bloqueado' ||
                        drawerLojista.status === 'cancelado') && (
                        <button
                          type="button"
                          disabled={busyId === drawerLojista.id}
                          onClick={() => openPlanoModal('ativar', drawerLojista)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {drawerLojista.status === 'cancelado' ? 'Reativar' : 'Ativar'}
                        </button>
                      )}
                      {drawerLojista.status === 'ativo' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === drawerLojista.id}
                            onClick={() => openPlanoModal('renovar', drawerLojista)}
                            className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
                          >
                            Renovar
                          </button>
                          <button
                            type="button"
                            disabled={busyId === drawerLojista.id}
                            title="Bloquear acesso"
                            aria-label="Bloquear acesso"
                            onClick={() => setConfirmBlock(drawerLojista)}
                            className="rounded-lg p-2 text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
                          >
                            <IconLockClosed className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            disabled={busyId === drawerLojista.id}
                            title="Cancelar assinatura"
                            aria-label="Cancelar assinatura"
                            onClick={() => setConfirmCancel(drawerLojista)}
                            className="rounded-lg p-2 text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
                          >
                            <IconXCircle className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      {drawerLojista.status === 'bloqueado' && (
                        <button
                          type="button"
                          disabled={busyId === drawerLojista.id}
                          title="Cancelar assinatura"
                          aria-label="Cancelar assinatura"
                          onClick={() => setConfirmCancel(drawerLojista)}
                          className="rounded-lg p-2 text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
                        >
                          <IconXCircle className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Registrar fatura
                    </h3>
                    <div className="mt-3 space-y-3">
                      <input
                        type="text"
                        placeholder="Ex: Vyria Growth — Maio 2026"
                        className="w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                        value={drawerFaturaDesc}
                        onChange={(e) => setDrawerFaturaDesc(e.target.value)}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Valor (R$)"
                        className="w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                        value={drawerFaturaValor}
                        onChange={(e) => setDrawerFaturaValor(e.target.value)}
                      />
                      <select
                        className="w-full rounded-xl border border-[var(--card-border)] bg-white px-3 py-2.5 text-sm"
                        value={drawerFaturaStatus}
                        onChange={(e) =>
                          setDrawerFaturaStatus(e.target.value as FaturaRow['status'])
                        }
                      >
                        <option value="pago">Pago</option>
                        <option value="pendente">Pendente</option>
                        <option value="falhou">Falhou</option>
                      </select>
                      <button
                        type="button"
                        disabled={busyDrawerFatura}
                        onClick={() => void postDrawerFatura()}
                        className="w-full rounded-xl bg-[var(--dash-primary)] py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                      >
                        Registrar fatura
                      </button>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Histórico de faturas
                    </h3>
                    {drawerFaturas.length === 0 ? (
                      <p className="mt-3 text-sm text-[#6b7280]">Nenhuma fatura registada.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {drawerFaturas.map((f) => (
                          <li
                            key={f.id}
                            className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="tabular-nums text-[#6b7280]">
                                {fmtDateTime(f.criado_em)}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${faturaStatusBadgeClass(f.status)}`}
                              >
                                {faturaStatusLabel(f.status)}
                              </span>
                            </div>
                            <p className="mt-1 font-medium text-[#1a1614]">{f.descricao}</p>
                            <p className="tabular-nums text-[#374151]">{moneyBr.format(f.valor)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                      Histórico de ações
                    </h3>
                    {drawerLogs.length === 0 ? (
                      <p className="mt-3 text-sm text-[#6b7280]">Sem registos.</p>
                    ) : (
                      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs leading-relaxed text-[#374151]">
                        {drawerLogs.map((log) => (
                          <li key={log.id} className="border-b border-[var(--card-border)] pb-2 last:border-0">
                            {fmtDate(log.criado_em)} · {log.detalhes?.trim() || log.acao} ·{' '}
                            <span className="text-[#6b7280]">{log.admin_email ?? '—'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="rounded-2xl border border-red-200/80 bg-red-50/40 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-red-800">
                      Zona perigosa
                    </h3>
                    <p className="mt-2 text-sm text-red-950">
                      Remove esta loja e todos os dados associados na base. A operação não pode ser
                      desfeita.
                    </p>
                    <button
                      type="button"
                      disabled={busyPurge || busyId === drawerLojista.id}
                      onClick={() => {
                        setConfirmPurge(drawerLojista)
                        setPurgeConfirmName('')
                      }}
                      className="mt-3 w-full rounded-xl border border-red-300 bg-white px-3 py-2.5 text-sm font-semibold text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50"
                    >
                      Excluir loja e todos os dados
                    </button>
                  </section>
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
