import { NextResponse } from 'next/server'
import { runMarketingDispatchJob } from '@/jobs/marketing-dispatch.server'

export const dynamic = 'force-dynamic'

/** A cada 5 min — dispara campanhas de marketing agendadas (plano Master). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 })
  }

  try {
    const result = await runMarketingDispatchJob()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    console.error('[cron marketing-dispatch]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
