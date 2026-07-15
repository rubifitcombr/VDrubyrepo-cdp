'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getProductsFiscal,
  updateProductFiscal,
  type ProductFiscalRow,
} from '@/services/products'

type Row = ProductFiscalRow

const cell =
  'w-full rounded-lg border border-[var(--card-border)] bg-white px-2 py-1.5 text-sm text-[#1a1614] outline-none focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/10'

function isReady(r: Row): boolean {
  return Boolean(r.ncm?.trim() && r.cfop?.trim())
}

export function ProductFiscalTable({
  storeId,
  onUpdated,
}: {
  storeId: string
  onUpdated?: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  // Preenchimento em massa.
  const [bulkNcm, setBulkNcm] = useState('')
  const [bulkCfop, setBulkCfop] = useState('5102')
  const [bulkCst, setBulkCst] = useState('102')
  const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const data = await getProductsFiscal(storeId)
      setRows(data)
      setDirty(new Set())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Falha ao carregar produtos.')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void load()
  }, [load])

  function edit(id: string, field: keyof Row, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    setDirty((prev) => new Set(prev).add(id))
  }

  function applyBulk() {
    const ncm = bulkNcm.trim()
    const cfop = bulkCfop.trim()
    const cst = bulkCst.trim()
    if (!ncm && !cfop && !cst) {
      setMsg('Preencha ao menos um campo para aplicar em massa.')
      return
    }
    const touched = new Set(dirty)
    setRows((prev) =>
      prev.map((r) => {
        const next = { ...r }
        if (ncm && (!bulkOnlyEmpty || !r.ncm?.trim())) next.ncm = ncm
        if (cfop && (!bulkOnlyEmpty || !r.cfop?.trim())) next.cfop = cfop
        if (cst && (!bulkOnlyEmpty || !r.cst_csosn?.trim())) next.cst_csosn = cst
        if (next.ncm !== r.ncm || next.cfop !== r.cfop || next.cst_csosn !== r.cst_csosn) {
          touched.add(r.id)
        }
        return next
      })
    )
    setDirty(touched)
    setMsg('Valores aplicados. Revise e clique em Salvar.')
  }

  async function save() {
    if (dirty.size === 0) {
      setMsg('Nenhuma alteração para salvar.')
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const toSave = rows.filter((r) => dirty.has(r.id))
      let failed = 0
      for (const r of toSave) {
        const { error } = await updateProductFiscal(r.id, {
          ncm: r.ncm?.trim() || null,
          cfop: r.cfop?.trim() || null,
          cest: r.cest?.trim() || null,
          cst_csosn: r.cst_csosn?.trim() || null,
          origem: r.origem?.trim() || '0',
          unidade: r.unidade?.trim() || 'UN',
        })
        if (error) failed += 1
      }
      if (failed > 0) {
        setMsg(`${failed} produto(s) não puderam ser salvos. Tente novamente.`)
      } else {
        setMsg(`Dados fiscais salvos (${toSave.length} produto(s)).`)
        setDirty(new Set())
        onUpdated?.()
      }
    } finally {
      setSaving(false)
    }
  }

  const missing = rows.filter((r) => !isReady(r)).length

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
          Dados fiscais dos produtos
        </p>
        {!loading ? (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              missing === 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            {missing === 0 ? 'Todos preenchidos' : `${missing} sem NCM/CFOP`}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-[#6b7280]">
        Preencha <strong>NCM</strong> e <strong>CFOP</strong> (obrigatórios) e, se aplicável,
        CST/CSOSN, CEST, origem e unidade. Itens sem NCM/CFOP não podem ser incluídos na NFC-e.
      </p>

      {/* Preenchimento em massa */}
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[var(--card-border)] bg-white p-3 sm:grid-cols-4 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[#374151]">
          NCM
          <input className={cell} value={bulkNcm} onChange={(e) => setBulkNcm(e.target.value)} placeholder="Ex.: 21069090" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[#374151]">
          CFOP
          <input className={cell} value={bulkCfop} onChange={(e) => setBulkCfop(e.target.value)} placeholder="5102" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-[#374151]">
          CST/CSOSN
          <input className={cell} value={bulkCst} onChange={(e) => setBulkCst(e.target.value)} placeholder="102" />
        </label>
        <label className="flex items-end gap-1.5 text-[11px] font-semibold text-[#374151]">
          <input type="checkbox" checked={bulkOnlyEmpty} onChange={(e) => setBulkOnlyEmpty(e.target.checked)} />
          Só vazios
        </label>
        <button
          type="button"
          onClick={applyBulk}
          className="self-end rounded-lg border border-[var(--dash-primary)]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--dash-primary)] hover:bg-[var(--dash-primary)]/5"
        >
          Aplicar a todos
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-[#9ca3af]">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#6b7280]">Nenhum produto cadastrado no cardápio.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                <th className="px-2 py-1.5">Produto</th>
                <th className="px-2 py-1.5">NCM</th>
                <th className="px-2 py-1.5">CFOP</th>
                <th className="px-2 py-1.5">CST/CSOSN</th>
                <th className="px-2 py-1.5">CEST</th>
                <th className="px-2 py-1.5">Origem</th>
                <th className="px-2 py-1.5">Un.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {rows.map((r) => (
                <tr key={r.id} className={isReady(r) ? '' : 'bg-amber-50/40'}>
                  <td className="px-2 py-1.5 align-top">
                    <p className="font-medium text-[#1a1614]">{r.name}</p>
                    {r.category ? <p className="text-[11px] text-[#9ca3af]">{r.category}</p> : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} value={r.ncm ?? ''} onChange={(e) => edit(r.id, 'ncm', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} value={r.cfop ?? ''} onChange={(e) => edit(r.id, 'cfop', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} value={r.cst_csosn ?? ''} onChange={(e) => edit(r.id, 'cst_csosn', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} value={r.cest ?? ''} onChange={(e) => edit(r.id, 'cest', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={`${cell} w-16`} value={r.origem ?? ''} onChange={(e) => edit(r.id, 'origem', e.target.value)} placeholder="0" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={`${cell} w-16`} value={r.unidade ?? ''} onChange={(e) => edit(r.id, 'unidade', e.target.value)} placeholder="UN" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {msg ? <p className="mt-3 text-sm text-[#374151]">{msg}</p> : null}

      {!loading && rows.length > 0 ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          {dirty.size > 0 ? (
            <span className="text-xs text-[#9ca3af]">{dirty.size} alteração(ões) pendente(s)</span>
          ) : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || dirty.size === 0}
            className="rounded-xl bg-[var(--dash-primary)] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition hover:brightness-105 disabled:opacity-50"
          >
            {saving ? 'A guardar…' : 'Salvar dados dos produtos'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
