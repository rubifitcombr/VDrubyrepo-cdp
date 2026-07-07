import { NextResponse } from 'next/server'
import { requiresAnnualContractAcceptance } from '@/lib/annual-contract-acceptance'
import { getUser } from '@/services/auth.server'
import { acceptAnnualContract } from '@/services/annual-contract-accept.server'
import { getStoreByUser } from '@/services/store.server'

const MAX_SIGNATURE_CHARS = 280_000

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || null
}

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: {
    aceite_termos?: boolean
    aceite_compromisso_12m?: boolean
    aceite_representante_legal?: boolean
    assinatura_nome?: string
    assinatura_png?: string
    documento_tipo?: string
    documento_numero?: string
    representante_cargo?: string
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const assinaturaPng = String(body.assinatura_png || '').trim()
  if (
    !assinaturaPng.startsWith('data:image/png;base64,') ||
    assinaturaPng.length > MAX_SIGNATURE_CHARS
  ) {
    return NextResponse.json(
      { error: 'Assinatura electrónica inválida. Desenhe novamente no quadro.' },
      { status: 400 }
    )
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object') {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 })
  }

  const row = store as Record<string, unknown>
  if (!requiresAnnualContractAcceptance(row)) {
    return NextResponse.json({ error: 'Não há contrato pendente de aceite.' }, { status: 400 })
  }

  const documentoTipoRaw = String(body.documento_tipo || '').trim().toLowerCase()
  if (documentoTipoRaw !== 'cpf' && documentoTipoRaw !== 'cnpj') {
    return NextResponse.json({ error: 'Tipo de documento inválido.' }, { status: 400 })
  }

  const result = await acceptAnnualContract({
    store: row,
    userId: user.id,
    userEmail: user.email ?? null,
    aceiteTermos: body.aceite_termos === true,
    aceiteCompromisso12m: body.aceite_compromisso_12m === true,
    aceiteRepresentanteLegal: body.aceite_representante_legal === true,
    assinaturaNome: String(body.assinatura_nome || ''),
    assinaturaPng,
    documentoTipo: documentoTipoRaw,
    documentoNumero: String(body.documento_numero || ''),
    representanteCargo: String(body.representante_cargo || ''),
    ipAddress: clientIp(req),
    userAgent: req.headers.get('user-agent'),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    ok: true,
    documentoHash: result.documentoHash,
    pdfDisponivel: Boolean(result.pdfPath),
  })
}
