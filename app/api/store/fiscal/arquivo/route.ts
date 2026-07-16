import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/services/auth.server'
import { requireLojistaAtivoApi } from '@/lib/require-lojista-ativo-api.server'
import { createServiceRoleClient } from '@/lib/supabase/service-role.server'
import {
  downloadFiscalArtifact,
  persistNfceArtifacts,
} from '@/services/fiscal-artifacts.server'
import { getFiscalService, getStoreFiscalConfig } from '@/services/fiscal.server'

export const dynamic = 'force-dynamic'

/**
 * Download autenticado de XML ou DANFE de uma NFC-e da loja.
 * Se o arquivo ainda não estiver no Storage, tenta rebaixar do gateway.
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  }
  const gate = await requireLojistaAtivoApi(user.id)
  if (!gate.ok) return gate.response

  const { searchParams } = new URL(req.url)
  const invoiceId = String(searchParams.get('invoiceId') ?? '').trim()
  const tipoRaw = String(searchParams.get('tipo') ?? '').trim().toLowerCase()
  const tipo = tipoRaw === 'xml' ? 'xml' : tipoRaw === 'danfe' ? 'danfe' : null

  if (!invoiceId || !tipo) {
    return NextResponse.json(
      { error: 'Parâmetros inválidos. Use invoiceId e tipo=xml|danfe.' },
      { status: 400 }
    )
  }

  const svc = createServiceRoleClient()
  const { data: invoice } = await svc
    .from('fiscal_invoices')
    .select(
      'id, store_id, status, chave_acesso, xml_storage_path, danfe_storage_path, xml_url, nfe_url'
    )
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) {
    return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 })
  }
  if (String(invoice.store_id) !== gate.ctx.storeId) {
    return NextResponse.json({ error: 'Acesso negado à nota.' }, { status: 403 })
  }

  const pathCol = tipo === 'xml' ? 'xml_storage_path' : 'danfe_storage_path'
  let storagePath = String(
    (invoice as Record<string, unknown>)[pathCol] ?? ''
  ).trim()

  let file = storagePath ? await downloadFiscalArtifact(storagePath) : null

  // Fallback: rebaixa do gateway e grava no Storage.
  if (!file) {
    const chave = String(invoice.chave_acesso ?? '').replace(/\D/g, '')
    if (chave.length === 44) {
      const cfg = await getStoreFiscalConfig(svc, String(invoice.store_id))
      if (cfg?.brasilnfeToken) {
        const fetched = await getFiscalService().obterArquivoNfce({
          token: cfg.brasilnfeToken,
          chaveAcesso: chave,
          tipo,
        })
        if (fetched.success && fetched.buffer) {
          const artifacts = await persistNfceArtifacts({
            storeId: String(invoice.store_id),
            invoiceId,
            chaveAcesso: chave,
            xmlBuffer: tipo === 'xml' ? fetched.buffer : null,
            danfeBuffer: tipo === 'danfe' ? fetched.buffer : null,
          })
          await svc
            .from('fiscal_invoices')
            .update({
              ...(tipo === 'xml'
                ? {
                    xml_storage_path: artifacts.xmlPath,
                    xml_url: artifacts.xmlUrl,
                    ...(artifacts.qrCodeUrl
                      ? { qr_code_url: artifacts.qrCodeUrl }
                      : {}),
                  }
                : {
                    danfe_storage_path: artifacts.danfePath,
                    nfe_url: artifacts.nfeUrl,
                  }),
            })
            .eq('id', invoiceId)

          storagePath =
            (tipo === 'xml' ? artifacts.xmlPath : artifacts.danfePath) || ''
          if (storagePath) {
            file = await downloadFiscalArtifact(storagePath)
          }
          if (!file && fetched.buffer) {
            file = {
              buffer: fetched.buffer,
              contentType:
                tipo === 'xml' ? 'application/xml' : 'application/pdf',
            }
          }
        }
      }
    }
  }

  if (!file) {
    return NextResponse.json(
      { error: 'Arquivo ainda não disponível para esta nota.' },
      { status: 404 }
    )
  }

  const chaveShort = String(invoice.chave_acesso ?? '')
    .replace(/\D/g, '')
    .slice(-8)
  const filename =
    tipo === 'xml'
      ? `nfce-${chaveShort || invoiceId}.xml`
      : `danfe-${chaveShort || invoiceId}.pdf`
  const disposition =
    searchParams.get('download') === '1' ? 'attachment' : 'inline'

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
