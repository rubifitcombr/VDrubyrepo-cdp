import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DAY_LABELS,
  getStoreOpenState,
  getTodayClosingDisplayHM,
  parseWeeklyHours,
  type WeeklyHours,
} from '@/lib/business-hours'
import {
  WHATSAPP_HELP_MENU_BUTTON,
  WHATSAPP_HELP_MENU_ROWS,
  WHATSAPP_HELP_MENU_TITLE,
  WHATSAPP_MENU_HINT,
  isWhatsAppMenuOptionId,
  type WhatsAppMenuOptionId,
} from '@/lib/whatsapp/interactive-menu'
import { WHATSAPP_SESSION_GAP_MS } from '@/lib/whatsapp/session'
import type { WhatsAppAiTone } from '@/lib/whatsapp/types'
import { normalizePhoneE164 } from '@/services/loyalty.server'
import { sendWebPushWhatsAppHandoff } from '@/services/web-push.server'
import {
  getWhatsAppContactState,
  pauseWhatsAppConversationForHuman,
} from '@/services/whatsapp-contacts.server'
import {
  sendStoreWhatsAppInteractiveList,
  sendStoreWhatsAppText,
} from '@/services/whatsapp-outbound.server'
// Fallback de template (janela 24h) não aplicável ao robô: só responde a inbound
// recente, quando a janela Meta está aberta — ver sendWithWindowFallback em outbound.
import { getWhatsAppConfigForStore } from '@/services/whatsapp-config.server'

