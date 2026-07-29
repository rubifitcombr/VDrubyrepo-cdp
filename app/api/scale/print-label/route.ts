import { NextResponse } from 'next/server'
import {
  gateMerchantScaleIntegration,
  gateMerchantMenuKey,
} from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { MENU_PRODUCT_SELECT, normalizeMenuProductRow } from '@/lib/menu-product'
import { buildWeighableLabelEscPos } from '@/lib/print/templates/weighable-label'
import { uint8ToBase64 } from '@/lib/print/escpos'
import { roundWeightKg } from '@/lib/scale/price'
import { parseScaleFromStore } from '@/lib/store-scale'
import { parsePrintingFromStore } from '@/lib/store-printing'
import {
  effectivePricePerKg,
  isSoldByWeight,
  normalizePluCode,
  validateWeighableLineWeight,
} from '@/lib/weighable-product'
import { getUser } from '@/services/auth.server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function normalizeAgentBase(url: string): string | null {
  const base = url.trim().replace(/\/+$/, '')
  if (!base || !/^https?:\/\//i.test(base)) return null
  return base
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const denyMenu = gateMerchantMenuKey(gate.ctx.store, user.email, 'produtos')
  const denyPrint = gateMerchantMenuKey(gate.ctx.store, user.email, 'impressao')
  if (denyMenu && denyPrint) {
    return denyMenu
  }

  const denyScale = gateMerchantScaleIntegration(gate.ctx.store, user.email)
  if (denyScale) return denyScale

  let body: { product_id?: unknown; weight_kg?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const productId = String(body.product_id ?? '').trim()
  const weightKg = roundWeightKg(Number(body.weight_kg))
  if (!productId) {
    return NextResponse.json({ error: 'Informe o produto.' }, { status: 400 })
  }
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return NextResponse.json({ error: 'Informe um peso válido em kg.' }, { status: 400 })
  }

  const supabase = await createClient()
  const storeId = gate.ctx.storeId
  const { data: raw, error } = await supabase
    .from('products')
    .select(MENU_PRODUCT_SELECT)
    .eq('store_id', storeId)
    .eq('id', productId)
    .maybeSingle()

  if (error || !raw) {
    return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })
  }

  const product = normalizeMenuProductRow(raw as Record<string, unknown>, storeId)
  if (!isSoldByWeight(product)) {
    return NextResponse.json({ error: 'Produto não é pesável.' }, { status: 400 })
  }

  const plu = normalizePluCode(product.plu_code)
  if (!plu) {
    return NextResponse.json({ error: 'Produto sem PLU configurado.' }, { status: 400 })
  }

  const pricePerKg = effectivePricePerKg(product)
  if (pricePerKg == null || pricePerKg <= 0) {
    return NextResponse.json({ error: 'Produto sem preço por kg.' }, { status: 400 })
  }

  const weightCheck = validateWeighableLineWeight(product, weightKg)
  if (!weightCheck.ok) {
    return NextResponse.json({ error: weightCheck.error }, { status: 400 })
  }

  const scale = parseScaleFromStore(gate.ctx.store)
  const printing = parsePrintingFromStore(gate.ctx.store)
  const storeName =
    typeof gate.ctx.store.name === 'string' ? gate.ctx.store.name : 'Loja'

  const escpos = buildWeighableLabelEscPos({
    storeName,
    productName: product.name,
    plu,
    pricePerKg,
    weightKg,
    pluPrefix: scale.scale_plu_prefix,
    paperMm: printing.print_paper_mm,
  })

  const agentUrl = normalizeAgentBase(printing.print_agent_url)
  const agentToken = printing.print_agent_token?.trim() || 'vyria-agent-2026'
  const printerIp = printing.print_printer_ip?.trim()

  if (!agentUrl || !printerIp) {
    return NextResponse.json(
      {
        error:
          'Configure o programa Vyria e a impressora em Impressão antes de imprimir etiquetas.',
      },
      { status: 400 }
    )
  }

  const port = Number.isFinite(Number(printing.print_printer_port))
    ? Number(printing.print_printer_port)
    : 9100

  try {
    const res = await fetch(`${agentUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-token': agentToken,
      },
      body: JSON.stringify({
        printerIp,
        printerPort: port,
        data: uint8ToBase64(escpos),
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      code?: string
    }
    if (!res.ok || json.ok === false) {
      return NextResponse.json(
        { ok: false, error: json.error || 'Falha ao enviar etiqueta à impressora.' },
        { status: 502 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível contactar o programa Vyria.',
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true })
}
