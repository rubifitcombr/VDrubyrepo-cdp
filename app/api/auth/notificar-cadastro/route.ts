import { NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { notificarAdminNovoCadastro } from '@/services/notificar-admin.server'

export const dynamic = 'force-dynamic'

/** Chamado após registo com sessão ativa — avisa o admin por email. */
export async function POST() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object') {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  const row = store as Record<string, unknown>
  const nomeLoja = String(row.name ?? '—')
  const telefone =
    typeof row.phone === 'string' && row.phone.trim()
      ? row.phone.trim()
      : null

  await notificarAdminNovoCadastro({
    nomeLoja,
    email: user.email ?? '—',
    telefone,
    cadastradoEm: new Date(),
  })

  return NextResponse.json({ ok: true })
}
