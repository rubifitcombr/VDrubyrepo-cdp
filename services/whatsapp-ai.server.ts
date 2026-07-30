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
    .select('enabled')
    .eq('store_id', storeId)
    .maybeSingle()

  const loyaltyEnabled = (loyaltyCfg as { enabled?: boolean } | null)?.enabled === true
  let loyaltyBalance: number | null = null
  if (loyaltyEnabled) {
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

  const loyaltyBlock = ctx.loyaltyEnabled
    ? ctx.loyaltyBalance != null && ctx.loyaltyBalance > 0
      ? `Programa de fidelidade ativo. Saldo do cliente: ${ctx.loyaltyBalance} pontos.`
      : 'Programa de fidelidade ativo. Cliente ainda sem pontos ou saldo zero.'
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
    console.warn('[whatsapp-ai]', e instanceof Error ? e.message : e)
    return null
  }
}

function buildKeywordFallbackReply(
  ctx: WhatsAppAiContext,
  bodyText: string
): string | null {
  const normalized = bodyText.trim().toLowerCase()

  if (['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'e aí', 'eai'].some(
    (w) => normalized === w || normalized.startsWith(`${w}!`) || normalized.startsWith(`${w},`)
  )) {
    return ctx.tone === 'formal'
      ? `Olá! Sou o assistente de *${ctx.storeName}*. Para fazer seu pedido, acesse nosso cardápio: ${ctx.menuUrl}\n\nPosso ajudar com status do pedido, horários ou pontos de fidelidade.`
      : `Olá! 👋 Sou da *${ctx.storeName}*.\n\nPara pedir, é só pelo cardápio: ${ctx.menuUrl}\n\nQuer saber do seu pedido, horário ou pontos? É só perguntar!`
  }

  if (normalized.includes('cardapio') || normalized.includes('cardápio') || normalized === 'menu') {
    return `Acesse nosso cardápio para fazer o pedido: ${ctx.menuUrl}`
  }

  if (
    normalized.includes('pedido') ||
    normalized.includes('status') ||
    normalized.includes('andamento')
  ) {
    if (ctx.recentOrders.length === 0) {
      return `Não encontrei pedidos recentes com este número. Faça seu pedido pelo cardápio: ${ctx.menuUrl}`
    }
    const latest = ctx.recentOrders[0]!
    return `Seu pedido mais recente é *${latest.ref}*: *${latest.status}* (${latest.createdAt}).\n\nPara um novo pedido: ${ctx.menuUrl}`
  }

  if (
    normalized.includes('pontos') ||
    normalized.includes('fidelidade') ||
    normalized.includes('cashback')
  ) {
    if (!ctx.loyaltyEnabled) {
      return 'Esta loja ainda não tem programa de fidelidade ativo.'
    }
    if (ctx.loyaltyBalance != null && ctx.loyaltyBalance > 0) {
      return `Você tem *${ctx.loyaltyBalance} pontos*. Use no próximo pedido pelo cardápio: ${ctx.menuUrl}`
    }
    return `Você ainda não tem pontos. Faça um pedido pelo cardápio — ao entregar, avisamos aqui: ${ctx.menuUrl}`
  }

  if (normalized.includes('horário') || normalized.includes('horario') || normalized.includes('aberto')) {
    return ctx.storeOpen
      ? `Estamos *abertos* agora! Peça pelo cardápio: ${ctx.menuUrl}`
      : `No momento estamos *fechados*. Horários: ${ctx.hoursSummary}`
  }

  return null
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
    reply = buildKeywordFallbackReply(ctx, text)
  }

  if (!reply) {
    reply =
      ctx.tone === 'formal'
        ? `Obrigado pelo contato! Para fazer pedidos, utilize nosso cardápio: ${ctx.menuUrl}\n\nPosso ajudar com status do pedido, horários ou fidelidade.`
        : `Obrigado pela mensagem! 😊\n\nPedidos só pelo cardápio: ${ctx.menuUrl}\n\nPosso ajudar com status do pedido, horário ou pontos!`
  }

  return sendStoreWhatsAppText(db, storeId, fromE164, reply)
}
