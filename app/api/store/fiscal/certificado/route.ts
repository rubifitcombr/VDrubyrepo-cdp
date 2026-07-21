import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { uploadCertificado } from '@/services/fiscal'

const MAX_PFX_BYTES = 1_000_000 // certificados A1 têm poucos KB.

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Envie o certificado como multipart/form-data.' }, { status: 400 })
  }

  const storeId = String(form.get('storeId') ?? '').trim()
  const senha = String(form.get('senha') ?? '').trim()
  const file = form.get('file')

  if (!storeId) {
    return NextResponse.json({ error: 'storeId é obrigatório.' }, { status: 400 })
  }
  if (!senha) {
    return NextResponse.json({ error: 'Informe a senha do certificado.' }, { status: 400 })
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Anexe o arquivo .pfx/.p12.' }, { status: 400 })
  }
  if (file.size > MAX_PFX_BYTES) {
    return NextResponse.json({ error: 'Arquivo muito grande para um certificado A1.' }, { status: 400 })
  }
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.pfx') && !lower.endsWith('.p12')) {
    return NextResponse.json({ error: 'Formato inválido: use .pfx ou .p12 (A1).' }, { status: 400 })
  }
  if (storeId !== gate.ctx.storeId) {
    return NextResponse.json({ error: 'Acesso negado à loja.' }, { status: 403 })
  }

  // O .pfx só vive em memória: converte para base64 e repassa ao gateway.
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const result = await uploadCertificado({ storeId, base64, senha })

  if (!result.ok) {
    return NextResponse.json({ error: result.motivo || 'Falha ao enviar o certificado.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, cn: result.cn, validade: result.validade })
}
