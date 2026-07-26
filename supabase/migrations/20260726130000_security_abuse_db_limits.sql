-- Limites no role anon para reduzir impacto de abuso directo à API REST do Supabase.
-- Aplicar APÓS 20260726120000_security_hardening_rls.sql e rodar a chave anon.

-- Timeout curto: consultas abusivas são cortadas (protege CPU/IO do Postgres).
ALTER ROLE anon SET statement_timeout = '5s';
ALTER ROLE anon SET lock_timeout = '2s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '5s';

-- Reforço: garantir que anon não tem grants directos em tabelas sensíveis.
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
REVOKE ALL ON public.order_payments FROM anon;
REVOKE ALL ON public.entregas FROM anon;
REVOKE ALL ON public.caixas_turnos FROM anon;
REVOKE ALL ON public.caixa_movimentacoes FROM anon;
REVOKE ALL ON public.fiscal_invoices FROM anon;
REVOKE ALL ON public.stores FROM anon;

SELECT pg_notify('pgrst', 'reload schema');
