'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import type {
  FinancialEntryDTO,
  FinancialEntryStatus,
  FinancialEntryType,
  FinanceiroSnapshotDTO,
  SupplierDTO,
} from '@/lib/financial-types'

type PeriodFilter = 'today' | '7d' | '30d' | 'all'

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
  nome: string
  telefone: string
  email: string
  categoria: string
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

function statusBadge(status: FinancialEntryStatus) {
  return status === 'pago' ? (
    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
      Pago
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
      Pendente
    </span>
  )
}

export function FinanceiroView({ storeId }: { storeId: string }) {
  const [period, setPeriod] = useState<PeriodFilter>('today')
  const [entries, setEntries] = useState<FinancialEntryDTO[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entryModalOpen, setEntryModalOpen] = useState(false)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [entryForm, setEntryForm] = useState<EntryForm>(() => emptyEntryForm())
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({
    nome: '',
    telefone: '',
    email: '',
    categoria: '',
  })
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
      setMissingTable(Boolean(json.missingTable))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!storeId) return
    void reload()
  }, [reload, storeId])

  const supplierById = useMemo(() => {
    return new Map(suppliers.map((s) => [s.id, s]))
  }, [suppliers])

  const filteredEntries = useMemo(() => {
    if (period === 'all') return entries
    const from = periodStart(period)
    return entries.filter((entry) => {
      const created = new Date(entry.created_at).getTime()
      return Number.isFinite(created) && created >= from
    })
  }, [entries, period])

  const summary = useMemo(() => {
    const receitas = filteredEntries
      .filter((e) => e.tipo === 'receita')
      .reduce((sum, e) => sum + e.valor, 0)
    const despesas = filteredEntries
      .filter((e) => e.tipo === 'despesa')
      .reduce((sum, e) => sum + e.valor, 0)
    const pendentes = filteredEntries
      .filter((e) => e.tipo === 'despesa' && e.status === 'pendente')
      .reduce((sum, e) => sum + e.valor, 0)
    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
      pendentes,
    }
  }, [filteredEntries])

  const pendingExpenses = useMemo(
    () => filteredEntries.filter((e) => e.tipo === 'despesa' && e.status === 'pendente'),
    [filteredEntries]
  )

  function openNewEntry() {
    setEntryForm(emptyEntryForm())
    setEntryModalOpen(true)
  }

  function openEditEntry(entry: FinancialEntryDTO) {
    setEntryForm(entryToForm(entry))
    setEntryModalOpen(true)
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
        body: JSON.stringify({ resource: 'supplier', ...supplierForm }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        showToast(json.error || 'Não foi possível criar fornecedor.')
        return
      }
      setSupplierForm({ nome: '', telefone: '', email: '', categoria: '' })
      setSupplierModalOpen(false)
      showToast('Fornecedor criado.')
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
      const res = await dashboardFetch(`/api/cashier/financeiro?id=${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
      })
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
              Financeiro, fornecedores, contas a pagar e resultado operacional.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewEntry}
            className="rounded-xl bg-[var(--dash-primary)] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25"
          >
            + Novo lançamento
          </button>
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
      </section>

      <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          ['Receitas', summary.receitas, 'text-emerald-700'],
          ['Despesas', summary.despesas, 'text-red-600'],
          ['Saldo', summary.saldo, summary.saldo >= 0 ? 'text-emerald-700' : 'text-red-600'],
          ['Contas pendentes', summary.pendentes, 'text-[var(--dash-primary)]'],
        ].map(([label, value, className]) => (
          <div key={label} className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${className}`}>{money.format(Number(value))}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1a1614]">Lançamentos financeiros</h2>
            <p className="mt-0.5 text-xs text-[#6b7280]">
              Receitas, despesas, vencimentos e pagamentos do período selecionado.
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
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1a1614]">Fornecedores</h2>
              <p className="mt-0.5 text-xs text-[#6b7280]">
                Cadastro simples para vincular despesas e acompanhar contas pendentes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSupplierModalOpen(true)}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb]"
            >
              + Novo fornecedor
            </button>
          </div>
          <SuppliersTable suppliers={suppliers} loading={loading} />
        </div>

        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-[#1a1614]">Fechamento financeiro diário</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">Resultado operacional do período filtrado.</p>
          <div className="mt-4 space-y-2 rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4 text-sm">
            <div className="flex justify-between gap-3 text-[#374151]">
              <span>Receitas do período</span>
              <span className="font-semibold tabular-nums">{money.format(summary.receitas)}</span>
            </div>
            <div className="flex justify-between gap-3 text-[#374151]">
              <span>Despesas do período</span>
              <span className="font-semibold tabular-nums">− {money.format(summary.despesas)}</span>
            </div>
            <div className="border-t border-[var(--card-border)] pt-3" />
            <div className="flex justify-between gap-3 text-base font-bold text-[#1a1614]">
              <span>Resultado operacional</span>
              <span className={summary.saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                {money.format(summary.saldo)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-[#1a1614]">Contas a pagar</h2>
        <p className="mt-0.5 text-xs text-[#6b7280]">Apenas despesas pendentes no período selecionado.</p>
        <PayablesTable
          entries={pendingExpenses}
          loading={loading}
          suppliers={supplierById}
          busyActionId={busyActionId}
          onEdit={openEditEntry}
          onDelete={(entry) => void deleteEntry(entry)}
          onMarkPaid={(entry) => void markPaid(entry)}
        />
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
    return <p className="mt-4 text-sm text-[#6b7280]">Nenhum lançamento financeiro neste filtro.</p>
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
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-[var(--card-border)]/80">
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
                {entry.supplier_id ? suppliers.get(entry.supplier_id)?.nome ?? entry.supplier_nome ?? '—' : '—'}
              </td>
              <td className="max-w-[18rem] truncate py-3 pr-3 text-[#1a1614]" title={entry.descricao}>
                {entry.descricao}
              </td>
              <td className="py-3 pr-3 text-right font-semibold tabular-nums text-[#1a1614]">
                {money.format(entry.valor)}
              </td>
              <td className="py-3 pr-3 text-[#6b7280]">{dateLabel(entry.created_at)}</td>
              <td className="py-3 pr-3">{statusBadge(entry.status)}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SuppliersTable({ suppliers, loading }: { suppliers: SupplierDTO[]; loading: boolean }) {
  if (loading && suppliers.length === 0) {
    return <p className="mt-4 text-sm text-[#6b7280]">A carregar fornecedores…</p>
  }
  if (suppliers.length === 0) {
    return <p className="mt-4 text-sm text-[#6b7280]">Nenhum fornecedor cadastrado.</p>
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            <th className="py-2 pr-3">Nome</th>
            <th className="py-2 pr-3">Telefone</th>
            <th className="py-2 pr-3">Categoria</th>
            <th className="py-2 text-right">Contas pendentes</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="border-b border-[var(--card-border)]/80">
              <td className="py-3 pr-3 font-semibold text-[#1a1614]">{supplier.nome}</td>
              <td className="py-3 pr-3 text-[#374151]">{supplier.telefone ?? '—'}</td>
              <td className="py-3 pr-3 text-[#374151]">{supplier.categoria ?? '—'}</td>
              <td className="py-3 text-right font-semibold tabular-nums text-[#1a1614]">
                {money.format(supplier.contas_pendentes)}
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
  if (entries.length === 0) return <p className="mt-4 text-sm text-[#6b7280]">Nenhuma conta pendente.</p>

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            <th className="py-2 pr-3">Fornecedor</th>
            <th className="py-2 pr-3">Descrição</th>
            <th className="py-2 pr-3 text-right">Valor</th>
            <th className="py-2 pr-3">Vencimento</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-[var(--card-border)]/80">
              <td className="py-3 pr-3 text-[#1a1614]">
                {entry.supplier_id ? suppliers.get(entry.supplier_id)?.nome ?? entry.supplier_nome ?? '—' : '—'}
              </td>
              <td className="max-w-[18rem] truncate py-3 pr-3 text-[#374151]" title={entry.descricao}>
                {entry.descricao}
              </td>
              <td className="py-3 pr-3 text-right font-semibold tabular-nums text-[#1a1614]">
                {money.format(entry.valor)}
              </td>
              <td className="py-3 pr-3 text-[#6b7280]">{dateLabel(entry.vencimento)}</td>
              <td className="py-3 pr-3">{statusBadge(entry.status)}</td>
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
          ))}
        </tbody>
      </table>
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
              onChange={(e) => set('tipo', e.target.value === 'receita' ? 'receita' : 'despesa')}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            >
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-[#6b7280]">
            Categoria
            <input
              value={form.categoria}
              onChange={(e) => set('categoria', e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
            />
          </label>
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
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-[#1a1614]">Novo fornecedor</h3>
        <label className="mt-4 block text-xs font-medium text-[#6b7280]">
          Nome
          <input
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            className="mt-1 block w-full rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm"
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
            value={form.categoria}
            onChange={(e) => set('categoria', e.target.value)}
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
