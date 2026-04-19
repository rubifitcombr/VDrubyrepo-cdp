# Vyria Delivery

App Next.js (painel + cardápio público). Variáveis de ambiente: ver `.env.example`.

## Planos e cobrança

O plano da loja (`stores.plan`) é atualizado no painel (ex.: upgrade em **Assinatura**) ou diretamente na base de dados. **Cobrança e liberação de acessos são tratadas manualmente** pela equipa — não há integração automática com gateway de pagamento no código.

Campos opcionais de faturação (`billing_*`) podem ser usados para estado de subscrição, URLs de pagamento e histórico de faturas, preenchidos à mão ou por processos internos.

Para remover colunas legadas de identificadores de gateway na tabela `stores`, vê `scripts/supabase-stores-drop-legacy-gateway-ids.sql` (executar no Supabase se aplicável).

## Painel admin (`/admin`)

Área para administradores gerirem **lojistas** (linhas em `stores`), **planos** e **estados** (`merchant_status`: pendente, ativo, bloqueado, cancelado). Rotas API: `/api/admin/lojistas`.

### Base de dados

1. Aplica a migration em `supabase/migrations/20260419120000_admin_usuarios_lojistas.sql` (tabelas `usuarios`, `admin_logs`, colunas em `stores`, trigger em `auth.users`).
2. Opcional: `scripts/admin-backfill-usuarios.sql` para sincronizar utilizadores antigos com `usuarios`.

**Requisito:** `SUPABASE_SERVICE_ROLE_KEY` no servidor (rotas admin usam service role para listar lojas e gravar logs).

### Acesso ao painel `/admin`

Apenas **uma** conta pode aceder: o UUID fixo em `lib/admin-panel-user.ts` (`VYRIA_ADMIN_PANEL_USER_ID`). Opcionalmente podes sobrescrever em deploy com `VYRIA_ADMIN_USER_ID` (mesmo formato UUID).

- Sessão obrigatória; qualquer outro utilizador autenticado é redirecionado para `/dashboard`.
- Login com `?next=/admin` volta ao admin após entrar.
