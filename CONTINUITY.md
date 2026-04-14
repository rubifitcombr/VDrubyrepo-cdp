# Continuidade — Vyria Delivery (pausa)

Última atualização: retomar daqui após pausa.

## Contexto

- Matriz comercial: Start / Growth / Pro / Master (ver conversa + imagem da tabela).
- Plano efetivo: `stores.plan` + `lib/effective-plan.server.ts` (em dev, `VYRIA_DEV_PRO_EMAILS` não reduz plano acima de Pro; `VYRIA_DEV_FORCE_PLAN` ainda pode forçar).

## Status de validação dos planos (rodada atual)

- Start: **FECHADO** (cadastro manual de produtos, slug público, configurações da loja e dashboard simples com diário).
- Growth: **EM VALIDAÇÃO** (escopo definido: tudo do Start + pedidos em tempo real + promoções/cupons + importação por foto + financeiro mensal completo + PDV).
- Pro: **PENDENTE**.

## Já implementado (resumo)

- Fase 1 SQL: quotas importação foto + Realtime `orders` (`supabase/phase1.sql`).
- Fase 2 SQL: quotas marketing IA (`supabase/phase2.sql`).
- Fase 3: estoque Master (`phase3.sql`), baixa em pedido (`phase3b-order-items-stock.sql`), reposição ao cancelar (`phase3c-order-cancel-restore-stock.sql`).
- PDV: notas internas, desconto, quantidade, atalhos.
- Relatórios Master: comparativo 30 vs 30, PDF; Growth+ relatórios base.
- Alinhamento plano BD: `supabase/plan-align.sql`.
- WhatsApp automações: webhook + card de resposta automática + script `supabase/phase4-whatsapp-automations.sql` (Growth+).
- Integração Evolution API no envio WhatsApp (com fallback mock quando envs não configuradas).

## Plano de ação acordado (ordem sugerida)

1. **Fase 0** — Números finais na matriz + alinhar `menu-import-quota.ts` e `marketing-ai-quota.ts`.
2. **Fase 2** — (PAUSADA) Carrinho abandonado + WhatsApp (fora do escopo atual do Growth).
3. **Fase 1** — Multi-utilizador mínimo (`store_members`, RLS).
4. **Fase 3** — (PAUSADA) Campanhas WhatsApp “ouro” (fora do escopo atual do Pro).
5. **Fase 4** — IA Master em fatias (preço, campanhas IA, chatbot, previsão).
6. **Fase 5** — Garçom/mesas + autoatendimento.
7. **Fase 6** — Add-on entregador (opcional).

## Lacunas vs matriz (ainda não no código)

- App garçom/mesas, campanhas ouro completas, recuperação carrinho, várias IAs Master (preço mercado, chatbot, previsão, campanhas IA), autoatendimento kiosk, multi-user, app entregador.
- **Decisão atual de escopo**: Growth sem recuperação de carrinho/WhatsApp por enquanto; Pro sem campanhas WhatsApp.
- **Definição atual do Growth**: inclui PDV, mantendo fora do escopo atual recuperação de carrinho e WhatsApp.

## Próximo passo sugerido ao voltar

- Executar scripts SQL em falta no Supabase (se ainda não) e focar na **Fase 0** (alinhamento quotas), mantendo Fase 2/Fase 3 pausadas no escopo atual.

## Caminhos úteis

- Planos / features: `lib/plan.ts`
- SQL: `supabase/phase*.sql`, `plan-align.sql`
- PDV: `services/pdv.ts`, `app/dashboard/pdv/_components/PdvClient.tsx`
