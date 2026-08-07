-- Concorrência: impedir créditos/resgates duplicados (referral + fidelidade)

-- Uma linha de pontos por indicação activada
CREATE UNIQUE INDEX IF NOT EXISTS store_referral_ledger_activation_uidx
  ON public.store_referral_ledger (referral_id)
  WHERE referral_id IS NOT NULL AND reason = 'referral_activated';

-- Um movimento de fidelidade por pedido + tipo
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_ledger_order_kind_uidx
  ON public.loyalty_ledger (store_id, order_id, kind)
  WHERE order_id IS NOT NULL;

-- Saldo materializado para resgate atómico (padrão loyalty_accounts.points_balance)
ALTER TABLE public.store_referral_accounts
  ADD COLUMN IF NOT EXISTS points_balance integer NOT NULL DEFAULT 0;

-- Backfill do saldo a partir do ledger (mesma lógica que computeAvailablePoints)
UPDATE public.store_referral_accounts AS a
SET points_balance = GREATEST(
  0,
  COALESCE(
    (
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN l.delta > 0
                AND (l.expires_at IS NULL OR l.expires_at > now())
              THEN l.delta
              ELSE 0
            END
          ),
          0
        ) - COALESCE(SUM(CASE WHEN l.delta < 0 THEN -l.delta ELSE 0 END), 0)
      FROM public.store_referral_ledger AS l
      WHERE l.store_id = a.store_id
    ),
    0
  )
);
