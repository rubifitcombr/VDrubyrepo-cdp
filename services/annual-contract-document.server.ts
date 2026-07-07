import 'server-only'

import { readContractAcceptance } from '@/lib/annual-contract-acceptance'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import { NextResponse } from 'next/server'

export async function buildSignedContractPdfResponse(
  store: Record<string, unknown>
): Promise<NextResponse> {
  const { pdfPath, documentoHash, aceiteEm } = readContractAcceptance(store)
  if (!aceiteEm || !documentoHash) {
    return NextResponse.json({ error: 'Contrato ainda não assinado.' }, { status: 404 })
  }

  if (!pdfPath) {
    return NextResponse.json(
      { error: 'PDF do contrato não disponível. Contacta o suporte Vyria.' },
      { status: 404 }
    )
  }

  try {
    const svc = createServiceRoleClient()
    const { data, error } = await svc.storage.from('contratos').download(pdfPath)
    if (error || !data) {
      return NextResponse.json({ error: 'Ficheiro do contrato não encontrado.' }, { status: 404 })
    }

    const buf = Buffer.from(await data.arrayBuffer())
    const filename = `contrato-vyria-${String(store.name || 'loja')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 40)}.pdf`

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Document-Hash': documentoHash,
      },
    })
  } catch (e) {
    console.error('[contrato/documento]', e)
    return NextResponse.json({ error: 'Erro ao obter o contrato.' }, { status: 500 })
  }
}
