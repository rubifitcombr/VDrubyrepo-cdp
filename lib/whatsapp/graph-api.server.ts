import 'server-only'

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

export type GraphPhoneNumberInfo = {
  id: string
  display_phone_number?: string
  verified_name?: string
}

export async function fetchWhatsAppPhoneNumber(
  phoneNumberId: string,
  accessToken: string
): Promise<{ ok: true; data: GraphPhoneNumberInfo } | { ok: false; error: string }> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err =
      (json.error as { message?: string } | undefined)?.message ||
      `Meta API HTTP ${res.status}`
    return { ok: false, error: err }
  }
  return {
    ok: true,
    data: {
      id: String(json.id || phoneNumberId),
      display_phone_number:
        typeof json.display_phone_number === 'string'
          ? json.display_phone_number
          : undefined,
      verified_name:
        typeof json.verified_name === 'string' ? json.verified_name : undefined,
    },
  }
}

export async function sendWhatsAppTextMessage(input: {
  phoneNumberId: string
  accessToken: string
  toE164: string
  body: string
}): Promise<
  | { ok: true; messageId: string }
  | { ok: false; error: string }
> {
  const to = input.toE164.replace(/\D/g, '')
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: input.body },
    }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err =
      (json.error as { message?: string } | undefined)?.message ||
      `Meta API HTTP ${res.status}`
    return { ok: false, error: err }
  }
  const messages = json.messages as Array<{ id?: string }> | undefined
  const messageId = messages?.[0]?.id
  if (!messageId) {
    return { ok: false, error: 'Resposta da Meta sem message id.' }
  }
  return { ok: true, messageId }
}
