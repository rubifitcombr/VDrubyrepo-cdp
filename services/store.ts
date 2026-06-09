import { createClient } from '@/lib/supabase/client'
import { slugifyStoreSlug } from '@/lib/store-slug'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'

const STORE_ALLOWED_FIELDS = new Set([
  'name',
  'slug',
  'phone',
  'subtitle',
  'address',
  'logo_url',
  'business_hours',
  'manual_closed',
  'operating_hours_note',
  'delivery_fee',
  'delivery_free_above',
  'delivery_max_km',
  'store_geo_lat',
  'store_geo_lng',
  'theme_preset',
  'storefront_banner_url',
  'auto_whatsapp_confirm',
  'auto_accept_orders',
  'auto_notify_new_order',
  'auto_close_outside_hours',
  'auto_whatsapp_delivery',
  'print_auto_on_confirm',
  'print_include_customer_details',
  'print_delivery_copy',
  'print_paper_mm',
  'print_agent_url',
  'print_agent_token',
  'print_printer_ip',
  'print_printer_port',
  'print_auto_delivery',
  'print_auto_autoatendimento',
  'print_auto_pdv',
  'print_auto_garcom',
  'location_enabled',
  'location_lat',
  'location_lng',
  'location_address',
  'location_label',
  'table_sectors',
  'hub_pin_balcao_enabled',
  'hub_pin_balcao',
  'hub_pin_salao_enabled',
  'hub_pin_salao',
  'hub_pin_cozinha_enabled',
  'hub_pin_cozinha',
  'hub_pin_admin_enabled',
  'hub_pin_admin',
  'salao_attendance_mode',
  'pix_enabled',
  'pix_key_type',
  'pix_key',
  'pix_receiver_name',
  'pix_receiver_city',
])

export async function getStoreByUser(userId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('stores')
    .select('*')
    .eq('owner_id', userId)
    .single()

  return data
}

export async function createStore(
  userId: string,
  name: string,
  opts: { phone?: string; operationMode: MerchantOperationMode }
) {
  void userId
  const phone = opts.phone?.trim() ? opts.phone.trim() : undefined
  try {
    const res = await fetch('/api/stores/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        operation_mode: opts.operationMode,
        ...(phone ? { phone } : {}),
      }),
    })
    const body = (await res.json()) as {
      ok?: boolean
      data?: unknown
      error?: string
    }
    if (!res.ok || !body.ok) {
      return {
        data: null,
        error: { message: body.error || 'Erro ao criar loja.' },
      }
    }
    return { data: body.data ?? null, error: null }
  } catch (e) {
    return {
      data: null,
      error: {
        message: e instanceof Error ? e.message : 'Erro de rede ao criar loja.',
      },
    }
  }
}

export async function updateStore(
  storeId: string,
  patch: Record<string, unknown>
) {
  const sanitizedPatchRaw = Object.fromEntries(
    Object.entries(patch).filter(([key]) => STORE_ALLOWED_FIELDS.has(key))
  )
  if (Object.keys(sanitizedPatchRaw).length === 0) {
    return {
      error: {
        message: 'Nenhum campo permitido para atualização.',
        code: 'NO_ALLOWED_FIELDS',
      },
    }
  }

  const sanitizedPatch: Record<string, unknown> = { ...sanitizedPatchRaw }
  let appliedSlug: string | null = null
  if (typeof sanitizedPatch.slug === 'string') {
    const desiredSlug = slugifyStoreSlug(sanitizedPatch.slug)
    delete sanitizedPatch.slug

    const slugRes = await fetch('/api/stores/slug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, slug: desiredSlug }),
    })
    const slugBody = (await slugRes.json()) as { error?: string; slug?: string }
    if (!slugRes.ok) {
      return {
        error: {
          message: slugBody.error || 'Não foi possível atualizar o slug.',
          code: 'SLUG_UPDATE_FAILED',
        },
      }
    }
    appliedSlug =
      typeof slugBody.slug === 'string' && slugBody.slug.trim()
        ? slugBody.slug.trim()
        : desiredSlug
  }

  if (Object.keys(sanitizedPatch).length === 0) {
    return { error: null, slug: appliedSlug }
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('stores')
    .update(sanitizedPatch)
    .eq('id', storeId)
    .select('id')
    .maybeSingle()

  if (error) return { error }
  if (!data?.id) {
    return {
      error: {
        message:
          'Nenhuma configuração foi atualizada. Verifica políticas RLS da tabela stores e se a loja pertence ao utilizador autenticado (owner_id).',
        code: 'NO_ROWS_UPDATED',
      },
    }
  }
  return { error: null, slug: appliedSlug }
}
