import { test, expect } from '@playwright/test'
import {
  closeOpenCaixaTurnoIfAny,
  countOkResponses,
  countStatus,
  dismissOpenComandasBlockingCaixaClose,
  ensureOpenCaixaTurno,
  E2E_STORE_ID,
  getSupabaseAdmin,
  readE2eTestData,
} from './helpers'

test.describe('Grupo A #1 — fechar turno de caixa', () => {
  test('duas requisições concorrentes: só uma fecha o turno', async ({ request }) => {
    const data = readE2eTestData()
    await dismissOpenComandasBlockingCaixaClose(E2E_STORE_ID)
    await closeOpenCaixaTurnoIfAny()
    const turnoId = await ensureOpenCaixaTurno(request, data)

    const payload = {
      turnoId,
      informadoDinheiro: 0,
      informadoPix: 0,
      informadoCartao: 0,
      informadoCredito: 0,
      fundoProximoTurno: 0,
    }

    const [r1, r2] = await Promise.all([
      request.post('/api/cashier/turno/close', { data: payload }),
      request.post('/api/cashier/turno/close', { data: payload }),
    ])

    if (countOkResponses([r1, r2]) !== 1) {
      const bodies = await Promise.all([r1.text(), r2.text()])
      throw new Error(
        `Esperado 1 sucesso; status ${r1.status()}/${r2.status()}: ${bodies[0]} | ${bodies[1]}`
      )
    }
    expect(countStatus([r1, r2], 409)).toBe(1)

    const sb = getSupabaseAdmin()
    const { data: turno } = await sb
      .from('caixas_turnos')
      .select('status')
      .eq('id', turnoId)
      .single()

    expect(String(turno?.status)).toBe('fechado')
  })
})
