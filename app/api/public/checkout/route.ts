import { NextRequest, NextResponse } from 'next/server'
import { createPublicAnonClient } from '@/lib/supabase/public.server'
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitResponse,
} from '@/lib/rate-limit.server'
import { fetchPublicStoreForSlugPage } from '@/lib/store-public-slug.server'
import {
  evaluateDeliveryForCustomer,
  type StoreDeliveryConfig,
} from '@/lib/delivery-zone.server'
import { hasFeature, hasOrderPipelineAutomations, hasPixCheckout } from '@/lib/plan'
import { effectiveStorePlan } from '@/lib/effective-plan.server'
import { readStorePlano } from '@/lib/store-columns'
import { publicDineInCheckoutAllowed } from '@/lib/salao-attendance'
import {
  isDeliveryPipelineEnabled,
  parseOperationModeFromStore,
} from '@/lib/merchant-operation-mode'
import { parseAutomationsFromStore } from '@/lib/store-automations'
import { sendWebPushNewOrder } from '@/services/web-push.server'
import {
  buildWaiterNotes,
  resolveDineInSectorForTable,
  tableNamesMatch,
} from '@/lib/waiter-order-notes'
import {
  STORE_TABLES_SELECT,
  mapActiveStoreTableRows,
} from '@/lib/store-tables'
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
  getStoreOpenState,
  publicStoreOrdersBlockedMessage,
} from '@/lib/business-hours'
import { insertPublicCheckoutOrder } from '@/services/public-checkout-order.server'
import { issueCheckoutAccessToken } from '@/lib/checkout-access-token.server'
import { acceptPublicOrderIfPending } from '@/lib/public-order-auto-accept'
import { createPublicCheckoutDbClient } from '@/lib/supabase/public-checkout-db.server'
import {
  notifyOrderWhatsAppReceived,
  notifyOrderWhatsAppStatusChange,
} from '@/services/order-whatsapp-notifications.server'
import {
  getOrCreateLoyaltyConfig,
  redeemLoyaltyPointsForCheckout,
} from '@/services/loyalty.server'
import { syncWhatsAppContactFromOrder } from '@/services/whatsapp-contacts.server'
import { resolveRedeemPoints } from '@/lib/loyalty/utils'
import { resolveSalonTableForStore } from '@/lib/salon-table-resolve.server'
import {
  recordCouponRedemption,
  validateCheckoutCoupon,
} from '@/services/promo-coupon.server'
import {
  MENU_PRODUCT_SELECT,
  normalizeMenuProductRow,
  type MenuProductRow,
} from '@/lib/menu-product'
import { filterPublicMenuProducts, isSoldByWeight } from '@/lib/weighable-product'
import {
  decrementProductStockForLines,
  validateProductStockForLines,
} from '@/services/inventory.server'

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
    const ip = clientIpFromRequest(req)
    const rl = checkRateLimit(ip, 'checkout', 15, 60_000)
    if (!rl.ok) {
      return rateLimitResponse(
        rl.retryAfterSec,
        rl.guard?.message,
        rl.guard?.status === 403 ? 403 : 429
      )
    }

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
    const tableSetorHint = toText(raw.setor) || toText(raw.sector)
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

    const supabase = createPublicAnonClient()
    const checkoutDb = createPublicCheckoutDbClient(supabase)
    const { data: store, error: storeErr } = await fetchPublicStoreForSlugPage(
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
      manual_closed?: boolean | null
      business_hours?: unknown
    }

    const { open: storeAcceptsOrders, mode: storeHoursMode } = getStoreOpenState(
      storeRow.business_hours,
      { manualClosed: storeRow.manual_closed === true }
    )
    if (!storeAcceptsOrders) {
      return NextResponse.json(
        { error: publicStoreOrdersBlockedMessage(storeHoursMode) },
        { status: 403 }
      )
    }

    const operationMode = parseOperationModeFromStore(
      storeRow as Record<string, unknown>
    )
    if (fulfillment === 'delivery' && !isDeliveryPipelineEnabled(operationMode)) {
      return NextResponse.json(
        {
          error:
            'Esta loja opera só em modo presencial. Usa o QR de mesa ou a retirada no local.',
        },
        { status: 403 }
      )
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
      const row = normalizeMenuProductRow(raw, String(storeRow.id))
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
      if (isSoldByWeight(row)) {
        return NextResponse.json(
          {
            error:
              'Produtos vendidos por peso não estão disponíveis no checkout online.',
          },
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

    const plan = effectiveStorePlan(readStorePlano(storeRow as Record<string, unknown>))
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

    let promoCouponCode: string | null = null
    let promoDiscountBrl = 0
    let couponPromotionId: string | null = null
    const couponCodeRaw = toText(raw.couponCode)

    if (couponCodeRaw) {
      const couponResult = await validateCheckoutCoupon(checkoutDb, {
        storeId: String(storeRow.id),
        code: couponCodeRaw,
        orderSubtotal: subtotal,
        fulfillment,
        customerPhone: phoneDigits,
      })
      if (!couponResult.ok) {
        return NextResponse.json(
          { error: couponResult.error },
          { status: couponResult.status }
        )
      }
      if (couponResult.freeShipping) {
        if (fulfillment === 'delivery') {
          deliveryCharge = 0
        }
      } else {
        promoCouponCode = couponResult.code
        promoDiscountBrl = couponResult.discountBrl
        couponPromotionId = couponResult.promotionId
      }
    }

    const grossTotal = Math.round((subtotal + deliveryCharge) * 100) / 100
    const grossAfterCoupon = Math.max(
      0,
      Math.round((grossTotal - promoDiscountBrl) * 100) / 100
    )

    let loyaltyRedeemPoints = 0
    let loyaltyDiscountBrl = 0
    let loyaltyPointsPerRealSnapshot: number | null = null

    const loyaltyPointsRequested = Math.max(
      0,
      Math.floor(Number(raw.loyaltyPointsRedeem) || 0)
    )

    if (loyaltyPointsRequested > 0 && hasFeature(plan, 'loyalty')) {
      const loyaltyConfig = await getOrCreateLoyaltyConfig(
        checkoutDb,
        String(storeRow.id)
      )
      if (!loyaltyConfig.enabled) {
        return NextResponse.json(
          { error: 'Programa de fidelidade não está ativo.' },
          { status: 400 }
        )
      }

      const { data: loyaltyAccount } = await checkoutDb
        .from('loyalty_accounts')
        .select('points_balance')
        .eq('store_id', String(storeRow.id))
        .eq('customer_phone', phoneDigits)
        .maybeSingle()

      const balance = Number(
        (loyaltyAccount as { points_balance?: number } | null)?.points_balance ?? 0
      )
      const resolved = resolveRedeemPoints(
        loyaltyConfig,
        balance,
        grossAfterCoupon,
        loyaltyPointsRequested
      )

      if (resolved.points <= 0) {
        return NextResponse.json(
          {
            error: `Não foi possível resgatar pontos. Mínimo: ${loyaltyConfig.min_redeem_points} pts.`,
          },
          { status: 400 }
        )
      }

      loyaltyRedeemPoints = resolved.points
      loyaltyDiscountBrl = resolved.discountBrl
    }

    if (hasFeature(plan, 'loyalty') && phoneDigits.length >= 10) {
      const earnConfig = await getOrCreateLoyaltyConfig(
        checkoutDb,
        String(storeRow.id)
      )
      if (earnConfig.enabled) {
        loyaltyPointsPerRealSnapshot = earnConfig.points_per_real
      }
    }

    const total = Math.max(
      0,
      Math.round((grossAfterCoupon - loyaltyDiscountBrl) * 100) / 100
    )
    const itemsSummary = buildItemsSummaryWithLineTotals(
      pricedItems.map((l) => ({
        quantity: l.quantity,
        name: l.name,
        unit_price: l.unitPrice,
      }))
    )

    let dineInSector = 'Salão'
    let salonTableId: string | null = null
    if (fulfillment === 'dine_in') {
      const tableLabel = tableMesa.trim().slice(0, 42)
      const { data: tableRows } = await checkoutDb
        .from('store_tables')
        .select(STORE_TABLES_SELECT)
        .eq('store_id', String(storeRow.id))

      const configured = mapActiveStoreTableRows(
        (tableRows as Record<string, unknown>[] | null) ?? []
      ).map((t) => ({ name: t.name, ambiente: t.ambiente }))

      dineInSector = resolveDineInSectorForTable(
        tableLabel,
        configured,
        tableSetorHint
      )

      if (configured.length === 0) {
        return NextResponse.json(
          {
            error:
              'Pedido no salão indisponível. Esta loja ainda não configurou mesas no painel.',
          },
          { status: 400 }
        )
      }

      // Se a loja tem mesas configuradas, a mesa digitada tem de existir no mapa.
      if (
        configured.length > 0 &&
        !configured.some((t) => tableNamesMatch(tableLabel, t.name))
      ) {
        return NextResponse.json(
          {
            error:
              'Mesa não encontrada. Confirma o número/nome exactamente como está no salão (ex.: 12 ou Mesa 12).',
          },
          { status: 400 }
        )
      }

      const resolvedTable = await resolveSalonTableForStore(
        checkoutDb,
        String(storeRow.id),
        tableLabel,
        tableSetorHint || dineInSector
      )
      if (resolvedTable.ambiguous) {
        return NextResponse.json(
          {
            error:
              'Mesa ambígua: existem várias mesas com este nome. Abre o QR da mesa correcta ou indica o setor (Salão, Varanda, etc.).',
          },
          { status: 400 }
        )
      }
      salonTableId = resolvedTable.tableId
      dineInSector = resolvedTable.sector
    }

    const orderNotes =
      fulfillment === 'dine_in'
        ? buildWaiterNotes(
            tableMesa.trim().slice(0, 42),
            dineInSector,
            [String(notes ?? '').trim(), 'Pedido via QR (autoatendimento).'].filter(Boolean).join('\n'),
            0
          )
        : loyaltyDiscountBrl > 0
          ? [notes, `[Fidelidade] −R$ ${loyaltyDiscountBrl.toFixed(2)} (${loyaltyRedeemPoints} pts)`]
              .filter((x) => String(x ?? '').trim())
              .join('\n')
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

    const stockLines = pricedItems.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      name: l.name,
    }))

    const stockValidation = await validateProductStockForLines(
      checkoutDb,
      String(storeRow.id),
      stockLines
    )
    if (!stockValidation.ok) {
      return NextResponse.json(
        { error: friendlyOrderItemsError(stockValidation.error) },
        { status: 409 }
      )
    }

    const storeMetaEarly = storeRow as Record<string, unknown>
    const checkoutPlanEarly = effectiveStorePlan(readStorePlano(storeMetaEarly))
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

    const created = await insertPublicCheckoutOrder(
      supabase,
      {
        store_id: String(storeRow.id),
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: normalizedDeliveryAddress,
        delivery_fee: deliveryFeeRow,
        payment_method: paymentMethodForOrder,
        payment_status: isPixPayment ? 'pending' : null,
        notes: orderNotes,
        total,
        loyalty_redeem_points: loyaltyRedeemPoints,
        loyalty_discount_brl: loyaltyDiscountBrl,
        loyalty_points_per_real_snapshot: loyaltyPointsPerRealSnapshot,
        promo_coupon_code: promoCouponCode,
        promo_discount_brl: promoDiscountBrl,
        salon_table_id: fulfillment === 'dine_in' ? salonTableId : null,
        salon_table_sector: fulfillment === 'dine_in' ? dineInSector : null,
        items_summary: itemsSummary,
        status: orderStatus,
        source: insertSource,
      },
      pricedItems.map((l) => ({
        product_id: l.productId,
        quantity: l.quantity,
        price: l.unitPrice,
        unit_price: l.unitPrice,
        name: l.name,
      }))
    )

    if (!created.ok) {
      if (created.missingOrderItemsTable) {
        return NextResponse.json(
          {
            error:
              'O pedido não pôde ser registado com os itens. Contacta a loja ou tenta novamente dentro de momentos.',
          },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: created.error }, { status: 500 })
    }

    const order = { id: created.orderId }

    const stockResult = await decrementProductStockForLines(
      checkoutDb,
      String(storeRow.id),
      stockLines
    )
    if (!stockResult.ok) {
      await checkoutDb.from('order_items').delete().eq('order_id', order.id)
      await checkoutDb.from('orders').delete().eq('id', order.id)
      return NextResponse.json(
        { error: friendlyOrderItemsError(stockResult.error) },
        { status: 409 }
      )
    }

    if (couponPromotionId && promoCouponCode) {
      void recordCouponRedemption(checkoutDb, {
        storeId: String(storeRow.id),
        promotionId: couponPromotionId,
        couponCode: promoCouponCode,
        orderId: String(order.id),
        customerPhone: phoneDigits,
      }).catch((e) => console.warn('[promo coupon] redemption', e))
    }

    if (customerPhone) {
      void syncWhatsAppContactFromOrder(checkoutDb, {
        store_id: String(storeRow.id),
        customer_phone: customerPhone,
        customer_name: customerName,
        order_at: new Date().toISOString(),
      }).catch((e) => console.warn('[whatsapp contact sync]', e))
    }

    if (loyaltyRedeemPoints > 0) {
      try {
        await redeemLoyaltyPointsForCheckout(checkoutDb, {
          store_id: String(storeRow.id),
          order_id: String(order.id),
          customer_phone: phoneDigits,
          customer_name: customerName,
          order_total_before_discount: grossAfterCoupon,
          requested_points: loyaltyRedeemPoints,
        })
      } catch (loyaltyErr) {
        await checkoutDb.from('order_items').delete().eq('order_id', order.id)
        await checkoutDb.from('orders').delete().eq('id', order.id)
        const msg =
          loyaltyErr instanceof Error
            ? loyaltyErr.message
            : 'Falha ao resgatar pontos.'
        return NextResponse.json({ error: msg }, { status: 400 })
      }
    }

    const storeMeta = storeRow as Record<string, unknown>
    const checkoutPlan = effectiveStorePlan(readStorePlano(storeMeta))
    const checkoutAutomations = parseAutomationsFromStore(storeMeta)

    let orderAutoAccepted = false
    if (
      !isPixPayment &&
      checkoutAutomations.auto_accept_orders &&
      hasOrderPipelineAutomations(checkoutPlan)
    ) {
      const manualClosed = storeMeta.manual_closed === true
      if (!manualClosed) {
        orderAutoAccepted = await acceptPublicOrderIfPending(
          checkoutDb,
          String(storeRow.id),
          String(order.id)
        )
      }
    }

    const waNotifyOrder = {
      id: String(order.id),
      customer_phone: customerPhone,
      customer_name: customerName,
      delivery_address: normalizedDeliveryAddress,
      source: insertSource,
    }
    const autoAccepted =
      !isPixPayment &&
      checkoutAutomations.auto_accept_orders &&
      hasOrderPipelineAutomations(checkoutPlan) &&
      storeMeta.manual_closed !== true &&
      orderAutoAccepted

    if (autoAccepted) {
      void notifyOrderWhatsAppStatusChange(
        checkoutDb,
        String(storeRow.id),
        waNotifyOrder,
        'pending',
        'preparing'
      ).catch((e) => console.warn('[order whatsapp notify]', e))
    } else {
      void notifyOrderWhatsAppReceived(
        checkoutDb,
        String(storeRow.id),
        waNotifyOrder
      ).catch((e) => console.warn('[order whatsapp notify]', e))
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
      void tryAutoThermalPrint({
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
        const { error: pixUpdateErr } = await checkoutDb
          .from('orders')
          .update({ pix_payload: pix.pixPayload })
          .eq('id', order.id)
          .eq('store_id', String(storeRow.id))
        if (pixUpdateErr && !pixUpdateErr.message?.includes('pix_payload')) {
          console.warn('[checkout] pix_payload update', pixUpdateErr.message)
        }
      }
      if (!pix?.copyPaste || !pix.qrCodeDataUrl) {
        await checkoutDb.from('order_items').delete().eq('order_id', order.id)
        await checkoutDb.from('orders').delete().eq('id', order.id)
        return NextResponse.json(
          { error: 'Não foi possível gerar o QR Code PIX. Escolhe outro pagamento ou tenta de novo.' },
          { status: 500 }
        )
      }
    }

    const accessToken =
      isPixPayment ? issueCheckoutAccessToken(slug, String(order.id)) : undefined

    return NextResponse.json({
      ok: true,
      orderId: String(order.id),
      ...(accessToken ? { accessToken } : {}),
      mode: plan === 'START' ? 'history' : 'realtime',
      storeName: String(storeRow.name || ''),
      subtotal,
      deliveryCharge,
      promoDiscount: promoDiscountBrl,
      loyaltyDiscount: loyaltyDiscountBrl,
      loyaltyPointsRedeemed: loyaltyRedeemPoints,
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
