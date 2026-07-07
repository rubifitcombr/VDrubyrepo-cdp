import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { fetchStoreByPublicSlug } from '@/lib/store-public-slug.server'
import {
  evaluateDeliveryForCustomer,
  type StoreDeliveryConfig,
} from '@/lib/delivery-zone.server'
import { hasOrderPipelineAutomations, hasPixCheckout, parsePlan } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { publicDineInCheckoutAllowed } from '@/lib/salao-attendance'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { sendWebPushNewOrder } from '@/services/web-push.server'
import { buildWaiterNotes } from '@/lib/waiter-order-notes'
import { buildItemsSummaryWithLineTotals } from '@/lib/print/items-summary-format'
import { tryAutoThermalPrint } from '@/services/thermal-print.server'
import { buildPixChargeForOrder } from '@/lib/pix/build-charge.server'
import { storePixCheckoutEnabled } from '@/lib/pix/key'
import {
  effectiveProductPrice,
  type ProductPriceChannel,
} from '@/lib/product-pricing'
import {
  addonTotalFromCatalog,
  loadAddonCatalogForProducts,
  parseCheckoutAddons,
} from '@/lib/public-checkout-pricing.server'
import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  type MenuProductRow,
} from '@/lib/menu-product'

type CheckoutLine = {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  addons: ReturnType<typeof parseCheckoutAddons>
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function digitsOnlyPhone(s: string): string {
  return s.replace(/\D/g, '')
}

function friendlyOrderItemsError(raw: string | undefined): string {
  const m = raw?.trim() || ''
  if (/estoque insuficiente/i.test(m)) {
    const q = m.match(/Estoque insuficiente para "([^"]+)"/i)
    if (q?.[1]) {
      return `Stock insuficiente para «${q[1]}». Reduz a quantidade no carrinho.`
    }
    return 'Stock insuficiente para um dos produtos. Ajusta o carrinho e tenta de novo.'
  }
  return m || 'Erro ao guardar itens do pedido.'
}