const ORDER_STATUS_PT: Record<string, string> = {
  pending: 'Aguardando confirmação da loja',
  preparing: 'Em preparação',
  ready: 'Pronto na cozinha',
  confirmed: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

/** Nova sessão se não houve inbound do cliente há mais de 6 horas. */
export { WHATSAPP_SESSION_GAP_MS } from '@/lib/whatsapp/session'

type RecentOrder = {
  ref: string
  status: string
  total: string
  createdAt: string
  itemsSummary: string | null
}

type WhatsAppAutoReplyContext = {
  storeName: string
  storeSubtitle: string | null
  menuUrl: string
  storePhone: string | null
  tone: WhatsAppAiTone
  storeOpen: boolean
  hoursMode: 'always' | 'scheduled' | 'manual'
  closingToday: string | null
  hoursSummary: string
  deliveryFee: string | null
  loyaltyEnabled: boolean
  loyaltyWhatsappEnabled: boolean
  loyaltyBalance: number | null
  recentOrders: RecentOrder[]
}

const autoReplyRateBuckets = new Map<string, { count: number; resetAt: number }>()

function publicStoreUrl(slug: string): string {
  const base =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    ''
  if (base) return `${base.replace(/\/$/, '')}/${slug}`
  return `/${slug}`
}

function formatMoneyBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatOrderDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function summarizeHours(hours: WeeklyHours): string {
  return Object.entries(hours)
    .map(([key, slot]) => {
      const label = DAY_LABELS[key as keyof typeof DAY_LABELS] ?? key
      if (slot.closed) return `${label}: fechado`
      return `${label}: ${slot.open}–${slot.close}`
    })
    .join('; ')
}

function checkAutoReplyRateLimit(storeId: string, phone: string): boolean {
  const key = `${storeId}:${phone}`
  const now = Date.now()
  const windowMs = 60_000
  const limit = 12
  const hit = autoReplyRateBuckets.get(key)
  if (!hit || now >= hit.resetAt) {
    autoReplyRateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (hit.count >= limit) return false
  hit.count += 1
  return true
}

function withMenuHint(text: string): string {
  return `${text}\n\n${WHATSAPP_MENU_HINT}`
}

async function loadRecentOrders(
  db: SupabaseClient,
  storeId: string,
  phoneDigits: string
): Promise<RecentOrder[]> {
  const tail = phoneDigits.slice(-11)
  const { data, error } = await db
    .from('orders')
    .select('id, status, total, created_at, items_summary, customer_phone')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) return []

  return (data || [])
    .filter((row) => {
      const stored = normalizePhoneE164(String((row as { customer_phone?: string }).customer_phone ?? ''))
      return stored === phoneDigits || (tail.length >= 10 && stored.endsWith(tail))
    })
    .slice(0, 3)
    .map((row) => {
      const r = row as {
        id: string
        status?: string
        total?: number
        created_at?: string
        items_summary?: string | null
      }
      const statusKey = String(r.status ?? 'pending')
      return {
        ref: `#${String(r.id).slice(0, 8).toUpperCase()}`,
        status: ORDER_STATUS_PT[statusKey] ?? statusKey,
        total: formatMoneyBrl(Number(r.total ?? 0)),
        createdAt: formatOrderDate(String(r.created_at ?? '')),
        itemsSummary: r.items_summary?.trim() || null,
      }
    })
}

async function loadWhatsAppAutoReplyContext(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  tone: WhatsAppAiTone
): Promise<WhatsAppAutoReplyContext | null> {
  const phoneDigits = normalizePhoneE164(fromE164)
  if (!phoneDigits) return null

  const { data: store } = await db
    .from('stores')
    .select(
      'name, slug, phone, subtitle, business_hours, manual_closed, delivery_fee, delivery_free_above'
    )
    .eq('id', storeId)
    .maybeSingle()

  if (!store) return null

  const slug = String((store as { slug?: string }).slug ?? '').trim()
  const weeklyHours = parseWeeklyHours((store as { business_hours?: unknown }).business_hours)
  const { open: storeOpen, mode: hoursMode } = getStoreOpenState(weeklyHours, {
    manualClosed: (store as { manual_closed?: boolean }).manual_closed === true,
  })

  const { data: loyaltyCfg } = await db
    .from('store_loyalty_config')
    .select('enabled, whatsapp_balance_enabled')
    .eq('store_id', storeId)
    .maybeSingle()

  const loyaltyEnabled = (loyaltyCfg as { enabled?: boolean } | null)?.enabled === true
  const loyaltyWhatsappEnabled =
    loyaltyEnabled &&
    (loyaltyCfg as { whatsapp_balance_enabled?: boolean } | null)?.whatsapp_balance_enabled !==
      false
  let loyaltyBalance: number | null = null
  if (loyaltyWhatsappEnabled) {
    const { data: account } = await db
      .from('loyalty_accounts')
      .select('points_balance')
      .eq('store_id', storeId)
      .eq('customer_phone', phoneDigits)
      .maybeSingle()
    loyaltyBalance = Number((account as { points_balance?: number } | null)?.points_balance ?? 0)
  }

  const deliveryFeeRaw = (store as { delivery_fee?: number | null }).delivery_fee
  const deliveryFreeAbove = (store as { delivery_free_above?: number | null }).delivery_free_above
  let deliveryFee: string | null = null
  if (deliveryFeeRaw != null && Number(deliveryFeeRaw) > 0) {
    deliveryFee = `Taxa de entrega a partir de ${formatMoneyBrl(Number(deliveryFeeRaw))}`
    if (deliveryFreeAbove != null && Number(deliveryFreeAbove) > 0) {
      deliveryFee += ` (grátis acima de ${formatMoneyBrl(Number(deliveryFreeAbove))})`
    }
  }

  const recentOrders = await loadRecentOrders(db, storeId, phoneDigits)

  return {
    storeName: String((store as { name?: string }).name || 'nossa loja'),
    storeSubtitle: (store as { subtitle?: string | null }).subtitle?.trim() || null,
    menuUrl: slug ? publicStoreUrl(slug) : '',
    storePhone: (store as { phone?: string | null }).phone?.trim() || null,
    tone,
    storeOpen,
    hoursMode,
    closingToday: getTodayClosingDisplayHM(weeklyHours),
    hoursSummary: summarizeHours(weeklyHours),
    deliveryFee,
    loyaltyEnabled,
    loyaltyWhatsappEnabled,
    loyaltyBalance,
    recentOrders,
  }
}

function welcomeReply(ctx: WhatsAppAutoReplyContext): string {
  if (ctx.tone === 'formal') {
    return `Olá! Bem-vindo(a) à ${ctx.storeName}!\nConfira nosso cardápio aqui: ${ctx.menuUrl}`
  }
  return `Olá! 👋 Bem-vindo(a) à ${ctx.storeName}!\nConfira nosso cardápio aqui: ${ctx.menuUrl}`
}

function orderStatusReply(ctx: WhatsAppAutoReplyContext): string {
  if (ctx.recentOrders.length === 0) {
    return ctx.tone === 'formal'
      ? `Não localizei pedidos recentes com este número.\n\nPara fazer um pedido: ${ctx.menuUrl}`
      : `Não achei pedido recente com este número.\n\nPara pedir agora: ${ctx.menuUrl}`
  }
  const latest = ctx.recentOrders[0]!
  const lines =
    ctx.tone === 'formal'
      ? [
          `Seu pedido mais recente é *${latest.ref}*:`,
          `Status: *${latest.status}*`,
          `Valor: ${latest.total} — ${latest.createdAt}`,
        ]
      : [
          `Seu último pedido *${latest.ref}*:`,
          `*${latest.status}* — ${latest.createdAt}`,
          `Total: ${latest.total}`,
        ]
  if (latest.itemsSummary) {
    lines.push(
      ctx.tone === 'formal'
        ? `Itens: ${latest.itemsSummary.slice(0, 100)}`
        : `📋 ${latest.itemsSummary.slice(0, 100)}`
    )
  }
  lines.push('', `Novo pedido pelo cardápio: ${ctx.menuUrl}`)
  return lines.join('\n')
}

function menuRedirectReply(ctx: WhatsAppAutoReplyContext, reason?: 'order' | 'menu'): string {
  if (reason === 'order') {
    return ctx.tone === 'formal'
      ? `Para registrar seu pedido com segurança, utilize nosso cardápio online:\n${ctx.menuUrl}\n\nLá você escolhe itens, endereço e pagamento. Posso ajudar com dúvidas sobre pedido em andamento, horário ou fidelidade.`
      : `Os pedidos são feitos pelo cardápio online 😊\n${ctx.menuUrl}\n\nÉ rapidinho: você monta o pedido, endereço e pagamento por lá. Aqui eu te ajudo com status, horário e pontos!`
  }
  return ctx.tone === 'formal'
    ? `Acesse nosso cardápio para fazer o pedido:\n${ctx.menuUrl}`
    : `Cardápio da loja:\n${ctx.menuUrl}`
}

function loyaltyReply(ctx: WhatsAppAutoReplyContext): string {
  if (!ctx.loyaltyEnabled) {
    return ctx.tone === 'formal'
      ? 'Esta loja ainda não possui programa de fidelidade ativo.'
      : 'Ainda não temos programa de pontos nesta loja.'
  }
  if (!ctx.loyaltyWhatsappEnabled) {
    return ctx.tone === 'formal'
      ? 'O programa de fidelidade está ativo, mas a consulta de saldo pelo WhatsApp está desactivada. Utilize o cardápio para resgatar pontos no checkout.'
      : 'Temos fidelidade, mas o saldo pelo WhatsApp está desligado por agora. Você ainda pode usar os pontos no cardápio no checkout 😊'
  }
  if (ctx.loyaltyBalance != null && ctx.loyaltyBalance > 0) {
    return ctx.tone === 'formal'
      ? `Você possui *${ctx.loyaltyBalance} pontos* de fidelidade. Utilize no próximo pedido pelo cardápio:\n${ctx.menuUrl}`
      : `Você tem *${ctx.loyaltyBalance} pontos*! 🎁\nUse no próximo pedido: ${ctx.menuUrl}`
  }
  return ctx.tone === 'formal'
    ? `Você ainda não possui pontos. Faça um pedido pelo cardápio e, ao ser entregue, enviaremos sua pontuação aqui:\n${ctx.menuUrl}`
    : `Você ainda não tem pontos. Peça pelo cardápio e, na entrega, avisamos quantos pontos ganhou:\n${ctx.menuUrl}`
}

function hoursReply(ctx: WhatsAppAutoReplyContext): string {
  if (ctx.storeOpen) {
    const close = ctx.closingToday ? ` Fechamos hoje às ${ctx.closingToday}.` : ''
    return ctx.tone === 'formal'
      ? `Estamos *abertos* para pedidos.${close}\n\nCardápio: ${ctx.menuUrl}`
      : `Estamos *abertos*!${close}\n\nPeça aqui: ${ctx.menuUrl}`
  }
  return ctx.tone === 'formal'
    ? `No momento estamos *fechados*.\n\nHorários: ${ctx.hoursSummary}\n\nCardápio: ${ctx.menuUrl}`
    : `Estamos *fechados* agora.\n\n🕐 ${ctx.hoursSummary}\n\nCardápio: ${ctx.menuUrl}`
}

function deliveryReply(ctx: WhatsAppAutoReplyContext): string {
  const fee = ctx.deliveryFee
    ? `${ctx.deliveryFee}.`
    : ctx.tone === 'formal'
      ? 'Consulte a taxa no cardápio ao informar seu endereço.'
      : 'A taxa aparece no cardápio quando você coloca o endereço.'
  return ctx.tone === 'formal'
    ? `Fazemos entrega conforme a área da loja. ${fee}\n\nFaça o pedido pelo cardápio: ${ctx.menuUrl}`
    : `Entregamos sim! ${fee}\n\nPedido pelo cardápio: ${ctx.menuUrl}`
}

function helpReply(ctx: WhatsAppAutoReplyContext): string {
  return ctx.tone === 'formal'
    ? `Sou o assistente de *${ctx.storeName}*. Posso ajudar com:\n• Status do seu pedido\n• Horário de funcionamento\n• Pontos de fidelidade\n• Link do cardápio\n\nPedidos são feitos somente pelo cardápio: ${ctx.menuUrl}`
    : `Sou da *${ctx.storeName}* e posso te ajudar com:\n✅ Status do pedido\n✅ Horário\n✅ Pontos de fidelidade\n✅ Link do cardápio\n\nPedidos só por aqui: ${ctx.menuUrl}`
}

function thanksReply(ctx: WhatsAppAutoReplyContext): string {
  return ctx.tone === 'formal'
    ? `Por nada! Estamos à disposição. Cardápio: ${ctx.menuUrl}`
    : `Por nada! 😊 Qualquer coisa, é só chamar.\n${ctx.menuUrl}`
}

function humanHandoffReply(ctx: WhatsAppAutoReplyContext): string {
  return ctx.tone === 'formal'
    ? `Certo! Vou chamar um atendente da *${ctx.storeName}* para continuar com você. Aguarde um momento, por favor.`
    : `Beleza! Já avisei a equipe da *${ctx.storeName}* — um atendente vai continuar com você em instantes.`
}

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

type FallbackResult = { kind: 'text'; body: string } | { kind: 'menu' }

function buildRegexFallbackReply(
  ctx: WhatsAppAutoReplyContext,
  bodyText: string
): FallbackResult | null {
  const n = normalizeForMatch(bodyText)

  if (matchesAny(n, [/\bmenu\b/, /\bopcoes\b/, /\bopções\b/])) {
    return { kind: 'menu' }
  }

  if (
    matchesAny(n, [
      /^(oi|ola|hey|eai|e ai|bom dia|boa tarde|boa noite)([!.?]|$)/,
      /^(ola|oi)\s+/,
    ])
  ) {
    return { kind: 'text', body: welcomeReply(ctx) }
  }

  if (
    matchesAny(n, [
      /\b(obrigad|valeu|agradec|brigad)/,
      /\b(tchau|ate mais|ate logo|flw|falou)\b/,
    ])
  ) {
    return { kind: 'text', body: thanksReply(ctx) }
  }

  if (
    matchesAny(n, [
      /\b(pedido|andamento|status|rastre|onde esta|cadê|cade|demora|previsao|chega)/,
      /\b(ja saiu|saiu|entregador)\b/,
    ])
  ) {
    return { kind: 'text', body: orderStatusReply(ctx) }
  }

  if (
    matchesAny(n, [
      /\b(quero|gostaria|manda|pedir|pedindo|adiciona|coloca)\b/,
      /\b(pizza|hamburg|lanche|combo|refrigerante|bebida|porcao|porção)\b/,
      /\b(fazer um pedido|fazer pedido|novo pedido)\b/,
    ]) &&
    !matchesAny(n, [/\b(status|andamento|onde)\b/])
  ) {
    return { kind: 'text', body: menuRedirectReply(ctx, 'order') }
  }

  if (matchesAny(n, [/\b(cardapio|menu|link)\b/, /\bver (o )?cardapio\b/])) {
    return { kind: 'text', body: menuRedirectReply(ctx, 'menu') }
  }

  if (matchesAny(n, [/\b(pontos|fidelidade|cashback|saldo)\b/])) {
    return { kind: 'text', body: loyaltyReply(ctx) }
  }

  if (
    matchesAny(n, [
      /\b(horario|aberto|aberta|fechad|funciona|abre|fecha)\b/,
      /\besta aberto\b/,
    ])
  ) {
    return { kind: 'text', body: hoursReply(ctx) }
  }

  if (matchesAny(n, [/\b(entrega|entregar|frete|taxa|delivery)\b/])) {
    return { kind: 'text', body: deliveryReply(ctx) }
  }

  if (matchesAny(n, [/\b(pix|cartao|cartão|dinheiro|pagamento|pagar)\b/])) {
    return {
      kind: 'text',
      body:
        ctx.tone === 'formal'
          ? `Formas de pagamento disponíveis no checkout do cardápio (PIX, cartão ou dinheiro, conforme a loja).\n\nAcesse: ${ctx.menuUrl}`
          : `Você escolhe o pagamento no cardápio (PIX, cartão ou dinheiro, conforme a loja) 💳\n\n${ctx.menuUrl}`,
    }
  }

  if (matchesAny(n, [/\b(ajuda|help|duvida|dúvida|como funciona|o que voce)\b/])) {
    return { kind: 'text', body: helpReply(ctx) }
  }

  return null
}

async function handleMenuOption(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  ctx: WhatsAppAutoReplyContext,
  optionId: WhatsAppMenuOptionId,
  customerName: string | null
): Promise<boolean> {
  let body: string
  switch (optionId) {
    case 'status_pedido':
      body = orderStatusReply(ctx)
      break
    case 'meus_pontos':
      body = loyaltyReply(ctx)
      break
    case 'horario':
      body = hoursReply(ctx)
      break
    case 'taxa_entrega':
      body = deliveryReply(ctx)
      break
    case 'falar_atendente':
      await pauseWhatsAppConversationForHuman(db, storeId, fromE164)
      await sendWebPushWhatsAppHandoff({
        storeId,
        storeName: ctx.storeName,
        customerPhone: fromE164,
        customerName,
      }).catch((e) => console.warn('[whatsapp handoff push]', e))
      body = humanHandoffReply(ctx)
      return sendStoreWhatsAppText(db, storeId, fromE164, withMenuHint(body))
    default:
      return false
  }
  return sendStoreWhatsAppText(db, storeId, fromE164, withMenuHint(body))
}

async function sendHelpMenuList(
  db: SupabaseClient,
  storeId: string,
  fromE164: string
): Promise<boolean> {
  return sendStoreWhatsAppInteractiveList(db, storeId, fromE164, {
    bodyText: WHATSAPP_HELP_MENU_TITLE,
    buttonLabel: WHATSAPP_HELP_MENU_BUTTON,
    rows: WHATSAPP_HELP_MENU_ROWS,
  })
}

export type WhatsAppInboundPayload = {
  bodyText?: string | null
  listReplyId?: string | null
  isNewSession: boolean
  customerName?: string | null
}

/**
 * Gera e envia resposta de atendimento automático (menu interactivo + regex).
 * Retorna true se enviou alguma resposta.
 */
export async function tryWhatsAppAutoReply(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  input: WhatsAppInboundPayload
): Promise<boolean> {
  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || waConfig.auto_reply_enabled === false) {
    return false
  }

  const phoneDigits = normalizePhoneE164(fromE164)
  if (!phoneDigits) return false

  const contactState = await getWhatsAppContactState(db, storeId, fromE164)
  if (contactState?.marketing_opt_out) return false
  if (contactState?.conversation_status === 'humano') return false

  if (!checkAutoReplyRateLimit(storeId, phoneDigits)) {
    await sendStoreWhatsAppText(
      db,
      storeId,
      fromE164,
      'Recebemos sua mensagem! Um momento — estamos com muitas conversas. Tente de novo em instantes ou acesse o cardápio para pedir.'
    )
    return true
  }

  const ctx = await loadWhatsAppAutoReplyContext(db, storeId, fromE164, waConfig.ai_tone)
  if (!ctx) return false

  if (input.isNewSession) {
    const welcomeSent = await sendStoreWhatsAppText(db, storeId, fromE164, welcomeReply(ctx))
    if (!welcomeSent) return false
    return sendHelpMenuList(db, storeId, fromE164)
  }

  const listReplyId = input.listReplyId?.trim() || null
  if (listReplyId && isWhatsAppMenuOptionId(listReplyId)) {
    return handleMenuOption(
      db,
      storeId,
      fromE164,
      ctx,
      listReplyId,
      input.customerName ?? contactState?.customer_name ?? null
    )
  }

  const text = input.bodyText?.trim() || ''
  if (!text) return false

  const fallback = buildRegexFallbackReply(ctx, text)
  if (!fallback) {
    return sendHelpMenuList(db, storeId, fromE164)
  }
  if (fallback.kind === 'menu') {
    return sendHelpMenuList(db, storeId, fromE164)
  }
  return sendStoreWhatsAppText(db, storeId, fromE164, withMenuHint(fallback.body))
}

/** @deprecated Use tryWhatsAppAutoReply */
export async function tryWhatsAppAiReply(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  bodyText: string
): Promise<boolean> {
  return tryWhatsAppAutoReply(db, storeId, fromE164, {
    bodyText,
    isNewSession: false,
  })
}
