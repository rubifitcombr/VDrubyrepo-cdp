'use client'

import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import type { EntregadorTipo, StoreEntregadorDTO } from '@/lib/entregas-types'
import { useEffect, useState } from 'react'
import { getUser } from '@/services/auth'
import { getStoreByUser } from '@/services/store'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-[#1a1614] outline-none transition-all placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12'

export function EntregadoresManagePanel() {
  const [storeId, setStoreId] = useState<string | null>(null)
  const [entregadores, setEntregadores] = useState<StoreEntregadorDTO[]>([])
  const [entregadoresLoading, setEntregadoresLoading] = useState(false)
  const [entregadoresMissing, setEntregadoresMissing] = useState(false)
  const [entFormNome, setEntFormNome] = useState('')
  const [entFormTel, setEntFormTel] = useState('')
  const [entFormTipo, setEntFormTipo] = useState<EntregadorTipo>('fixo')
  const [entSaving, setEntSaving] = useState(false)
  const [editingEntId, setEditingEntId] = useState<string | null>(null)
  const [editEntNome, setEditEntNome] = useState('')
  const [editEntTel, setEditEntTel] = useState('')
  const [editEntTipo, setEditEntTipo] = useState<EntregadorTipo>('fixo')

  useEffect(() => {
    async function loadStore() {
      const user = await getUser()
      if (!user) return
      const store = await getStoreByUser(user.id)
      if (!store || typeof store !== 'object') return
      const s = store as Record<string, unknown>
      setStoreId(typeof s.id === 'string' ? s.id : null)
    }
    void loadStore()
  }, [])

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setEntregadoresLoading(true)
    void (async () => {
      try {
        const res = await dashboardFetch('/api/store/entregadores')
        const json = (await res.json().catch(() => ({}))) as {
          entregadores?: StoreEntregadorDTO[]
          missingTable?: boolean
        }
        if (cancelled) return
        if (json.missingTable) setEntregadoresMissing(true)
        setEntregadores(Array.isArray(json.entregadores) ? json.entregadores : [])
      } catch {
        if (!cancelled) setEntregadores([])
      } finally {
        if (!cancelled) setEntregadoresLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storeId])

  async function refreshEntregadores() {
    if (!storeId) return
    const res = await dashboardFetch('/api/store/entregadores')
    const json = (await res.json().catch(() => ({}))) as {
      entregadores?: StoreEntregadorDTO[]
      missingTable?: boolean
    }
    if (json.missingTable) setEntregadoresMissing(true)
    setEntregadores(Array.isArray(json.entregadores) ? json.entregadores : [])
  }

  async function addEntregador() {
    if (!storeId) return
    const nome = entFormNome.trim()
    if (!nome) {
      alert('Indica o nome do entregador.')
      return
    }
    setEntSaving(true)
    try {
      const res = await dashboardFetch('/api/store/entregadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          telefone: entFormTel.trim() || null,
          tipo: entFormTipo,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        alert(json.error || 'Não foi possível adicionar.')
        return
      }
      setEntFormNome('')
      setEntFormTel('')
      setEntFormTipo('fixo')
      await refreshEntregadores()
    } finally {
      setEntSaving(false)
    }
  }

  async function patchEntregador(
    id: string,
    patch: Partial<{ nome: string; telefone: string | null; tipo: EntregadorTipo; ativo: boolean }>
  ) {
    const res = await dashboardFetch('/api/store/entregadores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      alert(json.error || 'Não foi possível atualizar.')
      return
    }
    setEditingEntId(null)
    await refreshEntregadores()
  }

  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] sm:p-8">
      <h2 className="text-base font-bold text-[#1a1614]">Cadastro</h2>
      <p className="mt-1 text-sm text-[#6b7280]">
        Lista usada ao confirmar entregas nos pedidos e nos acertos do caixa. Inativos mantêm
        histórico e aparecem no fim da lista.
      </p>
      {entregadoresMissing ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Tabelas de entregadores ainda não criadas. Aplica a migração{' '}
          <code className="rounded bg-amber-100 px-0.5">
            supabase/migrations/20260725190003_entregadores_schema.sql
          </code>{' '}
          no Supabase.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--card-border)] bg-[#fafafa] p-4">
        <label className="min-w-[140px] flex-1 text-xs font-medium text-[#6b7280]">
          Nome <span className="text-red-600">*</span>
          <input
            className={inputClass}
            value={entFormNome}
            onChange={(e) => setEntFormNome(e.target.value)}
            placeholder="Nome completo"
            disabled={!storeId || entregadoresLoading}
          />
        </label>
        <label className="min-w-[120px] flex-1 text-xs font-medium text-[#6b7280]">
          Telefone <span className="font-normal text-[#9ca3af]">(opcional)</span>
          <input
            className={inputClass}
            value={entFormTel}
            onChange={(e) => setEntFormTel(e.target.value)}
            placeholder="Telefone"
            disabled={!storeId || entregadoresLoading}
          />
        </label>
        <div className="shrink-0">
          <p className="text-xs font-medium text-[#6b7280]">Tipo</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setEntFormTipo('fixo')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                entFormTipo === 'fixo'
                  ? 'bg-[var(--dash-primary)] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              Fixo
            </button>
            <button
              type="button"
              onClick={() => setEntFormTipo('autonomo')}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                entFormTipo === 'autonomo'
                  ? 'bg-[var(--dash-primary)] text-white'
                  : 'border border-[var(--card-border)] bg-white text-[#374151]'
              }`}
            >
              Autônomo
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={!storeId || entSaving || entregadoresLoading}
          onClick={() => void addEntregador()}
          className="shrink-0 rounded-xl bg-[var(--dash-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>

      <div className="mt-6 overflow-x-auto">
        {entregadoresLoading ? (
          <p className="text-sm text-[#6b7280]">A carregar…</p>
        ) : entregadores.length === 0 ? (
          <p className="text-sm text-[#6b7280]">Ainda não há entregadores cadastrados.</p>
        ) : (
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Telefone</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {[...entregadores]
                .sort((a, b) => {
                  if (a.ativo !== b.ativo) return a.ativo ? -1 : 1
                  return a.nome.localeCompare(b.nome, 'pt')
                })
                .map((e) => {
                  const rowMuted = !e.ativo
                  return (
                    <tr
                      key={e.id}
                      className={`border-b border-[var(--card-border)]/80 ${rowMuted ? 'opacity-55' : ''}`}
                    >
                      <td className="py-3 pr-3 font-medium text-[#1a1614]">
                        {editingEntId === e.id ? (
                          <input
                            className="w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-sm"
                            value={editEntNome}
                            onChange={(ev) => setEditEntNome(ev.target.value)}
                          />
                        ) : (
                          e.nome
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[#374151]">
                        {editingEntId === e.id ? (
                          <select
                            value={editEntTipo}
                            onChange={(ev) =>
                              setEditEntTipo(ev.target.value === 'autonomo' ? 'autonomo' : 'fixo')
                            }
                            className="rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-xs font-semibold"
                          >
                            <option value="fixo">Fixo</option>
                            <option value="autonomo">Autônomo</option>
                          </select>
                        ) : e.tipo === 'autonomo' ? (
                          'Autônomo'
                        ) : (
                          'Fixo'
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[#374151]">
                        {editingEntId === e.id ? (
                          <input
                            className="w-full rounded-lg border border-[var(--card-border)] px-2 py-1.5 text-sm"
                            value={editEntTel}
                            onChange={(ev) => setEditEntTel(ev.target.value)}
                            placeholder="Telefone"
                          />
                        ) : (
                          e.telefone || '—'
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            e.ativo
                              ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
                              : 'bg-[#f3f4f6] text-[#6b7280] ring-1 ring-[var(--card-border)]'
                          }`}
                        >
                          {e.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3">
                        {editingEntId === e.id ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                              onClick={() => {
                                if (!editEntNome.trim()) {
                                  alert('Nome obrigatório.')
                                  return
                                }
                                void patchEntregador(e.id, {
                                  nome: editEntNome.trim(),
                                  telefone: editEntTel.trim() || null,
                                  tipo: editEntTipo,
                                })
                              }}
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-[#6b7280] hover:underline"
                              onClick={() => setEditingEntId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                              onClick={() => {
                                setEditingEntId(e.id)
                                setEditEntNome(e.nome)
                                setEditEntTel(e.telefone ?? '')
                                setEditEntTipo(e.tipo)
                              }}
                            >
                              Editar
                            </button>
                            {e.ativo ? (
                              <button
                                type="button"
                                className="text-xs font-semibold text-amber-800 hover:underline"
                                onClick={() => {
                                  if (!confirm('Desativar este entregador?')) return
                                  void patchEntregador(e.id, { ativo: false })
                                }}
                              >
                                Desativar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="text-xs font-semibold text-emerald-800 hover:underline"
                                onClick={() => void patchEntregador(e.id, { ativo: true })}
                              >
                                Reativar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
