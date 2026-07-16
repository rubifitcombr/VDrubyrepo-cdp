'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import {
  FINANCIAL_DESPESA_CATEGORIES,
  FINANCIAL_RECEITA_CATEGORIES,
  FINANCIAL_SUPPLIER_CATEGORIES,
  isFinancialEntryOverdue,
  type FinancialEntryDTO,
  type FinancialEntryStatus,
  type FinancialEntryType,
  type FinanceiroSnapshotDTO,
  type OperationalSaleDTO,
  type SupplierDTO,
} from '@/lib/financial-types'

type PeriodFilter = 'today' | '7d' | '30d' | 'all'
type TipoFilter = 'all' | FinancialEntryType
type StatusFilter = 'all' | FinancialEntryStatus | 'vencida'

type EntryForm = {
  id: string | null
  tipo: FinancialEntryType
  categoria: string
  supplier_id: string
  descricao: string
  valor: string
  created_at: string
  vencimento: string
  data_pagamento: string
  status: FinancialEntryStatus
}

type SupplierForm = {
  id: string | null
  nome: string
  telefone: string
  email: string
  categoria: string
  cnpj: string
  observacao: string
}

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
})

function periodStart(period: Exclude<PeriodFilter, 'all'>): number {
  const now = Date.now()
  if (period === 'today') {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (period === '7d') return now - 7 * 86400000
  return now - 30 * 86400000
}

function inPeriod(iso: string, period: PeriodFilter): boolean {
  if (period === 'all') return true
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= periodStart(period)
}

function parseMoneyInput(raw: string): number {
  const n = Number(raw.replace(',', '.').trim())
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : ''
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? dateFmt.format(d) : '—'
}

function emptyEntryForm(): EntryForm {
  return {
    id: null,
    tipo: 'despesa',
    categoria: '',
    supplier_id: '',
    descricao: '',
    valor: '',
    created_at: todayInput(),
    vencimento: '',
    data_pagamento: '',
    status: 'pendente',
  }
}

function emptySupplierForm(): SupplierForm {
  return {
    id: null,
    nome: '',
    telefone: '',
    email: '',
    categoria: '',
    cnpj: '',
    observacao: '',
  }
}

function entryToForm(entry: FinancialEntryDTO): EntryForm {
  return {
    id: entry.id,
    tipo: entry.tipo,
    categoria: entry.categoria,
    supplier_id: entry.supplier_id ?? '',
    descricao: entry.descricao,
    valor: String(entry.valor.toFixed(2)).replace('.', ','),
    created_at: toDateInput(entry.created_at) || todayInput(),
    vencimento: toDateInput(entry.vencimento),
    data_pagamento: toDateInput(entry.data_pagamento),
    status: entry.status,
  }
}

function supplierToForm(supplier: SupplierDTO): SupplierForm {
  return {
    id: supplier.id,
    nome: supplier.nome,
    telefone: supplier.telefone ?? '',
    email: supplier.email ?? '',
    categoria: supplier.categoria ?? '',
    cnpj: supplier.cnpj ?? '',
    observacao: supplier.observacao ?? '',
  }
}

function statusBadge(entry: FinancialEntryDTO) {
  if (isFinancialEntryOverdue(entry)) {
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800 ring-1 ring-red-200">
        Vencida
      </span>
    )
  }
  return entry.status === 'pago' ? (
    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
      Pago
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
      Pendente
    </span>
  )
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function FinanceiroView({ storeId }: { storeId: string }) {
  const [period, setPeriod] = useState<PeriodFilter>('today')
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState<FinancialEntryDTO[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [sales, setSales] = useState<OperationalSaleDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entryModalOpen, setEntryModalOpen] = useState(false)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [entryForm, setEntryForm] = useState<EntryForm>(() => emptyEntryForm())
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(() => emptySupplierForm())
  const [busyEntry, setBusyEntry] = useState(false)
  const [busySupplier, setBusySupplier] = useState(false)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 4500)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await dashboardFetch('/api/cashier/financeiro')
      const json = (await res.json().catch(() => ({}))) as FinanceiroSnapshotDTO & {
        error?: string
        missingTable?: boolean
      }
      if (!res.ok) {
        setError(json.error || 'Não foi possível carregar o financeiro.')
        return
      }
      setEntries(json.entries ?? [])
      setSuppliers(json.suppliers ?? [])
      setSales(json.sales ?? [])
      setMissingTable(Boolean(json.missingTable))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!storeId) return
    void reload()
  }, [reload, storeId])

  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers])

  const periodEntries = useMemo(
    () => entries.filter((e) => inPeriod(e.created_at, period)),
    [entries, period]
  )

  const periodSales = useMemo(
    () => sales.filter((s) => inPeriod(s.created_at, period)),
    [sales, period]
  )

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return periodEntries.filter((entry) => {
      if (tipoFilter !== 'all' && entry.tipo !== tipoFilter) return false
      if (statusFilter === 'vencida') {
        if (!isFinancialEntryOverdue(entry)) return false
      } else if (statusFilter !== 'all' && entry.status !== statusFilter) {
        return false
      }
      if (supplierFilter !== 'all') {
        if (supplierFilter === 'none') {
          if (entry.supplier_id) return false
        } else if (entry.supplier_id !== supplierFilter) {
          return false
        }
      }
      if (q) {
        const supplierName = entry.supplier_id
          ? supplierById.get(entry.supplier_id)?.nome ?? entry.supplier_nome ?? ''
          : ''
        const hay = `${entry.categoria} ${entry.descricao} ${supplierName}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [periodEntries, tipoFilter, statusFilter, supplierFilter, search, supplierById])

  const summary = useMemo(() => {
    const vendas = periodSales.reduce((sum, s) => sum + s.total, 0)
    let receitasManuais = 0
    let receitasPagas = 0
    let despesas = 0
    let despesasPagas = 0
    let pendentes = 0
    let vencidas = 0
    for (const e of periodEntries) {
      if (e.tipo === 'receita') {
        receitasManuais += e.valor
        if (e.status === 'pago') receitasPagas += e.valor
      } else {
        despesas += e.valor
        if (e.status === 'pago') despesasPagas += e.valor
        else {
          pendentes += e.valor
          if (isFinancialEntryOverdue(e)) vencidas += e.valor
        }
      }
    }
    const realizado = vendas + receitasPagas - despesasPagas
    const operacional = vendas + receitasManuais - despesas
    return {
      vendas,
      receitasManuais,
      receitasPagas,
      despesas,
      despesasPagas,
      pendentes,
      vencidas,
      realizado,
      operacional,
      vendasCount: periodSales.length,
    }
  }, [periodEntries, periodSales])

  const pendingExpenses = useMemo(() => {
    return periodEntries
      .filter((e) => e.tipo === 'despesa' && e.status === 'pendente')
      .sort((a, b) => {
        const ao = isFinancialEntryOverdue(a) ? 0 : 1
        const bo = isFinancialEntryOverdue(b) ? 0 : 1
        if (ao !== bo) return ao - bo
        const av = a.vencimento ? new Date(a.vencimento).getTime() : Number.POSITIVE_INFINITY
        const bv = b.vencimento ? new Date(b.vencimento).getTime() : Number.POSITIVE_INFINITY
        return av - bv
      })
  }, [periodEntries])

  function openNewEntry() {
    setEntryForm(emptyEntryForm())
    setEntryModalOpen(true)
  }

  function openEditEntry(entry: FinancialEntryDTO) {
    setEntryForm(entryToForm(entry))
    setEntryModalOpen(true)
  }

  function openNewSupplier() {
    setSupplierForm(emptySupplierForm())
    setSupplierModalOpen(true)
  }

  function openEditSupplier(supplier: SupplierDTO) {
    setSupplierForm(supplierToForm(supplier))
    setSupplierModalOpen(true)
  }

  async function saveEntry() {
    const valor = parseMoneyInput(entryForm.valor)
    if (!entryForm.categoria.trim() || !entryForm.descricao.trim() || valor <= 0) {
      showToast('Preenche categoria, descrição e valor.')
      return
    }

    setBusyEntry(true)
    try {
      const res = await dashboardFetch('/api/cashier/financeiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'entry',
          id: entryForm.id,
          tipo: entryForm.tipo,
          categoria: entryForm.categoria,
          supplier_id: entryForm.supplier_id || null,
          descricao: entryForm.descricao,
          valor,
          created_at: entryForm.created_at || null,
          vencimento: entryForm.vencimento || null,
          data_pagamento: entryForm.data_pagamento || null,
          status: entryForm.status,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível guardar.')
        return
      }
      setEntryModalOpen(false)
      showToast(entryForm.id ? 'Lançamento atualizado.' : 'Lançamento criado.')
      await reload()
    } finally {
      setBusyEntry(false)
    }
  }

  async function saveSupplier() {
    if (!supplierForm.nome.trim()) {
      showToast('Nome do fornecedor é obrigatório.')
      return
    }
    setBusySupplier(true)
    try {
      const res = await dashboardFetch('/api/cashier/financeiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'supplier',
          id: supplierForm.id,
          nome: supplierForm.nome,
          telefone: supplierForm.telefone,
          email: supplierForm.email,
          categoria: supplierForm.categoria,
          cnpj: supplierForm.cnpj,
          observacao: supplierForm.observacao,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível guardar fornecedor.')
        return
      }
      setSupplierForm(emptySupplierForm())
      setSupplierModalOpen(false)
      showToast(supplierForm.id ? 'Fornecedor atualizado.' : 'Fornecedor criado.')
      await reload()
    } finally {
      setBusySupplier(false)
    }
  }

  async function markPaid(entry: FinancialEntryDTO) {
    setBusyActionId(entry.id)
    try {
      const res = await dashboardFetch('/api/cashier/financeiro', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, action: 'mark_paid' }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível marcar como pago.')
        return
      }
      showToast('Conta marcada como paga.')
      await reload()
    } finally {
      setBusyActionId(null)
    }
  }

  async function deleteEntry(entry: FinancialEntryDTO) {
    if (!window.confirm('Excluir este lançamento financeiro?')) return
    setBusyActionId(entry.id)
    try {
      const res = await dashboardFetch(
        `/api/cashier/financeiro?resource=entry&id=${encodeURIComponent(entry.id)}`,
        { method: 'DELETE' }
      )
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível excluir.')
        return
      }
      showToast('Lançamento excluído.')
      await reload()
    } finally {
      setBusyActionId(null)
    }
  }

  async function deleteSupplier(supplier: SupplierDTO) {
    if (
      !window.confirm(
        `Excluir o fornecedor "${supplier.nome}"? Lançamentos vinculados ficam sem fornecedor.`
      )
    ) {
      return
    }
    setBusyActionId(supplier.id)
    try {
      const res = await dashboardFetch(
        `/api/cashier/financeiro?resource=supplier&id=${encodeURIComponent(supplier.id)}`,
        { method: 'DELETE' }
      )
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível excluir fornecedor.')
        return
      }
      showToast('Fornecedor excluído.')
      await reload()
    } finally {
      setBusyActionId(null)
    }
  }

  function exportCsv() {
    const lines = [
      ['tipo', 'categoria', 'fornecedor', 'descricao', 'valor', 'data', 'vencimento', 'status'].join(';'),
      ...filteredEntries.map((e) =>
        [
          e.tipo,
          e.categoria,
          e.supplier_id
            ? supplierById.get(e.supplier_id)?.nome ?? e.supplier_nome ?? ''
            : '',
          e.descricao,
          e.valor.toFixed(2).replace('.', ','),
          dateLabel(e.created_at),
          dateLabel(e.vencimento),
          isFinancialEntryOverdue(e) ? 'vencida' : e.status,
        ]
          .map(csvEscape)
          .join(';')
      ),
    ]
    downloadBlob(
      `financeiro-vyria-${period}-${todayInput()}.csv`,
      new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
    )
    showToast('CSV exportado.')
  }

  function exportPdf() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const m = 14
    let y = m
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Vyria — Financeiro', m, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(80)
    doc.text(`Período: ${periodLabel(period)} · Gerado em ${dateLabel(new Date().toISOString())}`, m, y)
    y += 8
    doc.setTextColor(0)
    doc.setFont('helvetica', 'bold')
    doc.text('Fechamento', m, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    const closeLines = [
      `Vendas (caixa/PDV): ${money.format(summary.vendas)} (${summary.vendasCount} pedidos)`,
      `Receitas manuais pagas: ${money.format(summary.receitasPagas)}`,
      `Despesas pagas: ${money.format(summary.despesasPagas)}`,
      `Resultado realizado: ${money.format(summary.realizado)}`,
      `Contas pendentes: ${money.format(summary.pendentes)}`,
      `Contas vencidas: ${money.format(summary.vencidas)}`,
    ]
    for (const line of closeLines) {
      doc.text(line, m, y)
      y += 5.2
    }
    y += 4
    autoTable(doc, {
      startY: y,
      head: [['Tipo', 'Categoria', 'Fornecedor', 'Descrição', 'Valor', 'Status']],
      body: filteredEntries.map((e) => [
        e.tipo === 'receita' ? 'Receita' : 'Despesa',
        e.categoria,
        e.supplier_id ? supplierById.get(e.supplier_id)?.nome ?? e.supplier_nome ?? '—' : '—',
        e.descricao,
        money.format(e.valor),
        isFinancialEntryOverdue(e) ? 'Vencida' : e.status === 'pago' ? 'Pago' : 'Pendente',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [26, 22, 20] },
    })
    doc.save(`financeiro-vyria-${period}-${todayInput()}.pdf`)
    showToast('PDF exportado.')
  }

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
        <span className="font-medium text-[#1a1614]">Caixa · Financeiro</span>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
              Financeiro
            </h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              Vendas do caixa/PDV, lançamentos manuais, fornecedores e contas a pagar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm font-semibold text-[#374151] shadow-sm"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm font-semibold text-[#374151] shadow-sm"
            >
              Exportar PDF
            </button>
            <button
              type="button"
              onClick={openNewEntry}
              className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25"
            >
              + Novo lançamento
            </button>
          </div>
        </div>
      </header>

      {missingTable ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Aplica a migração do Financeiro no Supabase para gravar fornecedores e lançamentos.
        </div>
      ) : null}
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <section className="mt-6 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-[#1a1614]">Filtros</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(
            [
              ['today', 'Hoje'],
              ['7d', '7 dias'],
              ['30d', '30 dias'],
              ['all', 'Tudo'],
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
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-[#6b7280]">
            Tipo
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value as TipoFilter)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm text-[#1a1614]"
            >
              <option value="all">Todos</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm text-[#1a1614]"
            >
              <option value="all">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="vencida">Vencida</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Fornecedor
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm text-[#1a1614]"
            >
              <option value="all">Todos</option>
              <option value="none">Sem fornecedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Busca
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Categoria, descrição…"
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2 text-sm text-[#1a1614]"
            />
          </label>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Vendas (caixa/PDV)"
          value={summary.vendas}
          hint={`${summary.vendasCount} pedidos entregues`}
          tone="neutral"
        />
        <SummaryCard
          label="Resultado realizado"
          value={summary.realizado}
          hint="Vendas + receitas pagas − despesas pagas"
          tone={summary.realizado >= 0 ? 'good' : 'bad'}
        />
        <SummaryCard
          label="Contas pendentes"
          value={summary.pendentes}
          hint="Despesas ainda não pagas"
          tone="warn"
        />
        <SummaryCard
          label="Contas vencidas"
          value={summary.vencidas}
          hint="Pendentes com vencimento passado"
          tone={summary.vencidas > 0 ? 'bad' : 'good'}
        />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1a1614]">Lançamentos financeiros</h2>
              <p className="mt-0.5 text-xs text-[#6b7280]">
                {filteredEntries.length} lançamento(s) com os filtros atuais.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewEntry}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb]"
            >
              + Novo lançamento
            </button>
          </div>
          <FinancialEntriesTable
            entries={filteredEntries}
            loading={loading}
            suppliers={supplierById}
            busyActionId={busyActionId}
            onEdit={openEditEntry}
            onDelete={(entry) => void deleteEntry(entry)}
            onMarkPaid={(entry) => void markPaid(entry)}
          />
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-[#1a1614]">Fechamento do período</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Combina vendas operacionais com lançamentos manuais.
          </p>
          <div className="mt-4 space-y-2 rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4 text-sm">
            <CloseRow label="Vendas caixa/PDV" value={summary.vendas} />
            <CloseRow label="Receitas manuais (pagas)" value={summary.receitasPagas} />
            <CloseRow label="Despesas pagas" value={-summary.despesasPagas} />
            <div className="border-t border-[var(--card-border)] pt-3" />
            <div className="flex justify-between gap-3 text-base font-bold text-[#1a1614]">
              <span>Resultado realizado</span>
              <span className={summary.realizado >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                {money.format(summary.realizado)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-3 text-[#6b7280]">
              <span>Ainda pendente a pagar</span>
              <span className="font-semibold tabular-nums text-amber-800">
                {money.format(summary.pendentes)}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-[#6b7280]">
              <span>Resultado se pagar tudo</span>
              <span
                className={`font-semibold tabular-nums ${
                  summary.operacional >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {money.format(summary.operacional)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1a1614]">Fornecedores</h2>
              <p className="mt-0.5 text-xs text-[#6b7280]">
                Cadastro com CNPJ, contato e contas pendentes.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewSupplier}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb]"
            >
              + Novo fornecedor
            </button>
          </div>
          <SuppliersTable
            suppliers={suppliers}
            loading={loading}
            busyActionId={busyActionId}
            onEdit={openEditSupplier}
            onDelete={(s) => void deleteSupplier(s)}
          />
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-[#1a1614]">Contas a pagar</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Despesas pendentes do período — vencidas primeiro.
          </p>
          <PayablesTable
            entries={pendingExpenses}
            loading={loading}
            suppliers={supplierById}
            busyActionId={busyActionId}
            onEdit={openEditEntry}
            onDelete={(entry) => void deleteEntry(entry)}
            onMarkPaid={(entry) => void markPaid(entry)}
          />
        </div>
      </section>

      {entryModalOpen ? (
        <EntryModal
          form={entryForm}
          suppliers={suppliers}
          busy={busyEntry}
          onClose={() => setEntryModalOpen(false)}
          onSave={() => void saveEntry()}
          onChange={setEntryForm}
        />
      ) : null}

      {supplierModalOpen ? (
        <SupplierModal
          form={supplierForm}
          busy={busySupplier}
          onClose={() => setSupplierModalOpen(false)}
          onSave={() => void saveSupplier()}
          onChange={setSupplierForm}
        />
      ) : null}
    </div>
  )
}

function periodLabel(period: PeriodFilter): string {
  if (period === 'today') return 'Hoje'
  if (period === '7d') return 'Últimos 7 dias'
  if (period === '30d') return 'Últimos 30 dias'
  return 'Todo o histórico'
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint: string
  tone: 'good' | 'bad' | 'warn' | 'neutral'
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'bad'
        ? 'text-red-600'
        : tone === 'warn'
          ? 'text-amber-800'
          : 'text-[#1a1614]'
  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>{money.format(value)}</p>
      <p className="mt-1 text-xs text-[#9ca3af]">{hint}</p>
    </div>
  )
}

function CloseRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3 text-[#374151]">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{money.format(value)}</span>
    </div>
  )
}

function FinancialEntriesTable({
  entries,
  loading,
  suppliers,
  busyActionId,
  onEdit,
  onDelete,
  onMarkPaid,
}: {
  entries: FinancialEntryDTO[]
  loading: boolean
  suppliers: Map<string, SupplierDTO>
  busyActionId: string | null
  onEdit: (entry: FinancialEntryDTO) => void
  onDelete: (entry: FinancialEntryDTO) => void
  onMarkPaid: (entry: FinancialEntryDTO) => void
}) {
  if (loading && entries.length === 0) {
    return <p className="mt-4 text-sm text-[#6b7280]">A carregar lançamentos…</p>
  }
  if (entries.length === 0) {
    return <p className="mt-4 text-sm text-[#6b7280]">Nenhum lançamento com estes filtros.</p>
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            <th className="py-2 pr-3">Tipo</th>
            <th className="py-2 pr-3">Categoria</th>
            <th className="py-2 pr-3">Fornecedor</th>
            <th className="py-2 pr-3">Descrição</th>
            <th className="py-2 pr-3 text-right">Valor</th>
            <th className="py-2 pr-3">Data</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const overdue = isFinancialEntryOverdue(entry)
            return (
              <tr
                key={entry.id}
                className={`border-b border-[var(--card-border)]/80 ${
                  overdue ? 'bg-red-50/60' : ''
                }`}
              >
                <td className="py-3 pr-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${
                      entry.tipo === 'receita'
                        ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
                        : 'bg-red-50 text-red-700 ring-red-100'
                    }`}
                  >
                    {entry.tipo === 'receita' ? 'Receita' : 'Despesa'}
                  </span>
                </td>
                <td className="py-3 pr-3 text-[#374151]">{entry.categoria}</td>
                <td className="py-3 pr-3 text-[#374151]">
                  {entry.supplier_id
                    ? suppliers.get(entry.supplier_id)?.nome ?? entry.supplier_nome ?? '—'
                    : '—'}
                </td>
                <td className="max-w-[18rem] truncate py-3 pr-3 text-[#1a1614]" title={entry.descricao}>
                  {entry.descricao}
                </td>
                <td className="py-3 pr-3 text-right font-semibold tabular-nums text-[#1a1614]">
                  {money.format(entry.valor)}
                </td>
                <td className="py-3 pr-3 text-[#6b7280]">{dateLabel(entry.created_at)}</td>
                <td className="py-3 pr-3">{statusBadge(entry)}</td>
                <td className="py-3">
                  <EntryActions
                    entry={entry}
                    busy={busyActionId === entry.id}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMarkPaid={onMarkPaid}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SuppliersTable({
  suppliers,
  loading,
  busyActionId,
  onEdit,
  onDelete,
}: {
  suppliers: SupplierDTO[]
  loading: boolean
  busyActionId: string | null
  onEdit: (supplier: SupplierDTO) => void
  onDelete: (supplier: SupplierDTO) => void
}) {
  if (loading && suppliers.length === 0) {
    return <p className="mt-4 text-sm text-[#6b7280]">A carregar fornecedores…</p>
  }
  if (suppliers.length === 0) {
    return <p className="mt-4 text-sm text-[#6b7280]">Nenhum fornecedor cadastrado.</p>
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            <th className="py-2 pr-3">Nome</th>
            <th className="py-2 pr-3">CNPJ</th>
            <th className="py-2 pr-3">Categoria</th>
            <th className="py-2 pr-3 text-right">Pendentes</th>
            <th className="py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="border-b border-[var(--card-border)]/80">
              <td className="py-3 pr-3">
                <p className="font-semibold text-[#1a1614]">{supplier.nome}</p>
                <p className="text-xs text-[#9ca3af]">{supplier.telefone ?? supplier.email ?? '—'}</p>
              </td>
              <td className="py-3 pr-3 text-[#374151]">{supplier.cnpj ?? '—'}</td>
              <td className="py-3 pr-3 text-[#374151]">{supplier.categoria ?? '—'}</td>
              <td className="py-3 pr-3 text-right font-semibold tabular-nums text-[#1a1614]">
                {money.format(supplier.contas_pendentes)}
              </td>
              <td className="py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyActionId === supplier.id}
                    onClick={() => onEdit(supplier)}
                    className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] disabled:opacity-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busyActionId === supplier.id}
                    onClick={() => onDelete(supplier)}
                    className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PayablesTable({
  entries,
  loading,
  suppliers,
  busyActionId,
  onEdit,
  onDelete,
  onMarkPaid,
}: {
  entries: FinancialEntryDTO[]
  loading: boolean
  suppliers: Map<string, SupplierDTO>
  busyActionId: string | null
  onEdit: (entry: FinancialEntryDTO) => void
  onDelete: (entry: FinancialEntryDTO) => void
  onMarkPaid: (entry: FinancialEntryDTO) => void
}) {
  if (loading && entries.length === 0) return <p className="mt-4 text-sm text-[#6b7280]">A carregar contas…</p>
  if (entries.length === 0) return <p className="mt-4 text-sm text-[#6b7280]">Nenhuma conta pendente no período.</p>

  return (
    <div className="mt-4 space-y-2">
      {entries.map((entry) => {
        const overdue = isFinancialEntryOverdue(entry)
        return (
          <div
            key={entry.id}
            className={`rounded-xl border px-3 py-3 ${
              overdue
                ? 'border-red-200 bg-red-50'
                : 'border-[var(--card-border)] bg-[#fafafa]'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-[#1a1614]">
                  {entry.supplier_id
                    ? suppliers.get(entry.supplier_id)?.nome ?? entry.supplier_nome ?? 'Sem fornecedor'
                    : 'Sem fornecedor'}
                </p>
                <p className="truncate text-sm text-[#6b7280]" title={entry.descricao}>
                  {entry.descricao}
                </p>
                <p className="mt-1 text-xs text-[#9ca3af]">
                  Vence {dateLabel(entry.vencimento)} · {entry.categoria}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold tabular-nums text-[#1a1614]">{money.format(entry.valor)}</p>
                <div className="mt-1">{statusBadge(entry)}</div>
              </div>
            </div>
            <div className="mt-3">
              <EntryActions
                entry={entry}
                busy={busyActionId === entry.id}
                onEdit={onEdit}
                onDelete={onDelete}
                onMarkPaid={onMarkPaid}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EntryActions({
  entry,
  busy,
  onEdit,
  onDelete,
  onMarkPaid,
}: {
  entry: FinancialEntryDTO
  busy: boolean
  onEdit: (entry: FinancialEntryDTO) => void
  onDelete: (entry: FinancialEntryDTO) => void
  onMarkPaid: (entry: FinancialEntryDTO) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {entry.status === 'pendente' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onMarkPaid(entry)}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Marcar como pago
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => onEdit(entry)}
        className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] disabled:opacity-50"
      >
        Editar
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDelete(entry)}
        className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
      >
        Excluir
      </button>
    </div>
  )
}

function CategoryField({
  tipo,
  value,
  onChange,
}: {
  tipo: FinancialEntryType
  value: string
  onChange: (v: string) => void
}) {
  const presets =
    tipo === 'despesa' ? FINANCIAL_DESPESA_CATEGORIES : FINANCIAL_RECEITA_CATEGORIES
  const listId = tipo === 'despesa' ? 'fin-cat-despesa' : 'fin-cat-receita'
  return (
    <label className="block text-xs font-medium text-[#6b7280]">
      Categoria
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
        placeholder="Escolhe ou digita…"
      />
      <datalist id={listId}>
        {presets.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </label>
  )
}

function EntryModal({
  form,
  suppliers,
  busy,
  onClose,
  onSave,
  onChange,
}: {
  form: EntryForm
  suppliers: SupplierDTO[]
  busy: boolean
  onClose: () => void
  onSave: () => void
  onChange: (form: EntryForm) => void
}) {
  const set = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-[#1a1614]">
          {form.id ? 'Editar lançamento' : 'Novo lançamento'}
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-[#6b7280]">
            Tipo
            <select
              value={form.tipo}
              onChange={(e) => {
                const tipo = e.target.value === 'receita' ? 'receita' : 'despesa'
                onChange({ ...form, tipo, categoria: '' })
              }}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            >
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </select>
          </label>
          <CategoryField
            tipo={form.tipo}
            value={form.categoria}
            onChange={(categoria) => set('categoria', categoria)}
          />
          <label className="block text-xs font-medium text-[#6b7280]">
            Fornecedor
            <select
              value={form.supplier_id}
              onChange={(e) => set('supplier_id', e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            >
              <option value="">Sem fornecedor</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Valor (R$)
            <input
              type="text"
              inputMode="decimal"
              value={form.valor}
              onChange={(e) => set('valor', e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[#6b7280] sm:col-span-2">
            Descrição
            <input
              value={form.descricao}
              onChange={(e) => set('descricao', e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Data
            <input
              type="date"
              value={form.created_at}
              onChange={(e) => set('created_at', e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Vencimento
            <input
              type="date"
              value={form.vencimento}
              onChange={(e) => set('vencimento', e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Status
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value === 'pago' ? 'pago' : 'pendente')}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            >
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Data de pagamento
            <input
              type="date"
              value={form.data_pagamento}
              onChange={(e) => set('data_pagamento', e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#374151] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SupplierModal({
  form,
  busy,
  onClose,
  onSave,
  onChange,
}: {
  form: SupplierForm
  busy: boolean
  onClose: () => void
  onSave: () => void
  onChange: (form: SupplierForm) => void
}) {
  const set = <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-[#1a1614]">
          {form.id ? 'Editar fornecedor' : 'Novo fornecedor'}
        </h3>
        <label className="mt-4 block text-xs font-medium text-[#6b7280]">
          Nome
          <input
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-[#6b7280]">
          CNPJ / CPF
          <input
            value={form.cnpj}
            onChange={(e) => set('cnpj', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            placeholder="00.000.000/0000-00"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-[#6b7280]">
          Telefone
          <input
            value={form.telefone}
            onChange={(e) => set('telefone', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-[#6b7280]">
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-[#6b7280]">
          Categoria
          <input
            list="fin-supplier-cat"
            value={form.categoria}
            onChange={(e) => set('categoria', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            placeholder="Escolhe ou digita…"
          />
          <datalist id="fin-supplier-cat">
            {FINANCIAL_SUPPLIER_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="mt-3 block text-xs font-medium text-[#6b7280]">
          Observação
          <textarea
            value={form.observacao}
            onChange={(e) => set('observacao', e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
          />
        </label>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-[#374151] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'A guardar…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
