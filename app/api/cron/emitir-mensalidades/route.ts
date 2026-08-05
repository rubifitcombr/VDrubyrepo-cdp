import { NextResponse } from 'next/server'
import { emitMonthlyInvoicesJob } from '@/services/subscription-billing.server'

export const dynamic = 'force-dynamic'

/** Dia 1 de cada mês — emite faturas PIX para lojas ativas. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 })
  }

  try {
    const result = await emitMonthlyInvoicesJob()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    console.error('[cron emitir-mensalidades]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
