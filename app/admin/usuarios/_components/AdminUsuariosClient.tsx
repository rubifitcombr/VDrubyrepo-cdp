'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { AdminAuthUserDTO } from '@/lib/admin-auth-users-types'

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? dateFmt.format(d) : '—'
}

function statusBadge(status: string | null) {
  if (!status) {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
        Sem loja
      </span>
    )
  }
  const s = status.toLowerCase()
  if (s === 'ativo') {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
        Loja ativa
      </span>
    )
  }
  if (s === 'pendente') {
    return (
      <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200">
        Loja pendente
      </span>
    )
  }
  if (s === 'bloqueado' || s === 'cancelado') {
    return (
      <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700 ring-1 ring-red-200">
        Loja {s}
      </span>
    )
  }
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200">
      {status}
    </span>
  )
}

export function AdminUsuariosClient() {
  const [users, setUsers] = useState<AdminAuthUserDTO[]>([])
  const [total, setTotal] = useState(0)
  const [withStore, setWithStore] = useState(0)
  const [withoutStore, setWithoutStore] = useState(0)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [onlyOrphans, setOnlyOrphans] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      const res = await fetch(`/api/admin/usuarios?${params.toString()}`, {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        users?: AdminAuthUserDTO[]
        total?: number
        withStore?: number
        withoutStore?: number
      }
      if (!res.ok) {
        setError(data.error || 'Não foi possível carregar os utilizadores Auth.')
        setUsers([])
        return
      }
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
      setWithStore(data.withStore ?? 0)
      setWithoutStore(data.withoutStore ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede.')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(search)
  }, [load, search])

  async function createStoreForUser(u: AdminAuthUserDTO) {
    const suggested =
      u.intended_store_name ||
      (u.email ? `Loja de ${u.email.split('@')[0]}` : 'Nova loja')
    const name = window.prompt('Nome da loja a criar/religar:', suggested)
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      setToast('Nome da loja é obrigatório.')
      return
    }

    setBusyId(u.id)
    setToast(null)
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, storeName: trimmed }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        created?: boolean
        relinked?: boolean
      }
      if (!res.ok) {
        setToast(data.error || 'Não foi possível criar a loja.')
        return
      }
      setToast(
        data.relinked
          ? 'Loja fantasma religada ao utilizador.'
          : data.created
            ? 'Loja pendente criada.'
            : 'Utilizador já tinha loja.'
      )
      await load(search)
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erro de rede.')
    } finally {
      setBusyId(null)
    }
  }

  const visible = onlyOrphans ? users.filter((u) => !u.store_id) : users

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1a1614]">Utilizadores Auth</h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Todos os utilizadores do Supabase Auth, com indicação se já têm loja no Vyria.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(search)}
          className="rounded-xl border border-[var(--card-border)] bg-white px-3 py-2 text-sm font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb]"
        >
          Atualizar
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Total Auth</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#1a1614]">{total}</p>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Com loja</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{withStore}</p>
        </div>
        <button
          type="button"
          onClick={() => setOnlyOrphans((v) => !v)}
          className={`rounded-2xl border p-4 text-left shadow-sm transition ${
            onlyOrphans
              ? 'border-amber-300 bg-amber-50'
              : 'border-[var(--card-border)] bg-white hover:bg-[#fafafa]'
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Sem loja</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-800">{withoutStore}</p>
          <p className="mt-1 text-[11px] text-[#6b7280]">
            {onlyOrphans ? 'A mostrar só órfãos — clica para ver todos' : 'Clica para filtrar órfãos'}
          </p>
        </button>
      </section>

      {toast ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {toast}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--card-border)] bg-white p-4 shadow-sm">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(q)
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar email, loja pretendida, loja, slug ou id…"
            className="min-w-[16rem] flex-1 rounded-xl border border-[var(--card-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/15"
          />
          <button
            type="submit"
            className="rounded-xl bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Buscar
          </button>
        </form>
      </section>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-[#6b7280]">A carregar utilizadores Auth…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-sm text-[#6b7280]">Nenhum utilizador encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)] bg-[#fafafa] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Criado</th>
                  <th className="px-4 py-3">Último login</th>
                  <th className="px-4 py-3">Email confirmado</th>
                  <th className="px-4 py-3">Loja</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--card-border)]/80 align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1a1614]">{u.email ?? '—'}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#9ca3af]">{u.id}</p>
                      {u.banned ? (
                        <p className="mt-1 text-xs font-semibold text-red-600">Banido</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[#374151]">{formatDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-[#374151]">{formatDate(u.last_sign_in_at)}</td>
                    <td className="px-4 py-3 text-[#374151]">
                      {u.email_confirmed_at ? 'Sim' : 'Não'}
                    </td>
                    <td className="px-4 py-3">
                      {u.store_id ? (
                        <div>
                          <p className="font-medium text-[#1a1614]">{u.store_name ?? '—'}</p>
                          {u.store_slug ? (
                            <p className="text-xs text-[#6b7280]">/{u.store_slug}</p>
                          ) : null}
                          <Link
                            href="/admin/lojistas"
                            className="mt-1 inline-block text-xs font-semibold text-[var(--dash-primary)] hover:underline"
                          >
                            Ver em Lojistas
                          </Link>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[#9ca3af]">—</span>
                          {u.intended_store_name ? (
                            <p className="mt-1 text-xs text-[#6b7280]">
                              Pretendida: {u.intended_store_name}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(u.store_status)}</td>
                    <td className="px-4 py-3">
                      {!u.store_id ? (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => void createStoreForUser(u)}
                          className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                        >
                          {busyId === u.id ? 'A criar…' : 'Criar loja'}
                        </button>
                      ) : (
                        <span className="text-xs text-[#9ca3af]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
