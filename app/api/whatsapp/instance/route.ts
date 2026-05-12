import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { gateMerchantMenuKey } from '@/lib/merchant-api-gate.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import {
  deleteEvolutionInstance,
  ensureEvolutionInstance,
  syncEvolutionWebhook,
  getEvolutionConnectionState,
  getEvolutionQrCode,
  getStoreEvolutionInstanceName,
  logoutEvolutionInstance,
  waitForEvolutionConnectionState,
} from '@/services/evolution-api.server'

export const dynamic = 'force-dynamic'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getQrWithRetry(
  instanceName: string,
  attempts: number = 5,
  delayMs: number = 700
): Promise<string | null> {
  for (let i = 0; i < attempts; i += 1) {
    const qr = await getEvolutionQrCode(instanceName)
    if (qr) return qr
    if (i < attempts - 1) await sleep(delayMs)
  }
  return null
}

async function ensureMerchantStore(reqStoreId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Sessão necessária.' },
        { status: 401 }
      ),
    }
  }

  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return { ok: false as const, response: gate.response }

  if (reqStoreId !== gate.ctx.storeId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Acesso negado à loja.' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true as const,
    storeId: gate.ctx.storeId,
    store: gate.ctx.store,
    userEmail: user.email,
  }
}

export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId')?.trim() || ''
    const includeQr = req.nextUrl.searchParams.get('includeQr') === '1'
    if (!storeId) {
      return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
    }

    const owned = await ensureMerchantStore(storeId)
    if (!owned.ok) return owned.response

    const menuDeny = gateMerchantMenuKey(owned.store, owned.userEmail, 'automacoes')
    if (menuDeny) return menuDeny

    const instanceName = getStoreEvolutionInstanceName(owned.storeId)
    await ensureEvolutionInstance(instanceName)
    await syncEvolutionWebhook(instanceName)
    const connectionState = await getEvolutionConnectionState(instanceName)
    const qrCode =
      includeQr && connectionState !== 'open'
        ? await getQrWithRetry(instanceName)
        : null

    return NextResponse.json({
      instanceName,
      connectionState,
      qrCode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      storeId?: string
      action?: string
    }
    const storeId = body.storeId?.trim() || ''
    const action = body.action?.trim() || 'connect'

    if (!storeId) {
      return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
    }

    const owned = await ensureMerchantStore(storeId)
    if (!owned.ok) return owned.response

    const menuDeny = gateMerchantMenuKey(owned.store, owned.userEmail, 'automacoes')
    if (menuDeny) return menuDeny

    const instanceName = getStoreEvolutionInstanceName(owned.storeId)

    if (action === 'logout') {
      await logoutEvolutionInstance(instanceName)
      const connectionState = await waitForEvolutionConnectionState(instanceName, [
        'close',
        'closed',
        'unknown',
      ])
      return NextResponse.json({
        instanceName,
        connectionState,
        qrCode: null,
      })
    }

    if (action === 'delete') {
      await deleteEvolutionInstance(instanceName)
      await waitForEvolutionConnectionState(instanceName, ['close', 'closed', 'unknown'], 4, 400)
      return NextResponse.json({
        instanceName,
        connectionState: 'close',
        qrCode: null,
      })
    }

    if (action !== 'connect') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
    }

    await ensureEvolutionInstance(instanceName)
    await syncEvolutionWebhook(instanceName)

    const qrCode = await getQrWithRetry(instanceName)
    const connectionState = await getEvolutionConnectionState(instanceName)

    return NextResponse.json({
      instanceName,
      connectionState,
      qrCode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
