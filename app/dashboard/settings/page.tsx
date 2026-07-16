'use client'

import { DashboardBusinessHoursCard } from '@/app/dashboard/_components/DashboardBusinessHoursCard'
import { StorePublicQrPanel } from '@/app/dashboard/_components/StorePublicQrPanel'
import { StoreOpenSwitch } from '@/app/dashboard/_components/StoreOpenSwitch'
import { PublicSlugPathPill } from '@/app/_components/PublicSlugPathPill'
import { hasPixCheckout, planTier, parsePlan, type Plan } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { slugifyStoreSlug } from '@/lib/store-slug'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
  type MerchantOperationMode,
} from '@/lib/merchant-operation-mode'
import { hasGarconsManagementAccess } from '@/lib/dashboard-menu'
import {
  createEmptyHubPinConfig,
  HUB_PIN_FIELDS,
  HUB_PIN_STORE_SETTINGS_SHORTCUTS,
  parseHubPinConfig,
  storeSupportsHubPins,
  type HubPinConfig,
  type HubPinShortcut,
} from '@/lib/hub-shortcut-pin'
import { uploadStoreLogo } from '@/lib/storage-upload'
import {
  detectPixKeyKind,
  normalizePixKey,
  parsePixKeyTypeInput,
  PIX_KEY_TYPE_OPTIONS,
  pixKeyKindLabel,
  type PixKeyType,
} from '@/lib/pix/key'
import { MenuImage } from '@/app/_components/MenuImage'
import { resolveMenuImageUrl } from '@/lib/menu-image-url'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getUser, updatePassword } from '@/services/auth'
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

function storeInitials(name: string): string {
  if (!name.trim()) return 'VY'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2)
    return (p[0][0] + p[1][0]).toUpperCase().slice(0, 2)
  return name.trim().slice(0, 2).toUpperCase()
}

