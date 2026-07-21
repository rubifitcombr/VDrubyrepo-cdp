-- PIX: confirmação pelo cliente via RPC (evita UPDATE amplo em orders por anon).

CREATE OR REPLACE FUNCTION public.report_customer_pix_payment(
  p_slug text,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_prev text;
  v_already boolean;
BEGIN
  IF p_order_id IS NULL OR trim(coalesce(p_slug, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parâmetros inválidos.');
  END IF;

  SELECT (public.get_public_store_by_slug(p_slug) ->> 'id')::uuid INTO v_store_id;
  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Loja não encontrada.');
  END IF;

  SELECT payment_status INTO v_prev
  FROM public.orders
  WHERE id = p_order_id
    AND store_id = v_store_id
    AND lower(coalesce(payment_method, '')) = 'pix'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido não encontrado.');
  END IF;

  v_already := v_prev IN ('paid', 'confirmed', 'customer_reported', 'pago', 'confirmado');

  IF NOT v_already THEN
    UPDATE public.orders
    SET
      payment_status = 'customer_reported',
      pix_paid_at = now()
    WHERE id = p_order_id
      AND store_id = v_store_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'confirmed', true,
    'paymentStatus', coalesce(v_prev, 'customer_reported'),
    'alreadyConfirmed', v_already
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_customer_pix_payment(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_customer_pix_payment(text, uuid) TO anon, authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
