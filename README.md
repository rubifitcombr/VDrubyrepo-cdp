# Vyria Delivery

App Next.js (painel + cardápio público). Variáveis de ambiente: ver `.env.example`.

## Conta e senha (Supabase Auth)

- **Recuperar senha:** `/login/recuperar` envia email com link; a página `/login/redefinir-senha` define a nova senha.
- **Alterar senha com sessão:** Configurações (`/dashboard/settings`, bloco «Conta e senha») chama `updateUser({ password })`.
- No **Supabase Dashboard** → Authentication → URL Configuration, adiciona à lista **Redirect URLs** o URL completo de `/login/redefinir-senha` (produção e `http://localhost:PORT`, conforme o deploy). Sem isto, o link do email pode falhar.

## Impressão térmica Wi-Fi (plano Pro)

O painel **Impressão** (`/dashboard/printing`) guarda URL do agente local, token, IP da impressora e toggles por origem. A API `POST /api/print` gera ESC/POS e envia para o agente (`agent/`), que abre TCP **9100** na impressora.

- **Agente na loja:** na pasta `agent/`, `npm install`, opcional `set AGENT_TOKEN=...` (Windows) ou `export AGENT_TOKEN=...`, depois `node print-agent.js` (porta **3001**, `GET /health`, `POST /print` com header `x-agent-token`). O dispositivo tem de estar na mesma Wi-Fi que a impressora.
- **Base de dados:** as colunas de impressão térmica em `stores` devem existir no Supabase (configuração gerida pela equipa Vyria).
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

Colunas legadas de gateway/trial na tabela `stores` foram removidas em migrações anteriores na base de dados.

## Painel admin (`/admin`)

Área para administradores gerirem **lojistas** (linhas em `stores`), **planos** e **estados** (`status`: pendente, ativo, bloqueado, cancelado). Rotas API: `/api/admin/lojistas`.

### Base de dados

O schema do Supabase é gerido directamente no projeto Supabase (Dashboard / SQL). O repositório da app não inclui ficheiros de migração.

**Requisito:** `SUPABASE_SERVICE_ROLE_KEY` no servidor (rotas admin usam service role para listar lojas e gravar logs).

### Acesso ao painel `/admin`

Apenas a conta cujo UUID está em `VYRIA_ADMIN_USER_ID` (variável de ambiente no deploy) pode aceder ao painel admin.

- Sessão obrigatória; qualquer outro utilizador autenticado é redirecionado para `/dashboard`.
- Login com `?next=/admin` volta ao admin após entrar.