function extractCoordsFromGoogleMaps(url: string): { lat: number; lng: number } | null {
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (qMatch) return { lat: Number(qMatch[1]), lng: Number(qMatch[2]) }

  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) }

  return null
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
  const [savedToast, setSavedToast] = useState(false)
  const [copied, setCopied] = useState(false)
  const [storePlan, setStorePlan] = useState<Plan>('START')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [supportsLogoUrl, setSupportsLogoUrl] = useState(true)
  const [supportsLocationFields, setSupportsLocationFields] = useState(true)
  const [logoUploading, setLogoUploading] = useState(false)
  const [locationEnabled, setLocationEnabled] = useState(false)
  const [locationLabel, setLocationLabel] = useState('')
  const [locationMapsUrl, setLocationMapsUrl] = useState('')
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
  const [supportsHubPins, setSupportsHubPins] = useState(true)
  const [hubPins, setHubPins] = useState<HubPinConfig>(() =>
    createEmptyHubPinConfig()
  )
  const [deliveryPipelineEnabled, setDeliveryPipelineEnabled] = useState(true)
  const [operationMode, setOperationMode] = useState<MerchantOperationMode | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [newAccountPassword, setNewAccountPassword] = useState('')
  const [confirmAccountPassword, setConfirmAccountPassword] = useState('')
  const [accountPassBusy, setAccountPassBusy] = useState(false)
  const [showAccountPassword, setShowAccountPassword] = useState(false)
  const [supportsPixFields, setSupportsPixFields] = useState(true)
  const [pixEnabled, setPixEnabled] = useState(false)
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('email')
  const [pixKey, setPixKey] = useState('')
  const [pixReceiverName, setPixReceiverName] = useState('')
  const [pixReceiverCity, setPixReceiverCity] = useState('')

  useEffect(() => {
    async function load() {
      const user = await getUser()
      if (!user) return
      setUserEmail(typeof user.email === 'string' ? user.email : null)

      const store = await getStoreByUser(user.id)
      if (!store || typeof store !== 'object') return

      const s = store as Record<string, unknown>
      const parsedPlan = parsePlan(readStorePlano(s))
      setStoreId(s.id as string)
      setStorePlan(parsedPlan)
      const mode = parseOperationModeFromStore(s)
      setOperationMode(mode)
      setDeliveryPipelineEnabled(isDeliveryPipelineEnabled(mode))
      setSlug((s.slug as string) || '')
      setName((s.name as string) || '')
      setSupportsSubtitle('subtitle' in s)
      setSubtitle((s.subtitle as string) || '')
      setSupportsLogoUrl('logo_url' in s)
      setLogoUrl(
        typeof s.logo_url === 'string' && s.logo_url.trim()
          ? resolveMenuImageUrl(s.logo_url, String(s.id))
          : null
      )
      setPhone((s.phone as string) || '')
      setSupportsPixFields(
        'pix_key' in s ||
          'pix_receiver_name' in s ||
          'pix_receiver_city' in s ||
          'pix_enabled' in s
      )
      const loadedKey = typeof s.pix_key === 'string' ? s.pix_key : ''
      setPixKey(loadedKey)
      setPixReceiverName(
        typeof s.pix_receiver_name === 'string' ? s.pix_receiver_name : ''
      )
      setPixReceiverCity(
        typeof s.pix_receiver_city === 'string' ? s.pix_receiver_city : ''
      )
      const parsedType = parsePixKeyTypeInput(s.pix_key_type)
      setPixKeyType(parsedType ?? detectPixKeyKind(loadedKey) ?? 'email')
      const enabledFlag =
        s.pix_enabled === true ||
        (s.pix_enabled == null && loadedKey.trim().length > 0)
      setPixEnabled(enabledFlag)
      setAddress(typeof s.address === 'string' ? s.address : '')
      setBusinessHours('business_hours' in s ? s.business_hours : null)
      setSupportsHubPins(storeSupportsHubPins(s))
      setHubPins(parseHubPinConfig(s))
      const hasLocationColumns =
        'location_enabled' in s ||
        'location_lat' in s ||
        'location_lng' in s ||
        'location_address' in s ||
        'location_label' in s
      setSupportsLocationFields(hasLocationColumns)
      setLocationEnabled(Boolean(s.location_enabled))
      setLocationLabel(typeof s.location_label === 'string' ? s.location_label : '')
      const lat = typeof s.location_lat === 'number' ? s.location_lat : Number(s.location_lat)
      const lng = typeof s.location_lng === 'number' ? s.location_lng : Number(s.location_lng)
      const latOk = Number.isFinite(lat) ? lat : null
      const lngOk = Number.isFinite(lng) ? lng : null
      setLocationLat(latOk)
      setLocationLng(lngOk)
      const loadedAddress =
        typeof s.location_address === 'string' ? s.location_address.trim() : ''
      if (/^https?:\/\//i.test(loadedAddress)) {
        setLocationMapsUrl(loadedAddress)
      } else if (latOk != null && lngOk != null) {
        setLocationMapsUrl(`https://maps.google.com/?q=${latOk},${lngOk}`)
      } else {
        setLocationMapsUrl('')
      }
    }

    load()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== '#conta-senha') return
    queueMicrotask(() => {
      document
        .getElementById('conta-senha')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const publicUrl =
    typeof window !== 'undefined' && slug
      ? `${window.location.origin}/${slug}`
      : ''
  const slugParaQr = slugifyStoreSlug(slug)
  const qrPublicUrl =
    typeof window !== 'undefined' && slugParaQr
      ? `${window.location.origin}/${slugParaQr}`
      : null
  const qrMesaAutoUrl =
    typeof window !== 'undefined' && slugParaQr
      ? `${window.location.origin}/${slugParaQr}?auto=1`
      : null
  const hasGrowthLocation = planTier(storePlan) >= planTier('GROWTH')
  const pixCheckoutAllowed = hasPixCheckout(storePlan)
  const canManageGarcons = hasGarconsManagementAccess(storePlan, operationMode)
  const showGarcomPinQrSettings =
    operationMode !== 'delivery' && storePlan !== 'START'
  const isGrowthPresencial = storePlan === 'GROWTH' && operationMode === 'presencial'

  async function handleChangeAccountPassword() {
    if (newAccountPassword.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (newAccountPassword !== confirmAccountPassword) {
      alert('As senhas não coincidem.')
      return
    }
    setAccountPassBusy(true)
    try {
      const { error } = await updatePassword(newAccountPassword)
      if (error) {
        alert(error.message)
        return
      }
      setNewAccountPassword('')
      setConfirmAccountPassword('')
      setSavedToast(true)
      window.setTimeout(() => setSavedToast(false), 2400)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao alterar a senha.')
    } finally {
      setAccountPassBusy(false)
    }
  }

  function updateHubPin(
    key: HubPinShortcut,
    patch: Partial<HubPinConfig[HubPinShortcut]>
  ) {
    setHubPins((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch,
      },
    }))
  }

  async function handleSave() {
    if (!storeId) return
    setSaving(true)
    const nextSlug = slugifyStoreSlug(slug)
    if (deliveryPipelineEnabled && !nextSlug) {
      setSaving(false)
      alert('Indica um slug válido para o URL público (letras, números e hífens).')
      return
    }
    const patch: Record<string, unknown> = {
      name: name.trim(),
      ...(deliveryPipelineEnabled && nextSlug ? { slug: nextSlug } : {}),
      phone: phone.trim() || null,
    }
    if (supportsSubtitle) {
      if (subtitle.trim()) patch.subtitle = subtitle.trim()
      else patch.subtitle = null
    }

    patch.address = address.trim() || null

    if (supportsPixFields) {
      const keyTrim = pixKey.trim()
      patch.pix_enabled =
        pixCheckoutAllowed && pixEnabled && keyTrim.length > 0
      if (pixEnabled && keyTrim) {
        const norm = normalizePixKey(keyTrim, pixKeyType)
        if (!norm.ok) {
          setSaving(false)
          alert(norm.error)
          return
        }
        patch.pix_key = norm.value
        patch.pix_key_type = norm.type
        const nameTrim = pixReceiverName.trim()
        const cityTrim = pixReceiverCity.trim()
        patch.pix_receiver_name = nameTrim || null
        patch.pix_receiver_city = cityTrim || null
      } else if (keyTrim) {
        const norm = normalizePixKey(keyTrim, pixKeyType)
        if (norm.ok) {
          patch.pix_key = norm.value
          patch.pix_key_type = norm.type
          patch.pix_receiver_name = pixReceiverName.trim() || null
          patch.pix_receiver_city = pixReceiverCity.trim() || null
        }
        patch.pix_enabled = false
      } else {
        patch.pix_key = null
        patch.pix_key_type = null
        patch.pix_receiver_name = null
        patch.pix_receiver_city = null
        patch.pix_enabled = false
      }
    }

    const canPersistLocation =
      deliveryPipelineEnabled &&
      supportsLocationFields &&
      hasGrowthLocation
    patch.location_enabled = canPersistLocation ? locationEnabled : false
    patch.location_label = canPersistLocation
      ? locationLabel.trim() || 'Nossa localização'
      : null
    patch.location_lat = canPersistLocation ? locationLat : null
    patch.location_lng = canPersistLocation ? locationLng : null
    patch.location_address = null

    if (canPersistLocation) {
      const mapUrl = locationMapsUrl.trim()
      if (mapUrl) {
        const coords = extractCoordsFromGoogleMaps(mapUrl)
        if (coords) {
          patch.location_lat = coords.lat
          patch.location_lng = coords.lng
          patch.location_address = null
        } else {
          patch.location_lat = null
          patch.location_lng = null
          patch.location_address = mapUrl
        }
      }
    }
    if (supportsHubPins) {
      for (const { key, label } of HUB_PIN_STORE_SETTINGS_SHORTCUTS) {
        const pin = hubPins[key].pin.replace(/\D/g, '').slice(0, 4)
        const enabled = hubPins[key].enabled
        if (enabled && pin.length !== 4) {
          setSaving(false)
          alert(`O PIN de ${label} deve ter 4 dígitos para ficar ativo.`)
          return
        }
        const fields = HUB_PIN_FIELDS[key]
        patch[fields.enabled] = enabled && pin.length === 4
        patch[fields.pin] = pin || null
      }
    }

    const attemptedPatch: Record<string, unknown> = { ...patch }
    const droppedFields: string[] = []
    let error: { message: string } | null = null

    let effectiveSlug = deliveryPipelineEnabled ? nextSlug ?? '' : slug
    while (true) {
      const result = await updateStore(storeId, attemptedPatch)
      if (!result.error) {
        if (typeof result.slug === 'string' && result.slug.trim()) {
          effectiveSlug = result.slug.trim()
        }
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
      const canDropLocation =
        (Object.keys(attemptedPatch).some((k) => k.startsWith('location_')) &&
          msg.includes('location_')) ||
        msg.includes('location_enabled') ||
        msg.includes('location_lat') ||
        msg.includes('location_lng') ||
        msg.includes('location_address') ||
        msg.includes('location_label')
      if (canDropLocation) {
        delete attemptedPatch.location_enabled
        delete attemptedPatch.location_lat
        delete attemptedPatch.location_lng
        delete attemptedPatch.location_address
        delete attemptedPatch.location_label
        droppedFields.push('location')
        setSupportsLocationFields(false)
        continue
      }
      const canDropHubPins =
        Object.keys(attemptedPatch).some((k) => k.startsWith('hub_pin_')) &&
        msg.includes('hub_pin_')
      if (canDropHubPins) {
        for (const fields of Object.values(HUB_PIN_FIELDS)) {
          delete attemptedPatch[fields.enabled]
          delete attemptedPatch[fields.pin]
        }
        droppedFields.push('hub_pins')
        setSupportsHubPins(false)
        continue
      }
      const canDropPix =
        Object.keys(attemptedPatch).some((k) => k.startsWith('pix_')) &&
        (msg.includes('pix_key') ||
          msg.includes('pix_key_type') ||
          msg.includes('pix_enabled') ||
          msg.includes('pix_receiver_name') ||
          msg.includes('pix_receiver_city'))
      if (canDropPix) {
        delete attemptedPatch.pix_enabled
        delete attemptedPatch.pix_key_type
        delete attemptedPatch.pix_key
        delete attemptedPatch.pix_receiver_name
        delete attemptedPatch.pix_receiver_city
        droppedFields.push('pix')
        setSupportsPixFields(false)
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
    setSlug(effectiveSlug)
    if (droppedFields.length > 0) {
      alert(
        `Alterações principais guardadas (incluindo WhatsApp e slug).\n\nCampos não salvos por falta de colunas no Supabase: ${droppedFields.join(', ')}.`
      )
      return
    }
    setSavedToast(true)
    window.setTimeout(() => setSavedToast(false), 2400)
    router.refresh()
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
        'A coluna logo_url ainda não existe. Executa scripts/supabase-product-images-storage.sql no Supabase.'
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
          ? 'Executa o script scripts/supabase-product-images-storage.sql no Supabase (coluna logo_url).'
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
          ? 'Executa o script scripts/supabase-product-images-storage.sql no Supabase (coluna logo_url).'
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
                  <MenuImage
                    src={logoUrl}
                    storeId={storeId}
                    alt={name.trim() ? `Logo ${name}` : 'Pré-visualização do logo'}
                    fill
                    className="object-cover"
                    sizes="80px"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center bg-[var(--dash-primary)] text-lg font-bold text-white">
                        {storeInitials(name || 'Loja')}
                      </div>
                    }
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
                    <code className="rounded bg-amber-100 px-1">scripts/supabase-product-images-storage.sql</code>
                    .
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className={`mt-6 grid gap-5 ${
              deliveryPipelineEnabled ? 'sm:grid-cols-2' : 'sm:grid-cols-1'
            }`}
          >
            <label className="block text-sm font-medium text-[#374151]">
              Nome
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da loja"
              />
            </label>
            {deliveryPipelineEnabled ? (
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
                  <PublicSlugPathPill slug={slugifyStoreSlug(slug) || 'slug'} />
                </p>
              </label>
            ) : null}
            <label
              className={`block text-sm font-medium text-[#374151] ${
                deliveryPipelineEnabled ? '' : 'sm:col-span-1'
              }`}
            >
              WhatsApp
              <input
                className={inputClass}
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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

          {deliveryPipelineEnabled ? (
            <label className="mt-5 block text-sm font-medium text-[#374151]">
              Endereço da loja (entregas)
              <input
                className={inputClass}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número, bairro, cidade — usado para calcular o raio de entrega"
              />
              <p className="mt-1 text-xs text-[#6b7280]">
                Necessário quando defines zona de entrega (km) no Dashboard. O raio é medido a
                partir deste endereço.
              </p>
            </label>
          ) : null}

          {deliveryPipelineEnabled ? (
          <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[#f9fafb] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
              Link público
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1" title={publicUrl || undefined}>
                <div className="flex justify-start">
                  {slug ? (
                    <PublicSlugPathPill slug={slugifyStoreSlug(slug)} />
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
            <StorePublicQrPanel
              publicUrl={qrPublicUrl}
              storeSlug={slugParaQr || null}
              compact
              qrCheckoutMode="delivery_pickup"
              hideExplanatoryCopy
            />
          </div>
          ) : null}
        </section>

        {deliveryPipelineEnabled ? (
        <section className="rounded-2xl border border-emerald-200/60 bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
          <h2 className="text-base font-bold text-[#1a1614]">Recebimento PIX</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Cadastra a chave PIX da tua conta. No checkout do cardápio público, o cliente paga
            directamente para ti — a Vyria não intermedia o pagamento. Disponível no{' '}
            <strong>plano Pro</strong>.
          </p>
          {!pixCheckoutAllowed ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              O teu plano actual ({storePlan}) não inclui PIX automático no checkout. Faz upgrade
              para o{' '}
              <Link href="/dashboard/planos" className="font-semibold underline">
                plano Pro
              </Link>{' '}
              para activar QR Code e copia e cola no cardápio público.
            </p>
          ) : null}
          {!supportsPixFields ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Executa <code className="font-mono">scripts/supabase-store-pix.sql</code> no Supabase
              para activar esta secção.
            </p>
          ) : (
            <div
              className={`mt-5 space-y-4 ${pixCheckoutAllowed ? '' : 'pointer-events-none opacity-50'}`}
            >
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#1a1614]">Aceitar PIX</p>
                  <p className="text-xs text-[#6b7280]">
                    Mostra QR Code no checkout. O pagamento cai na tua conta — a Vyria não
                    intermedia.
                  </p>
                </div>
                <StoreOpenSwitch
                  open={pixEnabled && pixCheckoutAllowed}
                  disabled={saving || !pixCheckoutAllowed}
                  onToggle={() => setPixEnabled((v) => !v)}
                />
              </div>
              <label className="block text-sm font-medium text-[#374151]">
                Tipo da chave PIX
                <select
                  className={inputClass}
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                >
                  {PIX_KEY_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-[#374151]">
                Chave PIX
                <input
                  className={inputClass}
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                  autoComplete="off"
                />
                {pixKey.trim() ? (
                  <p className="mt-1 text-xs text-emerald-800">
                    Validação: {pixKeyKindLabel(pixKeyType)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[#6b7280]">
                    Preenche a chave e activa o toggle para gerar QR no checkout.
                  </p>
                )}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-[#374151]">
                  Nome do recebedor{' '}
                  <span className="font-normal text-[#9ca3af]">(opcional)</span>
                  <input
                    className={inputClass}
                    value={pixReceiverName}
                    onChange={(e) => setPixReceiverName(e.target.value)}
                    placeholder={name.trim() || 'Nome na conta PIX'}
                    maxLength={25}
                  />
                </label>
                <label className="block text-sm font-medium text-[#374151]">
                  Cidade{' '}
                  <span className="font-normal text-[#9ca3af]">(opcional)</span>
                  <input
                    className={inputClass}
                    value={pixReceiverCity}
                    onChange={(e) => setPixReceiverCity(e.target.value)}
                    placeholder="Ex.: SAO PAULO"
                    maxLength={15}
                  />
                </label>
              </div>
            </div>
          )}
        </section>
        ) : null}

        {deliveryPipelineEnabled ? (
        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
          <h2 className="text-base font-bold text-[#1a1614]">Localização da loja</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Mostra localização no cardápio público para clientes encontrarem tua loja.
          </p>
          {!hasGrowthLocation ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Disponível a partir do plano Growth.
            </p>
          ) : null}
          {!supportsLocationFields ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              As colunas de localização ainda não existem no banco. Execute a migration de
              localização da tabela <code>stores</code>.
            </p>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[#fafafa] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#1a1614]">Mostrar localização no cardápio</p>
              <p className="text-xs text-[#6b7280]">Ative para exibir mapa/endereço no cardápio público.</p>
            </div>
            <StoreOpenSwitch
              open={locationEnabled}
              disabled={!hasGrowthLocation || !supportsLocationFields || saving}
              onToggle={() => setLocationEnabled((v) => !v)}
            />
          </div>

          <div
            className={`mt-4 space-y-4 transition-opacity ${
              locationEnabled && hasGrowthLocation && supportsLocationFields ? 'opacity-100' : 'opacity-60'
            }`}
          >
            <label className="block text-sm font-medium text-[#374151]">
              Label personalizado <span className="font-normal text-[#9ca3af]">(opcional)</span>
              <input
                className={inputClass}
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Ex: Estamos aqui! Venha nos visitar"
                disabled={!locationEnabled || !hasGrowthLocation || !supportsLocationFields}
              />
            </label>

            <label className="block text-sm font-medium text-[#374151]">
              Link do Google Maps
              <input
                className={inputClass}
                value={locationMapsUrl}
                onChange={(e) => setLocationMapsUrl(e.target.value)}
                placeholder="Cole aqui o link do Google Maps da sua loja"
                disabled={!locationEnabled || !hasGrowthLocation || !supportsLocationFields}
              />
              <p className="mt-2 text-xs text-[#6b7280]">
                Abra o Google Maps, encontre sua loja, clique em Compartilhar e cole o link aqui.
              </p>
            </label>
          </div>
        </section>
        ) : null}

        <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
          <h2 className="text-base font-bold text-[#1a1614]">
            PIN dos atalhos do hub
          </h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            Ative um PIN de 4 números para pedir confirmação antes de abrir cada
            área operacional. O salão usa PIN individual por garçom
            {canManageGarcons ? (
              <>
                {' '}
                — configure em{' '}
                <Link
                  href="/dashboard/garcons?hub=administracao"
                  className="font-semibold text-[var(--dash-primary)] hover:underline"
                >
                  Meus garçons
                </Link>
              </>
            ) : (
              <>
                {' '}
                — disponível a partir do{' '}
                <Link
                  href="/dashboard/upgrade?feature=waiter"
                  className="font-semibold text-[var(--dash-primary)] hover:underline"
                >
                  plano Pro
                </Link>
              </>
            )}
            .
          </p>
          {!supportsHubPins ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              As colunas dos PINs ainda não existem no banco. Execute a migration
              dos PINs dos atalhos do hub.
            </p>
          ) : null}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {HUB_PIN_STORE_SETTINGS_SHORTCUTS.map(({ key, label, description }) => (
              <div
                key={key}
                className="rounded-2xl border border-[var(--card-border)] bg-[#fafafa] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#1a1614]">{label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">
                      {description}
                    </p>
                  </div>
                  <StoreOpenSwitch
                    open={hubPins[key].enabled}
                    disabled={!supportsHubPins || saving}
                    onToggle={() =>
                      updateHubPin(key, { enabled: !hubPins[key].enabled })
                    }
                  />
                </div>
                <label className="mt-4 block text-sm font-medium text-[#374151]">
                  PIN (4 números)
                  <input
                    className={inputClass}
                    value={hubPins[key].pin}
                    onChange={(e) =>
                      updateHubPin(key, {
                        pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                    placeholder="0000"
                    inputMode="numeric"
                    maxLength={4}
                    disabled={!supportsHubPins || saving}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>

        {showGarcomPinQrSettings ? (
          <section className="rounded-2xl border border-[var(--card-border)] bg-white p-6 shadow-sm shadow-black/[0.04] md:p-8">
            <h2 className="text-base font-bold text-[#1a1614]">
              {isGrowthPresencial
                ? 'Autoatendimento (mesa): QR'
                : 'Garçom: QR de autoatendimento (mesa)'}
            </h2>
            <p className="mt-1 text-sm text-[#6b7280]">
              Os <strong>setores de mesa</strong> passam a ser editados em{' '}
              <Link href="/dashboard/garcom" className="font-semibold text-[var(--dash-primary)] underline">
                Garçom
              </Link>
              , em «Configurar mesas».
            </p>
            <div className="mt-5 grid gap-8 lg:grid-cols-1 lg:items-start">
              <div className="min-w-0 lg:max-w-md">
                <StorePublicQrPanel
                  publicUrl={qrMesaAutoUrl}
                  storeSlug={slugParaQr || null}
                  compact
                  qrCheckoutMode="dine_in"
                  showSlugUniquenessNote={false}
                  hideExplanatoryCopy
                />
              </div>
            </div>
          </section>
        ) : null}

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
              Define o horário semanal no calendário abaixo. O cardápio público mostra{' '}
              <strong>Aberto</strong> ou <strong>Fechado</strong> com base nestes períodos (hora de
              Brasília) e no interruptor «Loja aberta» em Funcionamento no painel principal.
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

        <section
          id="conta-senha"
          className="rounded-xl border border-dashed border-[var(--card-border)] bg-[#fafafa]/80 px-4 py-4 md:px-5 md:py-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
              Conta e senha
            </h2>
            <span className="text-xs text-[#6b7280]">
              Sessão:{' '}
              <span className="font-medium text-[#374151]">{userEmail ?? '—'}</span>
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[#9ca3af]">
            Sem sessão ativa?{' '}
            <Link
              href="/login/recuperar"
              className="font-medium text-[var(--dash-primary)] underline-offset-2 hover:underline"
            >
              Recuperar por e-mail
            </Link>
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-x-3">
            <label className="block text-xs font-medium text-[#6b7280]">
              Nova senha
              <input
                className={`${inputClass} mt-1.5 py-2.5 text-sm`}
                type={showAccountPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={newAccountPassword}
                onChange={(e) => setNewAccountPassword(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-[#6b7280]">
              Confirmar
              <input
                className={`${inputClass} mt-1.5 py-2.5 text-sm`}
                type={showAccountPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmAccountPassword}
                onChange={(e) => setConfirmAccountPassword(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[#9ca3af]">
              <input
                type="checkbox"
                checked={showAccountPassword}
                onChange={(e) => setShowAccountPassword(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[var(--card-border)]"
              />
              Mostrar
            </label>
            <button
              type="button"
              disabled={accountPassBusy}
              onClick={() => void handleChangeAccountPassword()}
              className="rounded-lg border border-[var(--card-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] shadow-sm hover:bg-white disabled:opacity-50"
            >
              {accountPassBusy ? 'A guardar…' : 'Alterar senha'}
            </button>
          </div>
        </section>

        {savedToast ? (
          <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-md">
            Configurações salvas com sucesso.
          </div>
        ) : null}
      </div>
    </div>
  )
}
