import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDeliveryFlowOrder } from '@/lib/order-status-transitions'
import type { WhatsAppAiTone } from '@/lib/whatsapp/types'
import { getOrCreateLoyaltyConfig } from '@/services/loyalty.server'
import { sendWithWindowFallback } from '@/services/whatsapp-outbound.server'
import { getWhatsAppConfigForStore } from '@/services/whatsapp-config.server'

function publicStoreUrl(slug: string): string {
  const base =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    ''
  if (base) return `${base.replace(/\/$/, '')}/${slug}`
  return `/${slug}`
}

function customerNameForTemplate(name: string | null | undefined): string {
  const n = name?.trim()
  if (!n) return 'cliente'
  return n.split(/\s+/)[0] || 'cliente'
}

function orderIdForTemplate(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase()
}

function buildOrderNotificationTemplateParams(input: {
  customerName: string | null
  orderId: string
  statusLabel: string
  menuUrl: string
}): string[] {
  return [
    customerNameForTemplate(input.customerName),
    orderIdForTemplate(input.orderId),
    input.statusLabel,
    input.menuUrl,
  ]
}

async function loadStoreMenuUrl(db: SupabaseClient, storeId: string): Promise<string> {
  const { data } = await db.from('stores').select('slug').eq('id', storeId).maybeSingle()
  const slug = (data as { slug?: string } | null)?.slug
  if (!slug) return 'https://vyria.app'
  return publicStoreUrl(slug)
}

export type OrderWhatsAppNotifyOrder = {
  id: string
  customer_phone?: string | null
  customer_name?: string | null
  delivery_address?: string | null
  source?: string | null
  entregador_nome?: string | null
  entrega_prazo_minutos?: number | null
}

function orderRef(orderId: string): string {
  return `#${orderId.slice(0, 8).toUpperCase()}`
}

function greeting(name: string | null | undefined, tone: WhatsAppAiTone): string {
  const n = name?.trim()
  if (tone === 'formal') return n ? `Prezado(a) ${n},` : 'Prezado(a) cliente,'
  return n ? `Olá, ${n}!` : 'Olá!'
}

function buildReceivedMessage(input: {
  customerName: string | null
  orderRef: string
  storeName: string
  tone: WhatsAppAiTone
}): string {
  const lines =
    input.tone === 'formal'
      ? [
          greeting(input.customerName, input.tone),
          '',
          `Recebemos o seu pedido *${input.orderRef}* em *${input.storeName}*.`,
          'Em breve confirmaremos e iniciaremos o preparo.',
        ]
      : [
          greeting(input.customerName, input.tone),
          '',
          `Recebemos seu pedido *${input.orderRef}*! 🎉`,
          'A loja vai confirmar em instantes e já começamos a preparar.',
        ]
  return lines.join('\n')
}

function buildAcceptedPreparingMessage(input: {
  customerName: string | null
  orderRef: string
  storeName: string
  tone: WhatsAppAiTone
}): string {
  const lines =
    input.tone === 'formal'
      ? [
          greeting(input.customerName, input.tone),
          '',
          `O pedido *${input.orderRef}* foi *aceito* e já está em *preparação*.`,
          'Avisaremos quando sair para entrega.',
        ]
      : [
          greeting(input.customerName, input.tone),
          '',
          `Seu pedido *${input.orderRef}* foi *aceito*! ✅`,
          'Já estamos *preparando* tudo com carinho. 👨‍🍳',
        ]
  return lines.join('\n')
}

function buildOutForDeliveryMessage(input: {
  customerName: string | null
  orderRef: string
  courierName: string | null
  etaMinutes: number | null
  tone: WhatsAppAiTone
}): string {
  const courierLine = input.courierName
    ? input.tone === 'formal'
      ? `Entregador: *${input.courierName}*.`
      : `Entregador: *${input.courierName}* 🛵`
    : null
  const etaLine =
    input.etaMinutes && input.etaMinutes > 0
      ? input.tone === 'formal'
        ? `Previsão: cerca de *${input.etaMinutes} min*.`
        : `Chega em cerca de *${input.etaMinutes} min* ⏱️`
      : null

  const lines =
    input.tone === 'formal'
      ? [
          greeting(input.customerName, input.tone),
          '',
          `O pedido *${input.orderRef}* *saiu para entrega*.`,
          courierLine,
          etaLine,
        ]
      : [
          greeting(input.customerName, input.tone),
          '',
          `Seu pedido *${input.orderRef}* *saiu para entrega*! 🚀`,
          courierLine,
          etaLine,
        ]
  return lines.filter(Boolean).join('\n')
}

function buildReadyForPickupMessage(input: {
  customerName: string | null
  orderRef: string
  storeName: string
  tone: WhatsAppAiTone
}): string {
  const lines =
    input.tone === 'formal'
      ? [
          greeting(input.customerName, input.tone),
          '',
          `O pedido *${input.orderRef}* está *pronto para retirada* em *${input.storeName}*.`,
        ]
      : [
          greeting(input.customerName, input.tone),
          '',
          `Seu pedido *${input.orderRef}* está *pronto para retirada*! 📦`,
          `Pode buscar na *${input.storeName}*.`,
        ]
  return lines.join('\n')
}

