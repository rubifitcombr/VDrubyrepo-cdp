# Vyria Delivery

App Next.js (painel + cardápio público). Variáveis de ambiente: ver `.env.example`.

## Impressão térmica Wi-Fi (plano Pro)

O painel **Impressão** (`/dashboard/printing`) guarda URL do agente local, token, IP da impressora e toggles por origem. A API `POST /api/print` gera ESC/POS e envia para o agente (`agent/`), que abre TCP **9100** na impressora.

- **Agente na loja:** na pasta `agent/`, `npm install`, opcional `set AGENT_TOKEN=...` (Windows) ou `export AGENT_TOKEN=...`, depois `node print-agent.js` (porta **3001**, `GET /health`, `POST /print` com header `x-agent-token`). O dispositivo tem de estar na mesma Wi-Fi que a impressora.
- **Base de dados:** aplica `supabase/migrations/20260513120000_store_thermal_print_agent.sql` para criar as colunas em `stores`.
- **Quando imprime sozinha (toggle ativo + agente configurado):**
  - **Delivery / link / retirada no site** — na **criação** do pedido (`POST /api/public/checkout`). Não volta a imprimir em `POST /api/orders/status` ao passar a «A caminho» (`confirmed`), para evitar cupom duplicado.
  - **QR autoatendimento (mesa)** — na criação em `checkout` (`source: autoatendimento`).
  - **Garçom** — ao criar em `POST /api/waiter/orders`.
  - **PDV** — ao criar em `POST /api/pdv/sale` e ao fechar em `POST /api/cashier/orders/close` (com o mesmo toggle `print_auto_pdv` podes ter dois envios no ciclo da comanda; usa impressão manual se quiseres só um dos momentos).
- **Impressão manual:** botão térmica em Pedidos, Caixa e Garçom chama `POST /api/print` com `order_id`.

## Planos e cobrança

O plano da loja (`stores.plano`: `start` \| `growth` \| `pro`; o valor legado `master` é lido como Pro) e o estado (`stores.status`: pendente, ativo, bloqueado, cancelado) são atualizados no painel admin, na página **Assinatura** (pedido de upgrade) ou diretamente na base de dados. **Cobrança e liberação de acessos são tratadas manualmente** pela equipa — não há integração automática com gateway de pagamento no código.

- Lojistas **pendentes**, **bloqueados**, **cancelados** ou com **plano vencido** são redirecionados para `/acesso-suspenso` (middleware + APIs do painel devolvem 403 com `error` no JSON).
- Variáveis: `ADMIN_EMAIL`, `RESEND_API_KEY`, `NEXT_PUBLIC_ADMIN_WHATSAPP`, `CRON_SECRET` — ver `.env.example`.
- Job diário: `GET /api/cron/verificar-vencimentos` com `Authorization: Bearer CRON_SECRET` (agendado em `vercel.json` ou processo com `ENABLE_SERVER_CRON=true` e `next start`).

Campos opcionais de faturação (`billing_*`) podem ser usados para estado de subscrição, URLs de pagamento e histórico de faturas, preenchidos à mão ou por processos internos.

Colunas legadas de gateway/trial na tabela `stores` são removidas pela migration `20260420120000_stores_status_plano_manual.sql`.

## Painel admin (`/admin`)

Área para administradores gerirem **lojistas** (linhas em `stores`), **planos** e **estados** (`status`: pendente, ativo, bloqueado, cancelado). Rotas API: `/api/admin/lojistas`.

### Base de dados

1. Aplica a migration em `supabase/migrations/20260419120000_admin_usuarios_lojistas.sql` (tabelas `usuarios`, `admin_logs`, colunas em `stores`, trigger em `auth.users`).
2. Aplica `supabase/migrations/20260420120000_stores_status_plano_manual.sql` (`status`, `plano` como texto, remoção de colunas legadas, índices). Se `plano` for enum `plan_type`, o bloco `DO` cria coluna temporária, faz `UPDATE`, remove o enum e renomeia — não depende de `ALTER TYPE ... USING`.
3. Opcional: `scripts/admin-backfill-usuarios.sql` para sincronizar utilizadores antigos com `usuarios`.

**Requisito:** `SUPABASE_SERVICE_ROLE_KEY` no servidor (rotas admin usam service role para listar lojas e gravar logs).

### Acesso ao painel `/admin`

Apenas **uma** conta pode aceder: o UUID fixo em `lib/admin-panel-user.ts` (`VYRIA_ADMIN_PANEL_USER_ID`). Opcionalmente podes sobrescrever em deploy com `VYRIA_ADMIN_USER_ID` (mesmo formato UUID).

- Sessão obrigatória; qualquer outro utilizador autenticado é redirecionado para `/dashboard`.
- Login com `?next=/admin` volta ao admin após entrar.
