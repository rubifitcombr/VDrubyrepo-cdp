import 'server-only'

import { listWhatsAppPhoneNumbersForWaba } from '@/lib/whatsapp/graph-api.server'

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

export type CoexistenceSyncResult = {
  contacts_sync_requested: boolean
  history_sync_requested: boolean
  errors: string[]
}

/** Resolve o phone_number_id quando o Embedded Signup de coexistência só devolve waba_id. */
export async function resolveCoexistencePhoneNumberId(
  wabaId: string,
  accessToken: string
): Promise<
  | { ok: true; phoneNumberId: string; displayPhoneE164: string | null }
  | { ok: false; error: string }
> {
  const listed = await listWhatsAppPhoneNumbersForWaba(wabaId, accessToken)
  if (!listed.ok) {
    return { ok: false, error: listed.error }
  }

  if (listed.data.length === 0) {
    return {
      ok: false,
      error:
        'Nenhum número encontrado na conta WhatsApp. Confirme a ligação no celular e tente novamente.',
    }
  }

  if (listed.data.length > 1) {
    return {
      ok: false,
      error:
        'Esta conta tem mais de um número. Contacte o suporte Vyria para configurar.',
    }
  }

  const phone = listed.data[0]
  return {
    ok: true,
    phoneNumberId: phone.id,
    displayPhoneE164: phone.display_phone_number?.replace(/\D/g, '') || null,
  }
}

/**
 * Inicia sincronização de contactos e histórico (obrigatório em 24h após onboarding coexistência).
 * @see https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/
 */
export async function initiateCoexistenceDataSync(
  phoneNumberId: string,
  accessToken: string
): Promise<CoexistenceSyncResult> {
  const errors: string[] = []
  let contactsSyncRequested = false
  let historySyncRequested = false

  const url = `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/smb_app_data`
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const contactsRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      sync_type: 'smb_app_state_sync',
    }),
    cache: 'no-store',
  })
  const contactsJson = (await contactsRes.json().catch(() => ({}))) as Record<string, unknown>
  if (contactsRes.ok) {
    contactsSyncRequested = true
  } else {
    const err =
      (contactsJson.error as { message?: string } | undefined)?.message ||
      `smb_app_state_sync HTTP ${contactsRes.status}`
    errors.push(err)
  }

  const historyRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      sync_type: 'history',
    }),
    cache: 'no-store',
  })
  const historyJson = (await historyRes.json().catch(() => ({}))) as Record<string, unknown>
  if (historyRes.ok) {
    historySyncRequested = true
  } else {
    const err =
      (historyJson.error as { message?: string } | undefined)?.message ||
      `history HTTP ${historyRes.status}`
    errors.push(err)
  }

  return {
    contacts_sync_requested: contactsSyncRequested,
    history_sync_requested: historySyncRequested,
    errors,
  }
}