function buildDeliveredMessage(input: {
  customerName: string | null
  orderRef: string
  storeName: string
  tone: WhatsAppAiTone
}): string {
  const lines =
    input.tone === 'formal'
      ? [
          greeting(input.customerName, input.tone),
          '',
          `O pedido *${input.orderRef}* foi *entregue*.`,
          `Obrigado por escolher *${input.storeName}*.`,
        ]
      : [
          greeting(input.customerName, input.tone),
          '',
          `Pedido *${input.orderRef}* *entregue*! 🙌`,
          `Obrigado pela preferência!`,
        ]
  return lines.join('\n')
}

async function loadStoreName(db: SupabaseClient, storeId: string): Promise<string> {
  const { data } = await db.from('stores').select('name').eq('id', storeId).maybeSingle()
  return String((data as { name?: string } | null)?.name || 'nossa loja')
}

/** Novo pedido recebido (checkout, status pending). */
export async function notifyOrderWhatsAppReceived(
  db: SupabaseClient,
  storeId: string,
  order: OrderWhatsAppNotifyOrder
): Promise<void> {
  const phone = order.customer_phone?.trim()
  if (!phone) return

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig?.notify_order_received) return

  const storeName = await loadStoreName(db, storeId)
  const menuUrl = await loadStoreMenuUrl(db, storeId)
  const body = buildReceivedMessage({
    customerName: order.customer_name ?? null,
    orderRef: orderRef(order.id),
    storeName,
    tone: waConfig.ai_tone,
  })

  await sendWithWindowFallback(
    db,
    storeId,
    phone,
    body,
    'order_notification',
    buildOrderNotificationTemplateParams({
      customerName: order.customer_name ?? null,
      orderId: order.id,
      statusLabel: 'recebido',
      menuUrl,
    })
  )
}

/** Mudança de estado do pedido (aceite, preparação, saiu para entrega, entregue). */
export async function notifyOrderWhatsAppStatusChange(
  db: SupabaseClient,
  storeId: string,
  order: OrderWhatsAppNotifyOrder,
  previousStatus: string,
  newStatus: string
): Promise<void> {
  const phone = order.customer_phone?.trim()
  if (!phone) return

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig) return

  const storeName = await loadStoreName(db, storeId)
  const menuUrl = await loadStoreMenuUrl(db, storeId)
  const ref = orderRef(order.id)
  const ctx = {
    customerName: order.customer_name ?? null,
    orderRef: ref,
    storeName,
    tone: waConfig.ai_tone,
  }

  if (previousStatus === 'pending' && newStatus === 'preparing' && waConfig.notify_order_preparing) {
    const body = buildAcceptedPreparingMessage(ctx)
    await sendWithWindowFallback(
      db,
      storeId,
      phone,
      body,
      'order_notification',
      buildOrderNotificationTemplateParams({
        customerName: ctx.customerName,
        orderId: order.id,
        statusLabel: 'em preparação',
        menuUrl,
      })
    )
    return
  }

  const delivery = isDeliveryFlowOrder(order)

  if (newStatus === 'confirmed' && waConfig.notify_order_ready && delivery) {
    const body = buildOutForDeliveryMessage({
      customerName: ctx.customerName,
      orderRef: ref,
      courierName: order.entregador_nome?.trim() || null,
      etaMinutes:
        order.entrega_prazo_minutos != null && order.entrega_prazo_minutos > 0
          ? order.entrega_prazo_minutos
          : null,
      tone: waConfig.ai_tone,
    })
    await sendWithWindowFallback(
      db,
      storeId,
      phone,
      body,
      'order_notification',
      buildOrderNotificationTemplateParams({
        customerName: ctx.customerName,
        orderId: order.id,
        statusLabel: 'saiu para entrega',
        menuUrl,
      })
    )
    return
  }

  if (
    previousStatus === 'ready' &&
    newStatus === 'delivered' &&
    !delivery &&
    waConfig.notify_order_ready
  ) {
    const body = buildReadyForPickupMessage(ctx)
    await sendWithWindowFallback(
      db,
      storeId,
      phone,
      body,
      'order_notification',
      buildOrderNotificationTemplateParams({
        customerName: ctx.customerName,
        orderId: order.id,
        statusLabel: 'pronto para retirada',
        menuUrl,
      })
    )
    return
  }

  if (newStatus === 'delivered' && waConfig.notify_order_delivered) {
    const loyaltyConfig = await getOrCreateLoyaltyConfig(db, storeId)
    if (loyaltyConfig.enabled) return

    const body = buildDeliveredMessage(ctx)
    await sendWithWindowFallback(
      db,
      storeId,
      phone,
      body,
      'order_notification',
      buildOrderNotificationTemplateParams({
        customerName: ctx.customerName,
        orderId: order.id,
        statusLabel: 'entregue',
        menuUrl,
      })
    )
  }
}
