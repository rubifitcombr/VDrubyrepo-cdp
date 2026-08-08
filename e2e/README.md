# Testes E2E (Playwright)

## Regra de ouro

**Nunca rode `test:sync` ou `test:concurrency` contra uma loja de cliente real.**

Os testes criam pedidos, comandas, turnos de caixa, stock e dados de referral/loyalty. Até agosto/2026 isso rodava contra a **Sanduicheria Tudibom** em produção — isso foi corrigido.

## Ambiente

| Camada | Onde |
|--------|------|
| App Next.js | Local (`http://127.0.0.1:3000`) |
| Supabase | Mesmo projeto de produção (credenciais em `.env.local`) |
| **Loja** | **`e2e-test-store`** — dedicada, isolada de clientes |

> **Projeto Supabase staging separado:** não foi criado neste passo (exige novo projeto na conta Supabase + duplicar migrações + secrets CI). A loja dedicada `e2e-test-store` é o isolamento mínimo viável **hoje**. Quando houver staging, troque só as credenciais em `.env.local` e reprovisione.

## Setup (primeira vez)

```bash
# 1. Credenciais Supabase (já deve existir)
cp .env.example .env.local   # preencher URL + service role + anon

# 2. Config da loja de teste
cp .env.test.example .env.test

# 3. Criar/atualizar loja e2e-test-store no Supabase
npm run e2e:provision
```

O script `e2e:provision` cria:

- Conta Auth **dedicada** `vyria-e2e-automation@vyria.test` (única dona da loja E2E — não reutilize email de cliente real)
- Loja `e2e-test-store` (plano Pro, modo híbrido, `billing_cycle: monthly`)
- Mesas **1, 2, 77, 88, 99** (usadas pelos specs de garçom)
- Garçons **E2E Garçom A** (PIN `1111`) e **E2E Garçom B** (PIN `2222`)
- Produto **E2E Produto Teste** (R$ 10)
- Conta referral `E2ETEST01`
- PIN hub balcão: `0000`

Escreve/atualiza `.env.test` com `E2E_STORE_ID` e `E2E_OWNER_EMAIL`.

## Rodar testes

```bash
npm run test:sync          # e2e/sync — UI + realtime
npm run test:concurrency   # e2e/concurrency — race conditions API
```

Antes de cada run, `scripts/ensure-e2e-test-env.mjs` **bloqueia** se:

- `.env.test` não existir
- `E2E_STORE_SLUG` for `tudibom` ou outra loja real
- `E2E_STORE_SLUG` ≠ `e2e-test-store`

Override de emergência (não recomendado):

```bash
E2E_ALLOW_PRODUCTION_STORE=true npm run test:concurrency
```

## Teardown automático

Specs em `e2e/concurrency/` usam `test-with-teardown.ts` — `afterEach` cancela pedidos rastreados. Em produção, `DELETE` em `orders` não remove linhas; o teardown faz **cancel** via `UPDATE`.

## Limpeza manual

```bash
# Comandas presas na loja de teste (quando existir script dedicado)
# Hoje: cancelar via Supabase ou re-rodar teardown

# Auditoria de dano histórico (pedidos de teste em lojas reais)
npm run e2e:audit-damage

# Relatório CSV de correção por loja e dia (ex.: caso o lojista pergunte)
npm run e2e:correction-report -- --store tudibom --date 2026-08-07
```

## Arquivos importantes

| Arquivo | Função |
|---------|--------|
| `.env.local` | Credenciais Supabase (não commitar) |
| `.env.test` | `E2E_STORE_SLUG`, `E2E_STORE_ID`, `E2E_OWNER_EMAIL` |
| `e2e/fixtures/store.ts` | Exporta loja — lê `.env.test` + guard anti-produção |
| `e2e/fixtures/store-config.ts` | Validação e blocklist de slugs reais |
| `scripts/provision-e2e-test-store.mjs` | Provisiona loja dedicada |
| `scripts/ensure-e2e-test-env.mjs` | Gate antes dos testes |
| `e2e/.auth/user.json` | Sessão Playwright (gerada no setup) |

## Scripts de produção (não são E2E)

Estes ainda apontam para Tudibom de propósito (smoke pós-deploy):

- `scripts/prod-post-deploy-smoke.mjs`
- `scripts/cleanup-tudibom-stuck-comandas.mjs`

Não confundir com `npm run test:*`.
