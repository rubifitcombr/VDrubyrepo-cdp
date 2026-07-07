import { getUser } from '@/services/auth.server'
import { buildSignedContractPdfResponse } from '@/services/annual-contract-document.server'
import { getStoreByUser } from '@/services/store.server'
import { NextResponse } from 'next/server'

export async function GET() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object') {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  return buildSignedContractPdfResponse(store as Record<string, unknown>)
}
