import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import {
  DAY_LABELS,
  getStoreOpenState,
  getTodayClosingDisplayHM,
  parseWeeklyHours,
  type WeeklyHours,
} from '@/lib/business-hours'
import type { WhatsAppAiTone } from '@/lib/whatsapp/types'
import { normalizePhoneE164 } from '@/services/loyalty.server'
import { sendStoreWhatsAppText } from '@/services/whatsapp-outbound.server'
import { getWhatsAppConfigForStore } from '@/services/whatsapp-config.server'

const ORDER_STATUS_PT: Record<string, string> = {
  pending: 'Aguardando confirmação da loja',
  preparing: 'Em preparação',
  ready: 'Pronto na cozinha',
  confirmed: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

type RecentOrder = {
  ref: string
  status: string
  total: string
  createdAt: string
  itemsSummary: string | null
}

type ChatTurn = { role: 'user' | 'assistant'; content: string }

type WhatsAppAiContext = {
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
  chatHistory: ChatTurn[]
}

const aiRateBuckets = new Map<string, { count: number; resetAt: number }>()

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

function checkAiRateLimit(storeId: string, phone: string): boolean {
  const key = `${storeId}:${phone}`
  const now = Date.now()
  const windowMs = 60_000
  const limit = 12
  const hit = aiRateBuckets.get(key)
  if (!hit || now >= hit.resetAt) {
    aiRateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (hit.count >= limit) return false
  hit.count += 1
  return true
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

async function loadChatHistory(
  db: SupabaseClient,
  storeId: string,
  phoneDigits: string
): Promise<ChatTurn[]> {
  const { data } = await db
    .from('whatsapp_messages')
    .select('direction, body_text, wa_from, wa_to, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (data || []).filter((row) => {
    const from = normalizePhoneE164(String((row as { wa_from?: string }).wa_from ?? ''))
    const to = normalizePhoneE164(String((row as { wa_to?: string }).wa_to ?? ''))
    return from === phoneDigits || to === phoneDigits
  })

  return rows
    .reverse()
    .slice(-8)
    .map((row) => {
      const direction = String((row as { direction?: string }).direction ?? '')
      const text = String((row as { body_text?: string }).body_text ?? '').trim()
      if (!text) return null
      return {
        role: direction === 'inbound' ? ('user' as const) : ('assistant' as const),
        content: text,
      }
    })
    .filter((t): t is ChatTurn => t != null)
}

async function loadWhatsAppAiContext(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  tone: WhatsAppAiTone
): Promise<WhatsAppAiContext | null> {
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

  const [recentOrders, chatHistory] = await Promise.all([
    loadRecentOrders(db, storeId, phoneDigits),
    loadChatHistory(db, storeId, phoneDigits),
  ])

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
    chatHistory,
  }
}

function buildSystemPrompt(ctx: WhatsAppAiContext): string {
  const toneGuide =
    ctx.tone === 'formal'
      ? 'Use tratamento respeitoso (você/senhor(a)), sem gírias e sem emojis.'
      : 'Tom acolhedor e natural, como um atendente simpático. Emojis com moderação (no máximo 1 por mensagem).'

  const ordersBlock =
    ctx.recentOrders.length > 0
      ? ctx.recentOrders
          .map(
            (o, i) =>
              `${i + 1}. ${o.ref} — ${o.status} — ${o.total} — ${o.createdAt}${
                o.itemsSummary ? ` — Itens: ${o.itemsSummary.slice(0, 120)}` : ''
              }`
          )
          .join('\n')
      : 'Nenhum pedido recente encontrado para este telefone.'

  const loyaltyBlock = ctx.loyaltyWhatsappEnabled
    ? ctx.loyaltyBalance != null && ctx.loyaltyBalance > 0
      ? `Programa de fidelidade ativo. Saldo do cliente: ${ctx.loyaltyBalance} pontos.`
      : 'Programa de fidelidade ativo. Cliente ainda sem pontos ou saldo zero.'
    : ctx.loyaltyEnabled
      ? 'Programa de fidelidade ativo, mas consulta de saldo pelo WhatsApp está desactivada.'
      : 'Programa de fidelidade inativo nesta loja.'

  return `Você é o assistente virtual de atendimento da loja "${ctx.storeName}" no WhatsApp.
${ctx.storeSubtitle ? `Sobre a loja: ${ctx.storeSubtitle}` : ''}

${toneGuide}

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em português do Brasil.
2. Seja breve: no máximo 4 linhas curtas (mensagem de WhatsApp).
3. NUNCA monte pedidos, NUNCA peça itens, quantidades ou endereço para registrar pedido no chat.
4. Para fazer pedido, direcione SEMPRE ao cardápio online: ${ctx.menuUrl || '(link indisponível — peça para acessar o site da loja)'}
5. Não invente produtos, preços ou promoções que não estejam no contexto.
6. Você pode informar status de pedidos, horário, fidelidade e orientar sobre o cardápio.
7. Se não souber algo, seja honesto e sugira o cardápio ou falar com a loja${ctx.storePhone ? ` (${ctx.storePhone})` : ''}.
8. Não mencione que é uma IA, a menos que perguntem diretamente — apresente-se como assistente da loja.

CONTEXTO DA LOJA:
- Cardápio (único canal de pedidos): ${ctx.menuUrl}
- Agora: ${ctx.storeOpen ? 'ABERTA para pedidos' : 'FECHADA ou fora do horário'}
- Modo de horário: ${ctx.hoursMode}
${ctx.closingToday ? `- Fecha hoje às: ${ctx.closingToday}` : ''}
- Horários da semana: ${ctx.hoursSummary}
${ctx.deliveryFee ? `- Entrega: ${ctx.deliveryFee}` : ''}
- ${loyaltyBlock}

PEDIDOS RECENTES DESTE CLIENTE (por telefone):
${ordersBlock}

Responda apenas à última mensagem do cliente, usando o histórico da conversa quando fizer sentido.`
}

async function generateAiReply(
  ctx: WhatsAppAiContext,
  userMessage: string
): Promise<string | null> {
  if (isOpenAiDisabled()) return null

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const openai = new OpenAI({ apiKey })
  const history = ctx.chatHistory.filter((t) => t.content !== userMessage.trim())
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: userMessage.trim() },
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.6,
      max_tokens: 320,
    })
    const text = completion.choices[0]?.message?.content?.trim()
    return text || null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (isOpenAiBillingError(msg)) {
      console.warn('[whatsapp-ai] OpenAI indisponível (créditos/cota) — modo atendente local.')
    } else {
      console.warn('[whatsapp-ai]', msg)
    }
    return null
  }
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

