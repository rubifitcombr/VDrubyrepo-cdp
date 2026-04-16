import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  deleteEvolutionInstance,
  ensureEvolutionInstance,
  getEvolutionConnectionState,
  getEvolutionQrCode,
  getStoreEvolutionInstanceName,
  logoutEvolutionInstance,
  waitForEvolutionConnectionState,
} from '@/services/evolution-api.server'

export const dynamic = 'force-dynamic'

async function getOwnedStoreId(storeId: string): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('owner_id', user.id)
    .maybeSingle()

  return store?.id ? String(store.id) : null
}

export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get('storeId')?.trim() || ''
    const includeQr = req.nextUrl.searchParams.get('includeQr') === '1'
    if (!storeId) {
      return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
    }

    const ownedStoreId = await getOwnedStoreId(storeId)
    if (!ownedStoreId) {
      return NextResponse.json({ error: 'Acesso negado à loja.' }, { status: 403 })
    }

    const instanceName = getStoreEvolutionInstanceName(ownedStoreId)
    await ensureEvolutionInstance(instanceName)
    const connectionState = await getEvolutionConnectionState(instanceName)
    const qrCode =
      includeQr && connectionState !== 'open'
        ? await getEvolutionQrCode(instanceName)
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

    const ownedStoreId = await getOwnedStoreId(storeId)
    if (!ownedStoreId) {
      return NextResponse.json({ error: 'Acesso negado à loja.' }, { status: 403 })
    }

    const instanceName = getStoreEvolutionInstanceName(ownedStoreId)

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

    const qrCode = await getEvolutionQrCode(instanceName)
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
