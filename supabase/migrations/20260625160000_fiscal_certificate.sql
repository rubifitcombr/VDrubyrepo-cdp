-- Certificado digital A1 via Brasil NFe (Opção A: upload pela própria Vyria).
-- IMPORTANTE: o arquivo .pfx e a senha NUNCA são gravados aqui. O backend apenas
-- repassa (em base64) ao endpoint AlterarCertificado da Brasil NFe e guarda os
-- METADADOS do certificado (CN/validade) para exibir status ao lojista.
--
-- Modelo de conta: master (a Vyria possui o UserToken e cada loja é uma "Empresa"
-- na Brasil NFe). O Token da empresa fica em store_fiscal_config.brasilnfe_token.

-- cert_id: id do certificado no parceiro. A Brasil NFe vincula o certificado pelo
-- Token da empresa e NÃO devolve um id próprio — fica opcional para manter o
-- contrato genérico do adapter (outros gateways podem usar).
alter table store_fiscal_config add column if not exists cert_id text;

-- nao_enviado | valido | vencido | invalido
alter table store_fiscal_config add column if not exists cert_status text not null default 'nao_enviado';

-- Common Name do certificado (contém o CNPJ) — só metadado, para conferência.
alter table store_fiscal_config add column if not exists cert_cn text;

-- Validade do certificado A1 (alerta de vencimento).
alter table store_fiscal_config add column if not exists cert_validade timestamptz;

-- Quando o certificado foi enviado/atualizado pela última vez.
alter table store_fiscal_config add column if not exists cert_updated_at timestamptz;
