import { createClient } from '@/lib/supabase/client'

export type WhatsAppAutomationSettings = {
  is_active: boolean
  message_template: string
  delay_seconds: number
}

export async function upsertWhatsAppAutomation(
  storeId: string,
  settings: WhatsAppAutomationSettings
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whatsapp_automations')
    .upsert(
      {
        store_id: storeId,
        is_active: settings.is_active,
        message_template: settings.message_template,
        delay_seconds: settings.delay_seconds,
      },
      { onConflict: 'store_id' }
    )
    .select('id')
    .maybeSingle()

  if (error) return { error }
  if (!data?.id) {
    return {
      error: {
        message:
          'Nenhuma configuração foi salva. Verifica políticas RLS e se a loja pertence ao utilizador autenticado.',
        code: 'NO_ROWS_UPDATED',
      },
    }
  }
  return { error: null }
}
