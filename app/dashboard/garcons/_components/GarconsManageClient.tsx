'use client'

import Link from 'next/link'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import type { StoreGarcomDTO } from '@/lib/garcons-types'
import { useEffect, useMemo, useState } from 'react'

const inputClass =
  'w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm text-[#1a1614] outline-none transition placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)] focus:ring-2 focus:ring-[var(--dash-primary)]/15'

function phoneDigits(raw: string | null): string {
  if (!raw) return ''
  return raw.replace(/\D/g, '')
}

function formatPhoneBr(raw: string | null): string {
  const d = phoneDigits(raw)
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return raw?.trim() || '—'
}

function whatsappHref(telefone: string | null): string | null {
  const d = phoneDigits(telefone)
  if (d.length < 10) return null
  const full = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${full}`
}

type Tab = 'ativos' | 'inativos'

type FormState = {
  nome: string
  email: string
  telefone: string
  pin: string
  pin_ativo: boolean
}

const emptyForm: FormState = {
  nome: '',
  email: '',
  telefone: '',
  pin: '',
  pin_ativo: false,
}

function sortGarcons(list: StoreGarcomDTO[]): StoreGarcomDTO[] {
  return [...list].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function upsertGarcom(list: StoreGarcomDTO[], row: StoreGarcomDTO): StoreGarcomDTO[] {
  const idx = list.findIndex((g) => g.id === row.id)
  if (idx === -1) return sortGarcons([...list, row])
  const next = [...list]
  next[idx] = row
  return sortGarcons(next)
}

export function GarconsManageClient({
  initialGarcons,
  initialMissingTable,
}: {
  initialGarcons: StoreGarcomDTO[]
  initialMissingTable: boolean
}) {
  const [garcons, setGarcons] = useState(initialGarcons)
  const [missingTable, setMissingTable] = useState(initialMissingTable)
  const [tab, setTab] = useState<Tab>('ativos')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [shareCopied, setShareCopied] = useState(false)

  const salaoAppUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/dashboard/garcom`
      : '/dashboard/garcom'

  useEffect(() => {
    setGarcons(initialGarcons)
    setMissingTable(initialMissingTable)
  }, [initialGarcons, initialMissingTable])

  const counts = useMemo(() => {
    const ativos = garcons.filter((g) => g.ativo).length
    return { ativos, inativos: garcons.length - ativos }
  }, [garcons])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return garcons
      .filter((g) => (tab === 'ativos' ? g.ativo : !g.ativo))
      .filter((g) => {
        if (!q) return true
        return (
          g.nome.toLowerCase().includes(q) ||
          (g.email?.toLowerCase().includes(q) ?? false) ||
          phoneDigits(g.telefone).includes(q.replace(/\D/g, '')) ||
          (g.telefone?.toLowerCase().includes(q) ?? false)
        )
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [garcons, tab, search])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(g: StoreGarcomDTO) {
    setEditingId(g.id)
    setForm({
      nome: g.nome,
      email: g.email ?? '',
      telefone: g.telefone ?? '',
      pin: g.pin ?? '',
      pin_ativo: g.pin_ativo,
    })
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const nome = form.nome.trim()
    if (!nome) {
      setFormError('Indica o nome do garçom.')
      return
    }
    const emailRaw = form.email.trim()
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      setFormError('E-mail inválido.')
      return
    }
    const pin = form.pin.replace(/\D/g, '').slice(0, 4)
    if (form.pin_ativo && pin.length !== 4) {
      setFormError('O PIN do garçom deve ter 4 números quando estiver ativo.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nome,
        email: emailRaw || null,
        telefone: form.telefone.trim() || null,
        pin: form.pin_ativo ? pin : null,
        pin_ativo: form.pin_ativo && pin.length === 4,
      }
      const res = await dashboardFetch('/api/store/garcons', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        missingTable?: boolean
        garcom?: StoreGarcomDTO
      }
      if (!res.ok) {
        if (json.missingTable) setMissingTable(true)
        setFormError(json.error || 'Não foi possível guardar.')
        return
      }
      if (json.garcom) {
        setGarcons((prev) => upsertGarcom(prev, json.garcom!))
      }
      closeModal()
    } catch {
      setFormError('Erro de rede. Tenta novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(g: StoreGarcomDTO) {
    const prevAtivo = g.ativo
    const nextAtivo = !prevAtivo
    setGarcons((list) =>
      list.map((row) => (row.id === g.id ? { ...row, ativo: nextAtivo } : row))
    )

    const res = await dashboardFetch('/api/store/garcons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id, ativo: nextAtivo }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      error?: string
      garcom?: StoreGarcomDTO
    }
    if (!res.ok) {
      setGarcons((list) =>
        list.map((row) => (row.id === g.id ? { ...row, ativo: prevAtivo } : row))
      )
      alert(json.error || 'Não foi possível atualizar o status.')
      return
    }
    if (json.garcom) {
      setGarcons((list) => upsertGarcom(list, json.garcom!))
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(salaoAppUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      alert('Não foi possível copiar o link.')
    }
  }

  async function shareWhatsApp() {
    const text = encodeURIComponent(
      `Acede ao painel de garçom da loja: ${salaoAppUrl}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-5">
      <nav className="text-sm text-[#6b7280]">
        <Link href="/dashboard/visao?hub=administracao" className="hover:text-[var(--dash-primary)]">
          Início
        </Link>
        <span className="mx-1.5">›</span>
        <span className="font-medium text-[#374151]">Administração</span>
        <span className="mx-1.5">›</span>
        <span className="font-medium text-[#374151]">Meus garçons</span>
      </nav>

      <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1e40af]">Compartilhe o App</p>
            <p className="mt-0.5 text-sm text-[#3b82f6]">
              Copie o link do painel de garçom para compartilhar com sua equipe.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void copyShareLink()}
              className="inline-flex items-center gap-2 rounded-lg border border-[#93c5fd] bg-white px-4 py-2 text-sm font-semibold text-[#2563eb] transition hover:bg-[#dbeafe]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {shareCopied ? 'Copiado!' : 'Copiar'}
            </button>
            <button
              type="button"
              onClick={() => void shareWhatsApp()}
              className="inline-flex items-center gap-2 rounded-lg border border-[#86efac] bg-white px-4 py-2 text-sm font-semibold text-[#16a34a] transition hover:bg-[#dcfce7]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.202 1.616 6.032L0 24l6.168-1.616A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.77 9.77 0 01-4.96-1.354l-.355-.21-3.654.96.975-3.563-.231-.366A9.818 9.818 0 1112 21.818z" />
              </svg>
              Compartilhar
            </button>
          </div>
        </div>
      </div>

      {missingTable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A tabela de garçons ainda não existe no banco. Aplica a migração{' '}
          <code className="rounded bg-amber-100 px-1">
            supabase/migrations/20260725190004_garcons_schema.sql
          </code>{' '}
          no Supabase.
        </div>
      ) : null}

      <div className="rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#e5e7eb] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => setTab('ativos')}
              className={`border-b-2 pb-2 text-sm font-semibold transition ${
                tab === 'ativos'
                  ? 'border-[var(--dash-primary)] text-[var(--dash-primary)]'
                  : 'border-transparent text-[#6b7280] hover:text-[#374151]'
              }`}
            >
              Ativos{' '}
              <span className="ml-1 rounded-full bg-[#eff6ff] px-2 py-0.5 text-xs font-bold text-[var(--dash-primary)]">
                {counts.ativos}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('inativos')}
              className={`border-b-2 pb-2 text-sm font-semibold transition ${
                tab === 'inativos'
                  ? 'border-[var(--dash-primary)] text-[var(--dash-primary)]'
                  : 'border-transparent text-[#6b7280] hover:text-[#374151]'
              }`}
            >
              Inativos{' '}
              <span className="ml-1 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs font-bold text-[#6b7280]">
                {counts.inativos}
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Busque por nome, e-mail ou telefone"
                className={`${inputClass} pl-9`}
              />
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              <span className="text-lg leading-none">+</span> Garçom
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f9fafb] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                <th className="px-4 py-3 sm:px-5">Status</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Número WhatsApp</th>
                <th className="px-4 py-3 text-right sm:px-5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[#6b7280]">
                    {search.trim()
                      ? 'Nenhum garçom encontrado para esta busca.'
                      : tab === 'ativos'
                        ? 'Nenhum garçom ativo. Clique em «+ Garçom» para adicionar.'
                        : 'Nenhum garçom inativo.'}
                  </td>
                </tr>
              ) : (
                filtered.map((g) => {
                  const wa = whatsappHref(g.telefone)
                  return (
                    <tr
                      key={g.id}
                      className="border-b border-[#f3f4f6] transition hover:bg-[#fafafa]"
                    >
                      <td className="px-4 py-3.5 sm:px-5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={g.ativo}
                          onClick={() => void toggleAtivo(g)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${
                            g.ativo ? 'bg-[var(--dash-primary)]' : 'bg-[#d1d5db]'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${
                              g.ativo ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3.5 font-medium capitalize text-[#1a1614]">
                        {g.nome}
                      </td>
                      <td className="px-4 py-3.5 text-[#374151]">{g.email ?? '—'}</td>
                      <td className="px-4 py-3.5 text-[#374151]">
                        {formatPhoneBr(g.telefone)}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(g)}
                            title="Editar"
                            className="rounded-lg p-2 text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[var(--dash-primary)]"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="WhatsApp"
                              className="rounded-lg p-2 text-[#16a34a] transition hover:bg-[#dcfce7]"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                              </svg>
                            </a>
                          ) : (
                            <span className="inline-block w-8" />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="garcom-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="garcom-modal-title" className="text-lg font-bold text-[#1a1614]">
              {editingId ? 'Editar garçom' : 'Novo garçom'}
            </h2>
            <form noValidate onSubmit={(e) => void submitForm(e)} className="mt-5 space-y-4">
              {formError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formError}
                </p>
              ) : null}
              <div>
                <label className="text-sm font-medium text-[#374151]">Nome *</label>
                <input
                  className={`${inputClass} mt-1.5`}
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151]">E-mail</label>
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  className={`${inputClass} mt-1.5`}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="opcional"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151]">WhatsApp</label>
                <input
                  type="tel"
                  className={`${inputClass} mt-1.5`}
                  value={form.telefone}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  placeholder="(11) 9 9999-9999"
                />
              </div>
              <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#374151]">PIN do salão</p>
                    <p className="mt-0.5 text-xs text-[#6b7280]">
                      Protege o acesso ao salão e filtra movimentações deste garçom.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.pin_ativo}
                    onClick={() =>
                      setForm((f) => ({ ...f, pin_ativo: !f.pin_ativo }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
                      form.pin_ativo ? 'bg-[var(--dash-primary)]' : 'bg-[#d1d5db]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${
                        form.pin_ativo ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <label className="mt-3 block text-sm font-medium text-[#374151]">
                  PIN (4 números)
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className={`${inputClass} mt-1.5`}
                    value={form.pin}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                      }))
                    }
                    placeholder="0000"
                    disabled={!form.pin_ativo}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[#6b7280] hover:bg-[#f3f4f6]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'A guardar…' : editingId ? 'Guardar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
