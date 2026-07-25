'use client'

import { MenuImage } from '@/app/_components/MenuImage'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PublicSlugPathPill } from '@/app/_components/PublicSlugPathPill'
import { slugifyStoreSlug } from '@/lib/store-slug'
import { updateStore } from '@/services/store'
import { uploadStorefrontBanner } from '@/lib/storage-upload'
import {
  STORE_THEMES,
  type StoreThemeId,
  resolveStoreTheme,
} from '@/lib/store-theme'

export function AppearanceThemeClient({
  storeId,
  storeName,
  initialPreset,
  initialBannerUrl,
  initialSlug,
  hidePublicSlugFields = false,
}: {
  storeId: string
  storeName: string
  initialPreset: string | null | undefined
  initialBannerUrl?: string | null
  initialSlug: string
  /** Modo só presencial: sem editar slug nem link público de checkout. */
  hidePublicSlugFields?: boolean
}) {
  const router = useRouter()
  const initial = resolveStoreTheme(initialPreset).id

  const [selected, setSelected] = useState<StoreThemeId>(initial)
  const [slug, setSlug] = useState(initialSlug)
  const [bannerCommitted, setBannerCommitted] = useState<string | null>(
    initialBannerUrl ?? null
  )
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [bannerMarkedRemove, setBannerMarkedRemove] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewBlobUrl = useMemo(() => {
    if (!pendingFile) return null
    return URL.createObjectURL(pendingFile)
  }, [pendingFile])

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    }
  }, [previewBlobUrl])

  const displayBannerUrl = bannerMarkedRemove
    ? null
    : previewBlobUrl ?? bannerCommitted

  const preview =
    STORE_THEMES.find((t) => t.id === selected) ?? STORE_THEMES[7]

  const publicUrl =
    typeof window !== 'undefined' && slugifyStoreSlug(slug)
      ? `${window.location.origin}/${slugifyStoreSlug(slug)}`
      : ''

  async function handleSave() {
    const nextSlug = slugifyStoreSlug(slug)
    if (!hidePublicSlugFields) {
      if (!nextSlug) {
        setError('Indica um slug válido para o URL público (letras, números e hífens).')
        return
      }
    }

    setError(null)
    setSaving(true)

    let nextBanner: string | null
    if (bannerMarkedRemove && !pendingFile) {
      nextBanner = null
    } else if (pendingFile) {
      const { publicUrl: uploaded, error: upErr } =
        await uploadStorefrontBanner(storeId, pendingFile)
      if (upErr || !uploaded) {
        setSaving(false)
        setError(
          upErr?.message ||
            'Não foi possível enviar a imagem (bucket product-images e políticas de Storage).'
        )
        return
      }
      nextBanner = uploaded
    } else {
      nextBanner = bannerCommitted
    }

    const patch: Record<string, unknown> = {
      ...(hidePublicSlugFields ? {} : { slug: nextSlug }),
      theme_preset: selected,
      storefront_banner_url: nextBanner,
    }

    const { error: dbErr, slug: appliedSlug } = await updateStore(storeId, patch)
    setSaving(false)

    if (dbErr) {
      const msg = dbErr.message || ''
      if (msg.includes('theme_preset') || dbErr.code === 'PGRST204') {
        setError(
          'Coluna theme_preset em falta na base de dados. Contacta o suporte Vyria.'
        )
        return
      }
      if (
        msg.includes('storefront_banner_url') ||
        msg.includes('banner') ||
        dbErr.code === 'PGRST204'
      ) {
        setError(
          'Configuração de banner em falta na base de dados. Contacta o suporte Vyria.'
        )
        return
      }
      if (msg.includes('slug') || msg.includes('unique') || msg.includes('duplicate')) {
        setError(
          'Este slug já está em uso ou é inválido. Escolhe outro.'
        )
        return
      }
      setError(msg || 'Não foi possível guardar.')
      return
    }

    setBannerCommitted(nextBanner)
    setPendingFile(null)
    setBannerMarkedRemove(false)
    const resolvedSlug =
      typeof appliedSlug === 'string' && appliedSlug.trim()
        ? appliedSlug.trim()
        : hidePublicSlugFields
          ? slug
          : nextSlug ?? ''
    setSlug(resolvedSlug)
    router.refresh()
  }

  function onBannerFile(file: File | null) {
    if (!file) return
    setError(null)
    setBannerMarkedRemove(false)
    setPendingFile(file)
  }

  function clearBanner() {
    setError(null)
    setPendingFile(null)
    setBannerMarkedRemove(true)
  }

  return (
    <div className="mx-auto w-full max-w-6xl xl:max-w-7xl">
      <div>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Aparência
        </h1>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          {hidePublicSlugFields
            ? 'Personaliza o tema e o banner usados no painel e nos fluxos em loja.'
            : 'Personaliza o tema e o banner do cardápio. Guarda as alterações para atualizar o link público (slug).'}
        </p>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {hidePublicSlugFields ? null : (
        <div className="mt-10 rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm">
          <h2 className="font-brand text-lg font-bold text-vyria-navy">
            Link público (slug)
          </h2>
          <p className="mt-1 text-sm text-vyria-navy-muted">
            O endereço do teu cardápio. É guardado quando clicas em «Guardar
            alterações».
          </p>
          <label className="mt-4 block text-sm font-medium text-vyria-navy">
            Slug do URL
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-2 w-full max-w-md rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3 text-sm text-vyria-navy outline-none transition-colors focus:border-[var(--dash-primary)]/40 focus:ring-2 focus:ring-[var(--dash-primary)]/12"
              placeholder="minha-loja"
              autoComplete="off"
            />
          </label>
          {slugifyStoreSlug(slug) ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <PublicSlugPathPill slug={slugifyStoreSlug(slug)} />
              {publicUrl ? (
                <span className="text-xs text-vyria-navy-muted">{publicUrl}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div
        className={`rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm ${
          hidePublicSlugFields ? 'mt-10' : 'mt-8'
        }`}
      >
        <h2 className="font-brand text-lg font-bold text-vyria-navy">
          Banner do cardápio público
        </h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Imagem de capa no topo do cardápio. Só é enviada ao servidor ao
          guardares.
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative aspect-[21/9] w-full max-w-md overflow-hidden rounded-xl bg-[#f3f4f6] ring-1 ring-vyria-navy/10">
            {displayBannerUrl ? (
              <MenuImage
                src={displayBannerUrl}
                storeId={storeId}
                alt="Pré-visualização do banner"
                fill
                className="object-cover"
                sizes="(max-width: 448px) 100vw, 448px"
                unoptimized={displayBannerUrl.startsWith('blob:')}
              />
            ) : (
              <div
                className="flex h-full min-h-[120px] items-center justify-center text-sm text-vyria-navy-muted"
                style={{
                  background: `linear-gradient(135deg, ${preview.primary} 0%, ${preview.secondary} 100%)`,
                }}
              >
                Sem banner — gradiente do tema
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <label className="inline-flex cursor-pointer flex-col items-start gap-2">
              <span className="rounded-xl border border-[var(--card-border)] bg-[#f9f9f9] px-4 py-3 text-sm font-medium text-vyria-navy transition-colors hover:border-[var(--dash-primary)]/35">
                Carregar imagem
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={saving}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  onBannerFile(f)
                }}
              />
            </label>
            {displayBannerUrl || bannerCommitted || pendingFile ? (
              <button
                type="button"
                disabled={saving}
                onClick={clearBanner}
                className="text-left text-sm font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Remover banner
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STORE_THEMES.map((t) => {
          const isSel = selected === t.id
          return (
            <button
              key={t.id}
              type="button"
              disabled={saving}
              onClick={() => setSelected(t.id)}
              className={`group flex flex-col items-center rounded-2xl border bg-white p-5 text-center shadow-sm transition-all hover:border-[var(--dash-primary)]/35 hover:shadow-md disabled:opacity-60 ${
                isSel
                  ? 'border-[var(--dash-primary)] ring-2 ring-[var(--dash-primary)]/25'
                  : 'border-[var(--card-border)]'
              }`}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm"
                style={{
                  background: `linear-gradient(135deg, ${t.primary} 0%, ${t.secondary} 100%)`,
                }}
                aria-hidden
              >
                {t.label.charAt(0)}
              </span>
              <span className="mt-3 font-semibold text-vyria-navy">{t.label}</span>
              <div className="mt-3 flex gap-2">
                <span
                  className="h-5 w-5 rounded-full ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: t.primary }}
                  aria-hidden
                />
                <span
                  className="h-5 w-5 rounded-full ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: t.secondary }}
                  aria-hidden
                />
              </div>
              {isSel ? (
                <span className="mt-3 text-xs font-bold text-[var(--dash-primary)]">
                  Selecionado
                </span>
              ) : (
                <span className="mt-3 text-xs text-transparent">—</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--card-border)] pt-8">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-xl bg-[var(--dash-primary)] px-8 py-3 text-sm font-semibold text-white shadow-md shadow-[var(--dash-primary)]/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'A guardar…' : 'Guardar alterações'}
        </button>
      </div>

      <div className="mt-12">
        <h2 className="font-brand text-lg font-bold text-vyria-navy">
          Pré-visualização
        </h2>
        <p className="mt-1 text-sm text-vyria-navy-muted">
          Assim o teu cliente vê o topo do cardápio e os preços.
        </p>

        <div className="mt-6 flex justify-center">
          <div className="w-full max-w-[280px] rounded-[2rem] border-[10px] border-[#1f2937] bg-[#1f2937] p-1 shadow-2xl">
            <div className="overflow-hidden rounded-[1.35rem] bg-white px-3 pb-4 pt-3">
              <div
                className="flex h-20 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-inner"
                style={{
                  background: `linear-gradient(135deg, ${preview.primary} 0%, ${preview.secondary} 100%)`,
                }}
                aria-hidden
              >
                {preview.label.charAt(0)}
              </div>
              <p className="mt-4 px-1 text-center font-bold text-vyria-navy">
                {storeName || 'Meu estabelecimento'}
              </p>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="mt-2 flex items-center justify-between rounded-xl bg-[#f3f4f6] px-3 py-2.5 text-sm"
                >
                  <span className="text-vyria-navy">Produto {i}</span>
                  <span
                    className="font-bold tabular-nums"
                    style={{ color: preview.primary }}
                  >
                    R$ 29,90
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