function formatDeliveryAddressFromParts(parts: {
  rua: string
  quadra: string
  lote: string
  casa: string
  referencia: string
  bairro: string
}): string {
  return [
    `Rua: ${parts.rua}`,
    `Quadra: ${parts.quadra}`,
    `Lote: ${parts.lote}`,
    `Casa: ${parts.casa}`,
    `Ponto de referência: ${parts.referencia}`,
    `Bairro: ${parts.bairro}`,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const raw = body as Record<string, unknown>
    const slug = toText(raw.slug)
    const customerName = toText(raw.customerName) || null
    const customerPhoneRaw = toText(raw.customerPhone)
    const phoneDigits = digitsOnlyPhone(customerPhoneRaw)
    const rua = toText(raw.addressRua)
    const quadra = toText(raw.addressQuadra)
    const lote = toText(raw.addressLote)
    const casa = toText(raw.addressCasa)
    const referencia = toText(raw.addressReferencia)
    const bairro = toText(raw.addressBairro)
    const legacyAddress = toText(raw.deliveryAddress)

    let deliveryAddress: string | null = null
    if (rua && quadra && lote && casa && referencia && bairro) {
      deliveryAddress = formatDeliveryAddressFromParts({
        rua,
        quadra,
        lote,
        casa,
        referencia,
        bairro,
      })
    } else if (legacyAddress) {
      deliveryAddress = legacyAddress
    }

    const paymentMethod = toText(raw.paymentMethod) || null
    const notes = toText(raw.notes) || null
    const fulfillmentRaw = toText(raw.fulfillment).toLowerCase()
    const fulfillment: 'delivery' | 'pickup' | 'dine_in' =
      fulfillmentRaw === 'pickup'
        ? 'pickup'
        : fulfillmentRaw === 'dine_in'
          ? 'dine_in'
          : 'delivery'
    const tableMesa = toText(raw.table) || toText(raw.mesa)
    const normalizedDeliveryAddress =
      fulfillment === 'delivery'
        ? deliveryAddress
        : fulfillment === 'dine_in'
          ? 'Consumo no local (mesa)'
          : 'Retirada na loja'

    const itemsRaw = Array.isArray(raw.items) ? raw.items : []

    if (!slug) {
      return NextResponse.json({ error: 'Slug em falta.' }, { status: 400 })
    }
    if (!itemsRaw.length) {
      return NextResponse.json(
        { error: 'Adiciona pelo menos um item.' },
        { status: 400 }
      )
    }

    const items: CheckoutLine[] = itemsRaw
      .map((x) => {
        const o = x as Record<string, unknown>
        const productId = toText(o.productId)
        const name = toText(o.name) || 'Produto'
        const quantity = Number(o.quantity)
        const unitPrice = Number(o.unitPrice)
        const addons = parseCheckoutAddons(o.addons)
        return { productId, name, quantity, unitPrice, addons }
      })
      .filter(
        (x) =>
          !!x.productId &&
          x.quantity > 0 &&
          Number.isFinite(x.quantity) &&
          Number.isFinite(x.unitPrice) &&
          x.unitPrice >= 0
      )

    if (!items.length) {
      return NextResponse.json(
        { error: 'Itens do pedido inválidos.' },
        { status: 400 }
      )
    }

    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return NextResponse.json(
        { error: 'Indica um número de telefone válido (mínimo 10 dígitos).' },
        { status: 400 }
      )
    }

    if (fulfillment === 'delivery' && !deliveryAddress) {
      return NextResponse.json(
        {
          error:
            'Preenche o endereço completo: rua, quadra, lote, casa, ponto de referência e bairro.',
        },
        { status: 400 }
      )
    }

    if (fulfillment === 'dine_in') {
      const tableOk = tableMesa.trim().slice(0, 42)
      if (!tableOk) {
        return NextResponse.json(
          { error: 'Indica o número ou nome da mesa.' },
          { status: 400 }
        )
      }
      if (!toText(raw.customerName)) {
        return NextResponse.json(
          { error: 'Indica o teu nome para o pedido.' },
          { status: 400 }
        )
      }
    }

    const customerPhone = customerPhoneRaw || null

    const supabase =
      tryCreateServiceRoleClient() ?? (await createClient())
    const { data: store, error: storeErr } = await fetchStoreByPublicSlug(
      supabase,
      slug,
      'id, name, plan, plano, address, delivery_fee, delivery_free_above, delivery_max_km, store_geo_lat, store_geo_lng, auto_accept_orders, manual_closed, business_hours, auto_notify_new_order, salao_attendance_mode, operation_mode, pix_enabled, pix_key, pix_key_type, pix_receiver_name, pix_receiver_city'
    )

    if (storeErr || !store) {
      return NextResponse.json(
        { error: 'Loja não encontrada para este link.' },
        { status: 404 }
      )
    }

    const storeRow = store as StoreDeliveryConfig & {
      id: string
      name?: string | null
    }

    const priceChannel: ProductPriceChannel =
      fulfillment === 'dine_in' ? 'dine_in' : 'delivery'

    const productIds = [...new Set(items.map((l) => l.productId))]
    let productRows: Record<string, unknown>[] | null = null
    const pricedSelect = await supabase
      .from('products')
      .select(MENU_PRODUCT_SELECT)
      .eq('store_id', String(storeRow.id))
      .eq('active', true)
      .in('id', productIds)

    if (pricedSelect.error) {
      const fallback = await supabase
        .from('products')
        .select('*')
        .eq('store_id', String(storeRow.id))
        .eq('active', true)
        .in('id', productIds)
      if (fallback.error) {
        return NextResponse.json(
          { error: 'Não foi possível validar os preços dos produtos.' },
          { status: 503 }
        )
      }
      productRows = (fallback.data as Record<string, unknown>[]) ?? []
    } else {
      productRows = (pricedSelect.data as Record<string, unknown>[]) ?? []
    }

    const productById = new Map<string, MenuProductRow>()
    for (const raw of productRows ?? []) {
      const row = normalizeMenuProductRow(raw)
      if (row.id) productById.set(row.id, row)
    }

    const addonCatalog = await loadAddonCatalogForProducts(
      supabase,
      items.map((line) => line.productId)
    )

    const pricedItems: CheckoutLine[] = []
    for (const line of items) {
      const row = productById.get(line.productId)
      if (!row) {
        return NextResponse.json(
          { error: 'Um dos produtos do carrinho não está mais disponível.' },
          { status: 400 }
        )
      }
      const baseUnit = effectiveProductPrice(row, priceChannel)
      const catalog = addonCatalog.get(line.productId) ?? []
      const addonSum =
        line.addons.length > 0
          ? addonTotalFromCatalog(catalog, line.addons)
          : 0
      if (line.addons.length > 0 && !Number.isFinite(addonSum)) {
        return NextResponse.json(
          {
            error:
              'Um adicional do carrinho não está mais disponível. Atualiza o pedido e tenta de novo.',
          },
          { status: 409 }
        )
      }
      const serverUnit = Math.round((baseUnit + addonSum) * 100) / 100
      const clientUnit = Math.round(line.unitPrice * 100) / 100
      if (Math.abs(clientUnit - serverUnit) > 0.02) {
        return NextResponse.json(
          {
            error:
              'O preço de um item mudou. Atualiza o carrinho e tenta de novo.',
          },
          { status: 409 }
        )
      }
      pricedItems.push({
        productId: line.productId,
        name: row.name?.trim() || line.name,
        quantity: line.quantity,
        unitPrice: serverUnit,
        addons: line.addons,
      })
    }

    const subtotal = pricedItems.reduce(
      (sum, l) => sum + l.unitPrice * l.quantity,
      0
    )

    let deliveryCharge = 0
    if (fulfillment === 'delivery') {
      const deliveryLine = [
        rua,
        quadra && `Qd. ${quadra}`,
        lote && `Lt. ${lote}`,
        casa && `Casa ${casa}`,
        bairro,
        referencia,
      ]
        .filter(Boolean)
        .join(', ')

      const geoQuery =
        deliveryLine.trim().length >= 8
          ? deliveryLine
          : (deliveryAddress || '').trim()

      try {
        const zone = await evaluateDeliveryForCustomer(
          storeRow,
          geoQuery,
          subtotal
        )
        if (!zone.allowed) {
          return NextResponse.json(
            { error: zone.reason || 'Entrega não disponível para este endereço.' },
            { status: 400 }
          )
        }
        deliveryCharge = zone.deliveryCharge
      } catch {
        return NextResponse.json(
          {
            error:
              'Não foi possível validar a entrega. Tenta de novo ou contacta a loja.',
          },
          { status: 503 }
        )
      }
    }

    const plan = parsePlan(readStorePlano(storeRow as Record<string, unknown>))
    if (fulfillment === 'dine_in') {
      if (!publicDineInCheckoutAllowed(plan, storeRow as Record<string, unknown>)) {
        return NextResponse.json(
          {
            error:
              'Pedidos por QR de mesa não estão disponíveis para este plano ou configuração da loja.',
          },
          { status: 403 }
        )
      }
    }

    const orderStatus = 'pending'
    const orderSource = plan === 'START' ? 'site_start' : 'site_live'
    const total = Math.round((subtotal + deliveryCharge) * 100) / 100
    const itemsSummary = buildItemsSummaryWithLineTotals(
      pricedItems.map((l) => ({
        quantity: l.quantity,
        name: l.name,
        unit_price: l.unitPrice,
      }))
    )

    const orderNotes =
      fulfillment === 'dine_in'
        ? buildWaiterNotes(
            tableMesa.trim().slice(0, 42),
            'Salão',
            [String(notes ?? '').trim(), 'Pedido via QR (autoatendimento).'].filter(Boolean).join('\n'),
            0
          )
        : notes

    const insertSource =
      fulfillment === 'dine_in'
        ? 'autoatendimento'
        : fulfillment === 'pickup'
          ? 'site_pickup'
          : orderSource

    const deliveryFeeRow = fulfillment === 'delivery' ? deliveryCharge : 0

    const paymentMethodForOrder = fulfillment === 'dine_in' ? null : paymentMethod
    const paymentNorm = String(paymentMethodForOrder ?? '')
      .trim()
      .toLowerCase()
    const isPixPayment = paymentNorm === 'pix'

    const storeMetaEarly = storeRow as Record<string, unknown>
    const checkoutPlanEarly = parsePlan(readStorePlano(storeMetaEarly))
    if (isPixPayment && !hasPixCheckout(checkoutPlanEarly)) {
      return NextResponse.json(
        {
          error:
            'Pagamento PIX no checkout está disponível apenas no plano Pro. Escolhe cartão ou dinheiro.',
        },
        { status: 403 }
      )
    }
    if (isPixPayment && !storePixCheckoutEnabled(storeMetaEarly)) {
      return NextResponse.json(
        {
          error:
            'Esta loja ainda não activou o PIX no painel (Configurações). Escolhe outro método ou combina com a loja.',
        },
        { status: 400 }
      )
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        store_id: String(storeRow.id),
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: normalizedDeliveryAddress,
        delivery_fee: deliveryFeeRow,
        payment_method: paymentMethodForOrder,
        payment_status: isPixPayment ? 'pending' : null,
        notes: orderNotes,
        total,
        items_summary: itemsSummary,
        status: orderStatus,
        source: insertSource,
      })
      .select('id')
      .single()

    if (orderErr || !order?.id) {
      return NextResponse.json(
        { error: orderErr?.message || 'Não foi possível criar o pedido.' },
        { status: 500 }
      )
    }

    const rows = pricedItems.map((l) => ({
      order_id: String(order.id),
      product_id: l.productId,
      quantity: l.quantity,
      price: l.unitPrice,
      unit_price: l.unitPrice,
      name: l.name,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(rows)
    if (itemsErr) {
      if (
        itemsErr.message?.includes('order_items') ||
        itemsErr.message?.includes('does not exist')
      ) {
        return NextResponse.json({
          ok: true,
          orderId: String(order.id),
          mode: plan === 'START' ? 'history' : 'realtime',
          storeName: String(storeRow.name || ''),
          subtotal,
          deliveryCharge,
          orderTotal: total,
        })
      }
      await supabase.from('orders').delete().eq('id', order.id)
      const errText = friendlyOrderItemsError(itemsErr.message)
      const isStock = /stock insuficiente/i.test(errText)
      return NextResponse.json(
        { error: errText },
        { status: isStock ? 409 : 500 }
      )
    }

    const storeMeta = storeRow as Record<string, unknown>
    const checkoutPlan = parsePlan(readStorePlano(storeMeta))
    const checkoutAutomations = parseAutomationsFromStore(storeMeta)

    if (
      !isPixPayment &&
      checkoutAutomations.auto_accept_orders &&
      hasOrderPipelineAutomations(checkoutPlan)
    ) {
      const manualClosed = storeMeta.manual_closed === true
      if (!manualClosed) {
        await supabase
          .from('orders')
          .update({ status: 'preparing' })
          .eq('id', order.id)
          .eq('store_id', String(storeRow.id))
          .eq('status', 'pending')
      }
    }

    if (
      !isPixPayment &&
      hasOrderPipelineAutomations(checkoutPlan) &&
      checkoutAutomations.auto_notify_new_order
    ) {
      void sendWebPushNewOrder({
        storeId: String(storeRow.id),
        storeName: String(storeRow.name || ''),
        orderId: String(order.id),
        customerName,
      })
    }

    if (!isPixPayment) {
      void tryAutoThermalPrint(supabase, {
        storeId: String(storeRow.id),
        orderId: String(order.id),
        orderSource: insertSource,
      })
    }

    let pix: Awaited<ReturnType<typeof buildPixChargeForOrder>> = null
    if (isPixPayment) {
      pix = await buildPixChargeForOrder({
        store: storeMeta,
        orderId: String(order.id),
        amount: total,
        infoAdicional: `Pedido ${String(order.id).slice(0, 8)}`,
      })
      if (pix?.pixPayload) {
        const { error: pixUpdateErr } = await supabase
          .from('orders')
          .update({ pix_payload: pix.pixPayload })
          .eq('id', order.id)
          .eq('store_id', String(storeRow.id))
        if (pixUpdateErr && !pixUpdateErr.message?.includes('pix_payload')) {
          console.warn('[checkout] pix_payload update', pixUpdateErr.message)
        }
      }
      if (!pix?.copyPaste || !pix.qrCodeDataUrl) {
        await supabase.from('order_items').delete().eq('order_id', order.id)
        await supabase.from('orders').delete().eq('id', order.id)
        return NextResponse.json(
          { error: 'Não foi possível gerar o QR Code PIX. Escolhe outro pagamento ou tenta de novo.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      orderId: String(order.id),
      mode: plan === 'START' ? 'history' : 'realtime',
      storeName: String(storeRow.name || ''),
      subtotal,
      deliveryCharge,
      orderTotal: total,
      ...(pix
        ? {
            pix: {
              copyPaste: pix.copyPaste,
              qrCodeDataUrl: pix.qrCodeDataUrl,
              amount: pix.amount,
              receiverName: pix.receiverName,
            },
          }
        : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
