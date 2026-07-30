import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendStoreWhatsAppText } from '@/services/whatsapp-outbound.server'
import { getOrCreateLoyaltyConfig } from '@/services/loyalty.server'
import { getWhatsAppConfigForStore } from '@/services/whatsapp-config.server'
import type { LoyaltyDeliveredEarnResult } from '@/lib/loyalty/types'
import type { WhatsAppAiTone } from '@/lib/whatsapp/types'

function publicStoreUrl(slug: string): string {
  const base =
    process.env.VYRIA_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL?.trim() ||
    ''
  if (base) return `${base.replace(/\/$/, '')}/${slug}`
  return `/${slug}`
}

export function buildLoyaltyDeliveredMessage(input: {
  customerName: string | null
  pointsEarned: number
  welcomeBonus: number
  newBalance: number
  orderRef: string
  storeName: string
  menuUrl: string | null
  tone: WhatsAppAiTone
}): string {
  const name = input.customerName?.trim()
  const greeting =
    input.tone === 'formal'
      ? name
        ? `Prezado(a) ${name},`
        : 'Prezado(a) cliente,'
      : name
        ? `Olá, ${name}!`
        : 'Olá!'

  const thanks =
    input.tone === 'formal'
      ? `Agradecemos a preferência pelo pedido *${input.orderRef}*.`
      : `Obrigado pelo pedido *${input.orderRef}* — esperamos que tenha gostado!`

  const lines: string[] = [greeting, '', thanks, '']

  if (input.pointsEarned > 0) {
    lines.push(
      input.tone === 'formal'
        ? `Nesta entrega você ganhou *${input.pointsEarned} pontos* de fidelidade.`
        : `✨ Você ganhou *${input.pointsEarned} pontos* nesta entrega.`
    )
  }

  if (input.welcomeBonus > 0) {
    lines.push(
      input.tone === 'formal'
        ? `Bônus de boas-vindas: *${input.welcomeBonus} pontos*.`
        : `🎁 Bônus de boas-vindas: *${input.welcomeBonus} pontos*!`
    )
  }

  lines.push(
    '',
    input.tone === 'formal'
      ? `Saldo atual: *${input.newBalance} pontos*.`
      : `Seu saldo total: *${input.newBalance} pontos*.`
  )

  if (input.menuUrl) {
    lines.push(
      '',
      input.tone === 'formal'
        ? `Use seus pontos no próximo pedido: ${input.menuUrl}`
        : `Use no próximo pedido pelo cardápio: ${input.menuUrl}`
    )
  }

  lines.push(
    '',
    input.tone === 'formal'
      ? 'Para consultar seu saldo, envie *pontos* a qualquer momento.'
      : 'Digite *pontos* quando quiser consultar seu saldo.'
  )

  return lines.join('\n')
}

/** Envia mensagem de agradecimento + pontuação pelo WhatsApp (robô IA). */
export async function sendLoyaltyDeliveredWhatsAppNotification(
  db: SupabaseClient,
  storeId: string,
  earn: LoyaltyDeliveredEarnResult
): Promise<void> {
  const waConfig = await getWhatsAppConfigForStore(db, storeId)
  if (!waConfig || waConfig.ai_enabled === false) return

  const loyaltyConfig = await getOrCreateLoyaltyConfig(db, storeId)
  if (!loyaltyConfig.enabled) return

  const { data: store } = await db
    .from('stores')
    .select('name, slug')
    .eq('id', storeId)
    .maybeSingle()

  const storeName = String((store as { name?: string } | null)?.name || 'nossa loja')
  const slug = (store as { slug?: string } | null)?.slug
  const menuUrl = slug ? publicStoreUrl(slug) : null

  const body = buildLoyaltyDeliveredMessage({
    customerName: earn.customer_name,
    pointsEarned: earn.points_earned,
    welcomeBonus: earn.welcome_bonus,
    newBalance: earn.new_balance,
    orderRef: earn.order_ref,
    storeName,
    menuUrl,
    tone: waConfig.ai_tone,
  })

  await sendStoreWhatsAppText(db, storeId, earn.customer_phone, body)
}