function greetingReply(ctx: WhatsAppAiContext): string {
  const openLine = ctx.storeOpen
    ? ctx.tone === 'formal'
      ? 'No momento estamos abertos para pedidos.'
      : 'Estamos abertos agora!'
    : ctx.tone === 'formal'
      ? 'No momento estamos fora do horário de atendimento.'
      : 'No momento estamos fechados.'

  if (ctx.tone === 'formal') {
    return `Olá! Sou o assistente de *${ctx.storeName}*. ${openLine}\n\nPara fazer seu pedido, acesse o cardápio: ${ctx.menuUrl}\n\nPosso informar status do pedido, horários, entrega ou pontos de fidelidade.`
  }
  return `Olá! 👋 Aqui é da *${ctx.storeName}*. ${openLine}\n\nPedidos só pelo cardápio: ${ctx.menuUrl}\n\nMe chama se quiser saber do seu pedido, horário ou pontos!`
}

function orderStatusReply(ctx: WhatsAppAiContext): string {
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

function menuRedirectReply(ctx: WhatsAppAiContext, reason?: 'order' | 'menu'): string {
  if (reason === 'order') {
    return ctx.tone === 'formal'
      ? `Para registrar seu pedido com segurança, utilize nosso cardápio online:\n${ctx.menuUrl}\n\nLá você escolhe itens, endereço e pagamento. Posso ajudar com dúvidas sobre pedido em andamento, horário ou fidelidade.`
      : `Os pedidos são feitos pelo cardápio online 😊\n${ctx.menuUrl}\n\nÉ rapidinho: você monta o pedido, endereço e pagamento por lá. Aqui eu te ajudo com status, horário e pontos!`
  }
  return ctx.tone === 'formal'
    ? `Acesse nosso cardápio para fazer o pedido:\n${ctx.menuUrl}`
    : `Cardápio da loja:\n${ctx.menuUrl}`
}

function loyaltyReply(ctx: WhatsAppAiContext): string {
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

function hoursReply(ctx: WhatsAppAiContext): string {
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

function deliveryReply(ctx: WhatsAppAiContext): string {
  const fee = ctx.deliveryFee
    ? ctx.tone === 'formal'
      ? `${ctx.deliveryFee}.`
      : `${ctx.deliveryFee}.`
    : ctx.tone === 'formal'
      ? 'Consulte a taxa no cardápio ao informar seu endereço.'
      : 'A taxa aparece no cardápio quando você coloca o endereço.'
  return ctx.tone === 'formal'
    ? `Fazemos entrega conforme a área da loja. ${fee}\n\nFaça o pedido pelo cardápio: ${ctx.menuUrl}`
    : `Entregamos sim! ${fee}\n\nPedido pelo cardápio: ${ctx.menuUrl}`
}

function helpReply(ctx: WhatsAppAiContext): string {
  return ctx.tone === 'formal'
    ? `Sou o assistente de *${ctx.storeName}*. Posso ajudar com:\n• Status do seu pedido\n• Horário de funcionamento\n• Pontos de fidelidade\n• Link do cardápio\n\nPedidos são feitos somente pelo cardápio: ${ctx.menuUrl}`
    : `Sou da *${ctx.storeName}* e posso te ajudar com:\n✅ Status do pedido\n✅ Horário\n✅ Pontos de fidelidade\n✅ Link do cardápio\n\nPedidos só por aqui: ${ctx.menuUrl}`
}

function thanksReply(ctx: WhatsAppAiContext): string {
  return ctx.tone === 'formal'
    ? `Por nada! Estamos à disposição. Cardápio: ${ctx.menuUrl}`
    : `Por nada! 😊 Qualquer coisa, é só chamar.\n${ctx.menuUrl}`
}

/** Atendimento profissional sem OpenAI — cobre intenções comuns do cliente. */
function buildProfessionalFallbackReply(
  ctx: WhatsAppAiContext,
  bodyText: string
): string | null {
  const n = normalizeForMatch(bodyText)

  if (
    matchesAny(n, [
      /^(oi|ola|hey|eai|e ai|bom dia|boa tarde|boa noite)([!.?]|$)/,
      /^(ola|oi)\s+/,
    ])
  ) {
    return greetingReply(ctx)
  }

  if (
    matchesAny(n, [
      /\b(obrigad|valeu|agradec|brigad)/,
      /\b(tchau|ate mais|ate logo|flw|falou)\b/,
    ])
  ) {
    return thanksReply(ctx)
  }

  if (
    matchesAny(n, [
      /\b(pedido|andamento|status|rastre|onde esta|cadê|cade|demora|previsao|chega)/,
      /\b(ja saiu|saiu|entregador)\b/,
    ])
  ) {
    return orderStatusReply(ctx)
  }

  if (
    matchesAny(n, [
      /\b(quero|gostaria|manda|pedir|pedindo|adiciona|coloca)\b/,
      /\b(pizza|hamburg|lanche|combo|refrigerante|bebida|porcao|porção)\b/,
      /\b(fazer um pedido|fazer pedido|novo pedido)\b/,
    ]) &&
    !matchesAny(n, [/\b(status|andamento|onde)\b/])
  ) {
    return menuRedirectReply(ctx, 'order')
  }

  if (matchesAny(n, [/\b(cardapio|menu|link)\b/, /\bver (o )?cardapio\b/])) {
    return menuRedirectReply(ctx, 'menu')
  }

  if (matchesAny(n, [/\b(pontos|fidelidade|cashback|saldo)\b/])) {
    return loyaltyReply(ctx)
  }

  if (
    matchesAny(n, [
      /\b(horario|aberto|aberta|fechad|funciona|abre|fecha)\b/,
      /\besta aberto\b/,
    ])
  ) {
    return hoursReply(ctx)
  }

  if (matchesAny(n, [/\b(entrega|entregar|frete|taxa|delivery)\b/])) {
    return deliveryReply(ctx)
  }

  if (
    matchesAny(n, [
      /\b(pix|cartao|cartão|dinheiro|pagamento|pagar)\b/,
    ])
  ) {
    return ctx.tone === 'formal'
      ? `Formas de pagamento disponíveis no checkout do cardápio (PIX, cartão ou dinheiro, conforme a loja).\n\nAcesse: ${ctx.menuUrl}`
      : `Você escolhe o pagamento no cardápio (PIX, cartão ou dinheiro, conforme a loja) 💳\n\n${ctx.menuUrl}`
  }

  if (matchesAny(n, [/\b(ajuda|help|duvida|dúvida|como funciona|o que voce)\b/])) {
    return helpReply(ctx)
  }

  return null
}

function isOpenAiDisabled(): boolean {
  const flag = process.env.WHATSAPP_AI_DISABLE_OPENAI?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

function isOpenAiBillingError(message: string): boolean {
  return /insufficient_quota|billing|exceeded|credit|payment|429/i.test(message)
}

/**
 * Gera e envia resposta de atendimento (IA com fallback por palavras-chave).
 * Retorna true se enviou resposta.
 */
export async function tryWhatsAppAiReply(
  db: SupabaseClient,
  storeId: string,
  fromE164: string,
  bodyText: string
): Promise<boolean> {
  const text = bodyText.trim()
  if (!text) return false

  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.status !== 'active' || waConfig.ai_enabled === false) {
    return false
  }

  const phoneDigits = normalizePhoneE164(fromE164)
  if (!phoneDigits) return false

  if (!checkAiRateLimit(storeId, phoneDigits)) {
    await sendStoreWhatsAppText(
      db,
      storeId,
      fromE164,
      'Recebemos sua mensagem! Um momento — estamos com muitas conversas. Tente de novo em instantes ou acesse o cardápio para pedir.'
    )
    return true
  }

  const ctx = await loadWhatsAppAiContext(db, storeId, fromE164, waConfig.ai_tone)
  if (!ctx) return false

  let reply = await generateAiReply(ctx, text)
  if (!reply) {
    reply = buildProfessionalFallbackReply(ctx, text)
  }

  if (!reply) {
    reply = helpReply(ctx)
  }

  return sendStoreWhatsAppText(db, storeId, fromE164, reply)
}
