import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import {
  getPlatformBillingConfig,
  maskAccessToken,
  upsertPlatformBillingConfig,
} from '@/services/platform-billing-config.server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const config = await getPlatformBillingConfig(ctx.svc)
  return NextResponse.json({
    ok: true,
    config: config
      ? {
          enabled: config.enabled,
          receiver_name: config.receiver_name,
          receiver_document: config.receiver_document,
          mp_access_token_masked: maskAccessToken(config.mp_access_token),
          has_webhook_secret: !!config.mp_webhook_secret,
          updated_at: config.updated_at,
        }
      : {
          enabled: false,
          receiver_name: null,
          receiver_document: null,
          mp_access_token_masked: null,
          has_webhook_secret: false,
          updated_at: null,
        },
    webhookUrl: 'https://acesseseusistemavyria.online/api/webhooks/mercadopago',
  })
}

export async function PATCH(req: Request) {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Parameters<typeof upsertPlatformBillingConfig>[1] = {
    updated_by: ctx.user.id,
  }

  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body.receiver_name === 'string') patch.receiver_name = body.receiver_name
  if (typeof body.receiver_document === 'string') {
    patch.receiver_document = body.receiver_document
  }
  if (typeof body.mp_access_token === 'string' && body.mp_access_token.trim()) {
    patch.mp_access_token = body.mp_access_token.trim()
  }
  if (typeof body.mp_webhook_secret === 'string' && body.mp_webhook_secret.trim()) {
    patch.mp_webhook_secret = body.mp_webhook_secret.trim()
  }

  const saved = await upsertPlatformBillingConfig(ctx.svc, patch)
  return NextResponse.json({
    ok: true,
    config: {
      enabled: saved.enabled,
      receiver_name: saved.receiver_name,
      receiver_document: saved.receiver_document,
      mp_access_token_masked: maskAccessToken(saved.mp_access_token),
      has_webhook_secret: !!saved.mp_webhook_secret,
      updated_at: saved.updated_at,
    },
  })
}
