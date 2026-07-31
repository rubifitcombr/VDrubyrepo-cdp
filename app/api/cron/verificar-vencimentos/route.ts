import { NextResponse } from 'next/server'
import { runMarketingDispatchJob } from '@/jobs/marketing-dispatch.server'
import { runVerificarVencimentosJob } from '@/jobs/verificarVencimentos.server'

export const dynamic = 'force-dynamic'

/**
 * Agendar diariamente (ex.: Vercel Cron) com header Authorization: Bearer CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 })
  }

  try {
    await runVerificarVencimentosJob()
    const marketing = await runMarketingDispatchJob().catch((e) => {
      console.warn('[cron verificar-vencimentos] marketing dispatch', e)
      return { processed: 0, sent: 0, failed: 0 }
    })
    return NextResponse.json({ ok: true, marketing })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    console.error('[cron verificar-vencimentos]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
