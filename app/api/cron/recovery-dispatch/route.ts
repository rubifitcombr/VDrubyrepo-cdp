import { NextResponse } from 'next/server'
import { runRecoveryDispatchJob } from '@/jobs/recovery-dispatch.server'

export const dynamic = 'force-dynamic'

/** Diário — envia recuperação automática para clientes inactivos (plano Master). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 })
  }

  try {
    const result = await runRecoveryDispatchJob()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    console.error('[cron recovery-dispatch]', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
