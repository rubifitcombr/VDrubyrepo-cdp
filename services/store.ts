import { createClient } from '@/lib/supabase/client'

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
  'location_enabled',
  'location_lat',
  'location_lng',
  'location_address',
  'location_label',
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
  phone?: string
) {
  const slug = name.toLowerCase().replace(/\s+/g, '-')

  const supabase = createClient()
  const { data, error } = await supabase
    .from('stores')
    .insert({
      name,
      slug,
      owner_id: userId,
      status: 'pendente',
      plano: 'start',
      ...(phone ? { phone } : {}),
    })
    .select()
    .single()

  return { data, error }
}

export async function updateStore(
  storeId: string,
  patch: Record<string, unknown>
) {
  const sanitizedPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => STORE_ALLOWED_FIELDS.has(key))
  )
  if (Object.keys(sanitizedPatch).length === 0) {
    return {
      error: {
        message: 'Nenhum campo permitido para atualização.',
        code: 'NO_ALLOWED_FIELDS',
      },
    }
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
  return { error: null }
}
