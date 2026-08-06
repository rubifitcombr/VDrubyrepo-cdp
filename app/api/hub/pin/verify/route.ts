import { NextResponse } from 'next/server'
import { enforceApiRateLimit } from '@/lib/api-security.server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import {
  isHubPinActive,
  parseHubPinConfig,
  type HubPinShortcut,
} from '@/lib/hub-shortcut-pin'
import { normalizeGarcomPin } from '@/lib/garcom-pin'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'
import { storeSupportsHubPins } from '@/lib/hub-shortcut-pin'

export const dynamic = 'force-dynamic'

const HUB_SHORTCUTS = new Set<HubPinShortcut>([
  'balcao',
  'cozinha',
  'administracao',
])

export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, 'hub-pin-verify', 30, 60_000)
  if (limited) return limited

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let body: { shortcut?: unknown; pin?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const shortcut = String(body.shortcut ?? '').trim() as HubPinShortcut
  if (!HUB_SHORTCUTS.has(shortcut)) {
    return NextResponse.json({ error: 'Atalho inválido.' }, { status: 400 })
  }

  const deny = gateMerchantMenuKey(
    gate.ctx.store,
    user.email,
    shortcut === 'balcao' ? 'caixa' : shortcut === 'cozinha' ? 'kds' : 'configuracoes'
  )
  if (deny) return deny

  const pin = normalizeGarcomPin(body.pin)
  if (pin.length !== 4) {
    return NextResponse.json({ error: 'PIN inválido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: storeRow, error } = await supabase
    .from('stores')
    .select(
      'hub_pin_balcao_enabled, hub_pin_balcao, hub_pin_salao_enabled, hub_pin_salao, hub_pin_cozinha_enabled, hub_pin_cozinha, hub_pin_admin_enabled, hub_pin_admin'
    )
    .eq('id', gate.ctx.storeId)
    .maybeSingle()

  if (error || !storeRow) {
    return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 })
  }

  const row = storeRow as Record<string, unknown>
  if (!storeSupportsHubPins(row)) {
    return NextResponse.json({ error: 'PIN do hub indisponível.' }, { status: 503 })
  }

  const config = parseHubPinConfig(row)
  const entry = config[shortcut]
  if (!isHubPinActive(entry) || entry.pin !== pin) {
    return NextResponse.json({ error: 'PIN inválido.' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, shortcut })
}
