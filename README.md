# Vyria Delivery

App Next.js (painel + cardápio público). Variáveis de ambiente: ver `.env.example`.

## Planos e cobrança

O plano da loja (`stores.plan`) é atualizado no painel (ex.: upgrade em **Assinatura**) ou diretamente na base de dados. **Cobrança e liberação de acessos são tratadas manualmente** pela equipa — não há integração automática com gateway de pagamento no código.

Campos opcionais de faturação (`billing_*`) podem ser usados para estado de subscrição, URLs de pagamento e histórico de faturas, preenchidos à mão ou por processos internos.

Para remover colunas legadas de identificadores de gateway na tabela `stores`, vê `scripts/supabase-stores-drop-legacy-gateway-ids.sql` (executar no Supabase se aplicável).
