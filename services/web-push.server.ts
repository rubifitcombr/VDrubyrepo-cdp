import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role.server'

type PushRow = {
  id?: string
  endpoint?: string
  p256dh?: string
  auth?: string
}

let vapidConfigured = false

async function getWebPushModule() {
  const mod = await import('web-push')
  return mod.default ?? mod
}

async function ensureVapidConfigured() {
  if (vapidConfigured) return true

  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim()
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()
  if (!subject || !publicKey || !privateKey) return false

  const webpush = await getWebPushModule()
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export async function sendWebPushNewOrder(params: {
  storeId: string
  storeName: string
  orderId: string
  customerName: string | null
}) {
  const ready = await ensureVapidConfigured()
  if (!ready) return

  const svc = createServiceRoleClient()
  const { data, error } = await svc
    .from('store_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('store_id', params.storeId)
  if (error || !data?.length) return

  const customer = params.customerName?.trim() || 'Cliente'
  const payload = JSON.stringify({
    title: 'Novo pedido recebido',
    body: `Novo pedido de ${customer}.`,
    url: '/dashboard/orders',
    orderId: params.orderId,
    storeName: params.storeName,
  })

  const webpush = await getWebPushModule()
  const staleIds: string[] = []

  for (const raw of data as PushRow[]) {
    const endpoint = raw.endpoint?.trim()
    const p256dh = raw.p256dh?.trim()
    const auth = raw.auth?.trim()
    if (!endpoint || !p256dh || !auth) {
      if (raw.id) staleIds.push(raw.id)
      continue
    }
    try {
      await webpush.sendNotification(
        {
          endpoint,
          keys: { p256dh, auth },
        },
        payload
      )
    } catch (e) {
      const err = e as { statusCode?: number }
      if (err.statusCode === 404 || err.statusCode === 410) {
        if (raw.id) staleIds.push(raw.id)
      }
    }
  }

  if (staleIds.length > 0) {
    await svc.from('store_push_subscriptions').delete().in('id', staleIds)
  }
}

