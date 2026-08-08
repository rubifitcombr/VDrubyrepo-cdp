import { test, expect } from './test-with-teardown'
import {
  countOkResponses,
  countStatus,
  ensureOpenCaixaTurno,
  E2E_STORE_ID,
  getSupabaseAdmin,
  readE2eTestData,
  withStoreOperationMode,
} from './helpers'
import {
  trackCaixaMovimentacaoForTeardown,
  trackEntregaForTeardown,
  trackOrderForTeardown,
} from './teardown'

test.describe('Grupo A #2 — acerto de entregador', () => {
  test('duas requisições concorrentes: só uma acerta a entrega', async ({ request }) => {
    const data = readE2eTestData()
    const sb = getSupabaseAdmin()

    await withStoreOperationMode(E2E_STORE_ID, 'hibrido', async () => {
      await ensureOpenCaixaTurno(request, data)

      const orderId = crypto.randomUUID()
      const entregaId = crypto.randomUUID()

      const { error: orderErr } = await sb.from('orders').insert({
        id: orderId,
        store_id: E2E_STORE_ID,
        customer_name: 'E2E Concurrency Entrega',
        status: 'delivered',
        source: 'menu_link',
        total: 25,
        payment_method: 'pix',
        delivery_address: 'Rua Teste 1',
      })
      expect(orderErr).toBeNull()
      trackOrderForTeardown(orderId)
      trackEntregaForTeardown(entregaId)

      const { error: entregaErr } = await sb.from('entregas').insert({
        id: entregaId,
        store_id: E2E_STORE_ID,
        order_id: orderId,
        entregador_nome: 'E2E Rider',
        valor_corrida: 8,
        valor_recebido_cliente: 0,
      })
      expect(entregaErr).toBeNull()

      const body = {
        entregaIds: [entregaId],
        entregadorNome: 'E2E Rider',
        valor: 8,
        forma: 'dinheiro',
      }

      const [r1, r2] = await Promise.all([
        request.post('/api/delivery-ops/settlement', { data: body }),
        request.post('/api/delivery-ops/settlement', { data: body }),
      ])

      if (countOkResponses([r1, r2]) !== 1) {
        const bodies = await Promise.all([r1.text(), r2.text()])
        throw new Error(
          `Esperado 1 sucesso; status ${r1.status()}/${r2.status()}: ${bodies[0]} | ${bodies[1]}`
        )
      }
      expect(countStatus([r1, r2], 409)).toBe(1)

      const { data: entrega } = await sb
        .from('entregas')
        .select('acertado_em, acerto_movimentacao_id')
        .eq('id', entregaId)
        .single()

      expect(entrega?.acertado_em).toBeTruthy()
      expect(entrega?.acerto_movimentacao_id).toBeTruthy()
      trackCaixaMovimentacaoForTeardown(entrega!.acerto_movimentacao_id!)

      const { count: movForEntrega } = await sb
        .from('caixa_movimentacoes')
        .select('id', { count: 'exact', head: true })
        .eq('id', entrega!.acerto_movimentacao_id!)

      expect(movForEntrega).toBe(1)

      await sb
        .from('caixa_movimentacoes')
        .delete()
        .eq('id', entrega!.acerto_movimentacao_id!)
      await sb.from('entregas').delete().eq('id', entregaId)
      await sb.from('orders').delete().eq('id', orderId)
    })
  })
})
