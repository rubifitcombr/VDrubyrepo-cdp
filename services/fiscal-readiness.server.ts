import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateFiscalReadiness, type FiscalReadinessResult } from '@/lib/fiscal-readiness'
import { parseFiscalCertStatus } from '@/lib/fiscal'
import { getStoreFiscalConfig } from '@/services/fiscal.server'

export async function getFiscalReadinessForStore(
  svc: SupabaseClient,
  storeId: string
): Promise<FiscalReadinessResult & { configured: boolean }> {
  const cfg = await getStoreFiscalConfig(svc, storeId)
  if (!cfg) {
    const empty = evaluateFiscalReadiness({
      sefazCredenciado: false,
      cnpj: null,
      inscricaoEstadual: null,
      enderecoMunicipioIbge: null,
      regimeTributario: null,
      enderecoLogradouro: null,
      enderecoNumero: null,
      enderecoBairro: null,
      enderecoMunicipio: null,
      enderecoUf: null,
      enderecoCep: null,
      certStatus: 'nao_enviado',
      cscId: null,
      cscToken: null,
      brasilnfeSincronizada: false,
      products: [],
    })
    return { ...empty, configured: false }
  }

  const { data: extra } = await svc
    .from('store_fiscal_config')
    .select(
      'inscricao_estadual, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_municipio_ibge, endereco_uf, endereco_cep, sefaz_credenciado'
    )
    .eq('store_id', storeId)
    .maybeSingle()
  const row = (extra ?? {}) as Record<string, unknown>

  const { data: productsRaw } = await svc
    .from('products')
    .select('name, ncm, cfop, cst_csosn')
    .eq('store_id', storeId)
    .order('name')

  const products = (productsRaw ?? []).map((p) => {
    const r = p as Record<string, unknown>
    return {
      name: String(r.name ?? ''),
      ncm: r.ncm != null ? String(r.ncm) : null,
      cfop: r.cfop != null ? String(r.cfop) : null,
      cst_csosn: r.cst_csosn != null ? String(r.cst_csosn) : null,
    }
  })

  const result = evaluateFiscalReadiness({
    sefazCredenciado: Boolean(row.sefaz_credenciado),
    cnpj: cfg.cnpj,
    inscricaoEstadual: (row.inscricao_estadual as string | null) ?? null,
    enderecoMunicipioIbge: (row.endereco_municipio_ibge as string | null) ?? null,
    regimeTributario: cfg.regimeTributario,
    enderecoLogradouro: (row.endereco_logradouro as string | null) ?? null,
    enderecoNumero: (row.endereco_numero as string | null) ?? null,
    enderecoBairro: (row.endereco_bairro as string | null) ?? null,
    enderecoMunicipio: (row.endereco_municipio as string | null) ?? null,
    enderecoUf: (row.endereco_uf as string | null) ?? null,
    enderecoCep: (row.endereco_cep as string | null) ?? null,
    certStatus: parseFiscalCertStatus(cfg.certStatus),
    cscId: cfg.cscId,
    cscToken: cfg.cscToken,
    brasilnfeSincronizada: Boolean(cfg.brasilnfeToken),
    products,
  })

  return { ...result, configured: true }
}
