'use client'

import { DashboardBusinessHoursCard } from '@/app/dashboard/_components/DashboardBusinessHoursCard'
import { PublicSlugPathPill } from '@/app/_components/PublicSlugPathPill'
import { uploadStoreLogo } from '@/lib/storage-upload'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getUser } from '@/services/auth'
import { getStoreByUser, updateStore } from '@/services/store'

const inputClass =
  'mt-2 w-full rounded-xl border border-[var(--card-border)] bg-white px-4 py-3 text-sm text-[#1a1614] outline-none transition-all placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12'

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M4.5 3h15M6.75 3v18M17.25 3v18M4.5 7.5h15M4.5 15h15" />
    </svg>
  )
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function storeInitials(name: string): string {
  if (!name.trim()) return 'VY'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2)
    return (p[0][0] + p[1][0]).toUpperCase().slice(0, 2)
  return name.trim().slice(0, 2).toUpperCase()
}

export default function SettingsPage() {
  const router = useRouter()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [supportsSubtitle, setSupportsSubtitle] = useState(true)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [businessHours, setBusinessHours] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [supportsLogoUrl, setSupportsLogoUrl] = useState(true)
  const [logoUploading, setLogoUploading] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return

      const store = await getStoreByUser(user.id)
      if (!store || typeof store !== 'object') return

      const s = store as Record<string, unknown>
      setStoreId(s.id as string)
      setSlug((s.slug as string) || '')
      setName((s.name as string) || '')
      setSupportsSubtitle('subtitle' in s)
      setSubtitle((s.subtitle as string) || '')
      setSupportsLogoUrl('logo_url' in s)
      setLogoUrl(
        typeof s.logo_url === 'string' && s.logo_url.trim()
          ? s.logo_url.trim()
          : null
      )
      setPhone((s.phone as string) || '')
      setAddress(typeof s.address === 'string' ? s.address : '')
      setBusinessHours('business_hours' in s ? s.business_hours : null)
    }

    load()
  }, [])

  const publicUrl =
    typeof window !== 'undefined' && slug
      ? `${window.location.origin}/${slug}`
      : ''

  async function handleSave() {
    if (!storeId) return
    setSaving(true)
    const nextSlug = slugify(slug)
    if (!nextSlug) {
      setSaving(false)
      alert('Indica um slug válido para o URL público (letras, números e hífens).')
      return
    }
    const patch: Record<string, unknown> = {
      name: name.trim(),
      slug: nextSlug,
      phone: phone.trim() || null,
    }
    if (supportsSubtitle) {
      if (subtitle.trim()) patch.subtitle = subtitle.trim()
      else patch.subtitle = null
    }

    patch.address = address.trim() || null

    const attemptedPatch: Record<string, unknown> = { ...patch }
    const droppedFields: string[] = []
    let error: { message: string } | null = null

    while (true) {
      const result = await updateStore(storeId, attemptedPatch)
      if (!result.error) {
        error = null
        break
      }

      const msg = result.error.message || ''
      const canDropSubtitle = 'subtitle' in attemptedPatch && msg.includes('subtitle')
      const canDropAddress = 'address' in attemptedPatch && msg.includes('address')
      if (canDropSubtitle) {
        delete attemptedPatch.subtitle
        droppedFields.push('subtitle')
        setSupportsSubtitle(false)
        continue
      }
      if (canDropAddress) {
        delete attemptedPatch.address
        droppedFields.push('address')
        continue
      }
      error = result.error
      break
    }

    setSaving(false)
    if (error) {
      if (
        error.message.includes('subtitle') ||
        error.message.includes('address')
      ) {
        alert(
          `${error.message}\n\nExecuta scripts/supabase-store-settings-extra.sql no Supabase (e adiciona subtitle na stores, se necessário) para criar colunas em falta.`
        )
      } else {
        alert(error.message)
      }
      return
    }
    setSlug(nextSlug)
    if (droppedFields.length > 0) {
      alert(
        `Alterações principais guardadas (incluindo WhatsApp e slug).\n\nCampos não salvos por falta de colunas no Supabase: ${droppedFields.join(', ')}.`
      )
      return
    }
    alert('Alterações guardadas')
  }

  function copyLink() {
    if (!publicUrl) return
    void navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function onLogoFile(file: File | null) {
    if (!file || !storeId) return
    if (!supportsLogoUrl) {
      alert(
        'A coluna logo_url ainda não existe. Executa scripts/supabase-store-logo.sql no Supabase.'
      )
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Imagem demasiado grande. Usa até 2 MB.')
      return
    }
    setLogoUploading(true)
    const { publicUrl, error: upErr } = await uploadStoreLogo(storeId, file)
    if (upErr || !publicUrl) {
      setLogoUploading(false)
      alert(
        upErr?.message ||
          'Não foi possível enviar a imagem (bucket product-images e políticas de Storage).'
      )
      return
    }
    const { error: dbErr } = await updateStore(storeId, { logo_url: publicUrl })
    setLogoUploading(false)
    if (dbErr) {
      alert(
        dbErr.message?.includes('logo_url') || dbErr.code === 'PGRST204'
          ? 'Executa o script scripts/supabase-store-logo.sql no Supabase (coluna logo_url).'
          : dbErr.message || 'Não foi possível guardar o logo.'
      )
      return
    }
    setLogoUrl(publicUrl)
    router.refresh()
  }

  async function clearLogo() {
    if (!storeId) return
    if (!supportsLogoUrl) return
    setLogoUploading(true)
    const { error: dbErr } = await updateStore(storeId, { logo_url: null })
    setLogoUploading(false)
    if (dbErr) {
      alert(
        dbErr.message?.includes('logo_url') || dbErr.code === 'PGRST204'
          ? 'Executa o script scripts/supabase-store-logo.sql no Supabase (coluna logo_url).'
          : dbErr.message || 'Não foi possível remover o logo.'
      )
      return
    }
    setLogoUrl(null)
    router.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
      <nav className="text-xs text-[#6b7280]">
        <Link href="/dashboard" className="hover:text-[#1a1614]">
          Início
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-[#1a1614]">Configurações</span>
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">Gerencia o teu estabelecimento.</p>
      </header>

      <div className="mt-8 space-y-6">
        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]">
              <IconBuilding className="h-5 w-5" />
            </span>
            <h2 className="text-base font-bold text-[#1a1614]">
              Dados do estabelecimento
            </h2>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-[#374151]">Logo</p>
            <p className="mt-1 text-xs text-[#6b7280]">
              Aparece no topo do painel e ao lado do nome no teu cardápio público. PNG, JPG ou
              WebP até 2 MB.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[#f9fafb] ring-1 ring-black/5">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt={name.trim() ? `Logo ${name}` : 'Pré-visualização do logo'}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[var(--dash-primary)] text-lg font-bold text-white">
                    {storeInitials(name || 'Loja')}
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--card-border)] bg-white px-3 py-2 text-xs font-semibold text-[#374151] shadow-sm hover:bg-[#f9fafb] disabled:opacity-50">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    disabled={!storeId || logoUploading || !supportsLogoUrl}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      e.target.value = ''
                      void onLogoFile(f)
                    }}
                  />
                  {logoUploading ? 'A enviar…' : 'Carregar imagem'}
                </label>
                {logoUrl ? (
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => void clearLogo()}
                    className="w-fit text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Remover logo
                  </button>
                ) : null}
                {!supportsLogoUrl ? (
                  <p className="text-xs text-amber-700">
                    A coluna <code>logo_url</code> ainda não existe no teu Supabase — executa{' '}
                    <code className="rounded bg-amber-100 px-1">scripts/supabase-store-logo.sql</code>
                    .
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#374151]">
              Nome
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da loja"
              />
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              Slug (URL)
              <input
                className={inputClass}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ex.: burger-house"
              />
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#9ca3af]">
                <span>Caminho público</span>
                <PublicSlugPathPill slug={slugify(slug) || 'slug'} />
              </p>
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              WhatsApp
              <input
                className={inputClass}
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-[#374151]">
              Endereço
              <input
                className={inputClass}
                placeholder="Rua, número — bairro"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
          </div>

          <label className="mt-5 block text-sm font-medium text-[#374151]">
            Subtítulo{' '}
            <span className="font-normal text-[#9ca3af]">(opcional)</span>
            <input
              className={inputClass}
              placeholder="Ex.: Comida caseira com entrega rápida"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              disabled={!supportsSubtitle}
            />
            {!supportsSubtitle ? (
              <p className="mt-1 text-xs text-amber-700">
                A coluna <code>subtitle</code> ainda não existe no teu Supabase.
              </p>
            ) : null}
          </label>

          <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[#f9fafb] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Link público
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1" title={publicUrl || undefined}>
                <div className="flex justify-start">
                  {slug ? (
                    <PublicSlugPathPill slug={slugify(slug)} />
                  ) : (
                    <span className="inline-flex rounded-full bg-[#141414]/40 px-4 py-2 text-[12px] text-white/80">
                      /…
                    </span>
                  )}
                </div>
                {publicUrl ? (
                  <p className="mt-2 truncate font-mono text-[11px] text-[#6b7280]">
                    {publicUrl}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={copyLink}
                disabled={!publicUrl}
                className="shrink-0 rounded-lg border border-[var(--card-border)] bg-white px-4 py-2.5 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50"
              >
                {copied ? 'Copiado' : 'Copiar URL'}
              </button>
            </div>
          </div>
        </section>

        {storeId ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]">
                <IconClock className="h-5 w-5" />
              </span>
              <h2 className="text-base font-bold text-[#1a1614]">
                Horário de funcionamento
              </h2>
            </div>
            <p className="mt-2 text-sm text-[#6b7280]">
              Define dia a dia no calendário abaixo. O resumo curto (ex.: 18h–23h) e a taxa de
              entrega ficam no <span className="font-medium text-[#374151]">Dashboard</span>, em
              Funcionamento.
            </p>
            <div className="mt-4">
              <DashboardBusinessHoursCard
                storeId={storeId}
                initialBusinessHours={businessHours}
              />
            </div>
          </section>
        ) : null}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!storeId || saving}
            className="rounded-xl bg-[var(--dash-primary)] px-8 py-3 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'A guardar…' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
