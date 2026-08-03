import 'server-only'

import type { WhatsAppListRow } from '@/lib/whatsapp/interactive-menu'
import {
  parseGraphApiSendError,
  type GraphWhatsAppSendResult,
} from '@/lib/whatsapp/graph-send-result'
import { phonesMatchE164 } from '@/lib/whatsapp/meta-id.utils'

export type { GraphWhatsAppSendResult } from '@/lib/whatsapp/graph-send-result'

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

export type GraphPhoneNumberInfo = {
  id: string
  display_phone_number?: string
  verified_name?: string
}

function parseGraphPhoneRow(json: Record<string, unknown>): GraphPhoneNumberInfo {
  return {
    id: String(json.id || ''),
    display_phone_number:
      typeof json.display_phone_number === 'string'
        ? json.display_phone_number
        : undefined,
    verified_name:
      typeof json.verified_name === 'string' ? json.verified_name : undefined,
  }
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
    data: parseGraphPhoneRow(json),
  }
}

export async function listWhatsAppPhoneNumbersForWaba(
  wabaId: string,
  accessToken: string
): Promise<
  | { ok: true; data: GraphPhoneNumberInfo[] }
  | { ok: false; error: string }
> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=50`
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

  const rows = (json.data as Record<string, unknown>[] | undefined) ?? []
  const data = rows
    .map((row) => parseGraphPhoneRow(row))
    .filter((row) => row.id)

  return { ok: true, data }
}

export async function resolvePhoneNumberIdFromWaba(
  wabaId: string,
  accessToken: string,
  phoneE164: string
): Promise<
  | { ok: true; phoneNumberId: string; data: GraphPhoneNumberInfo }
  | { ok: false; error: string }
> {
  const listed = await listWhatsAppPhoneNumbersForWaba(wabaId, accessToken)
  if (!listed.ok) {
    return { ok: false, error: listed.error }
  }

  const match = listed.data.find((row) =>
    phonesMatchE164(phoneE164, row.display_phone_number || '')
  )

  if (!match) {
    return {
      ok: false,
      error:
        'Nenhum número desse WABA corresponde ao telefone informado. Verifique o WABA ID e o token.',
    }
  }

  return { ok: true, phoneNumberId: match.id, data: match }
}

export async function sendWhatsAppTextMessage(input: {
  phoneNumberId: string
  accessToken: string
  toE164: string
  body: string
}): Promise<GraphWhatsAppSendResult> {
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
    return parseGraphApiSendError(json, res.status)
  }
  const messages = json.messages as Array<{ id?: string }> | undefined
  const messageId = messages?.[0]?.id
  if (!messageId) {
    return { ok: false, error: 'Resposta da Meta sem message id.', isWindowExpired: false }
  }
  return { ok: true, messageId }
}

export async function sendWhatsAppImageMessage(input: {
  phoneNumberId: string
  accessToken: string
  toE164: string
  imageUrl: string
  caption?: string
}): Promise<GraphWhatsAppSendResult> {
  const to = input.toE164.replace(/\D/g, '')
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`
  const image: Record<string, string> = { link: input.imageUrl.trim() }
  const caption = input.caption?.trim()
  if (caption) image.caption = caption.slice(0, 1024)

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
      type: 'image',
      image,
    }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return parseGraphApiSendError(json, res.status)
  }
  const messages = json.messages as Array<{ id?: string }> | undefined
  const messageId = messages?.[0]?.id
  if (!messageId) {
    return { ok: false, error: 'Resposta da Meta sem message id.', isWindowExpired: false }
  }
  return { ok: true, messageId }
}

export async function sendWhatsAppTemplateMessage(input: {
  phoneNumberId: string
  accessToken: string
  toE164: string
  templateName: string
  language: string
  bodyParams: string[]
}): Promise<GraphWhatsAppSendResult> {
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
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.language },
        components: [
          {
            type: 'body',
            parameters: input.bodyParams.map((text) => ({
              type: 'text',
              text: text.slice(0, 32768),
            })),
          },
        ],
      },
    }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return parseGraphApiSendError(json, res.status)
  }
  const messages = json.messages as Array<{ id?: string }> | undefined
  const messageId = messages?.[0]?.id
  if (!messageId) {
    return { ok: false, error: 'Resposta da Meta sem message id.', isWindowExpired: false }
  }
  return { ok: true, messageId }
}

export async function createWhatsAppMessageTemplate(input: {
  wabaId: string
  accessToken: string
  name: string
  language: string
  category: 'UTILITY' | 'MARKETING'
  bodyText: string
  bodyExample: string[]
}): Promise<
  | { ok: true; templateId: string }
  | { ok: false; error: string; errorCode?: number; alreadyExists: boolean }
> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.wabaId)}/message_templates`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      language: input.language,
      category: input.category,
      components: [
        {
          type: 'BODY',
          text: input.bodyText,
          example: {
            body_text: [input.bodyExample],
          },
        },
      ],
    }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const errObj = json.error as { message?: string; code?: number | string } | undefined
    const message =
      (typeof errObj?.message === 'string' && errObj.message.trim()) ||
      `Meta API HTTP ${res.status}`
    let errorCode: number | undefined
    if (errObj?.code != null) {
      const parsed = Number(errObj.code)
      if (!Number.isNaN(parsed)) errorCode = parsed
    }
    const lower = message.toLowerCase()
    const alreadyExists =
      lower.includes('already exists') ||
      lower.includes('already in use') ||
      lower.includes('duplicate') ||
      lower.includes('content in this language already exists')
    return { ok: false, error: message, errorCode, alreadyExists }
  }

  const templateId =
    json.id != null
      ? String(json.id)
      : (json as { message_template_id?: unknown }).message_template_id != null
        ? String((json as { message_template_id: unknown }).message_template_id)
        : ''
  if (!templateId) {
    return {
      ok: false,
      error: 'Resposta da Meta sem ID do template.',
      alreadyExists: false,
    }
  }
  return { ok: true, templateId }
}

export async function sendWhatsAppInteractiveListMessage(input: {
  phoneNumberId: string
  accessToken: string
  toE164: string
  bodyText: string
  buttonLabel: string
  sections: Array<{ title: string; rows: WhatsAppListRow[] }>
}): Promise<GraphWhatsAppSendResult> {
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
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: input.bodyText.slice(0, 4096) },
        action: {
          button: input.buttonLabel.slice(0, 20),
          sections: input.sections.map((section) => ({
            title: section.title.slice(0, 24),
            rows: section.rows.map((row) => ({
              id: row.id,
              title: row.title.slice(0, 24),
              ...(row.description
                ? { description: row.description.slice(0, 72) }
                : {}),
            })),
          })),
        },
      },
    }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return parseGraphApiSendError(json, res.status)
  }
  const messages = json.messages as Array<{ id?: string }> | undefined
  const messageId = messages?.[0]?.id
  if (!messageId) {
    return { ok: false, error: 'Resposta da Meta sem message id.', isWindowExpired: false }
  }
  return { ok: true, messageId }
}
