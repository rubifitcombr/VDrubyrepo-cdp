-- Fecha exfiltração de pedidos PIX via SELECT anon em orders.
-- Consulta pública passa por RPC (slug + order_id), como report_customer_pix_payment.

DROP POLICY IF EXISTS orders_public_select_pix ON public.orders;

CREATE OR REPLACE FUNCTION public.get_public_pix_order_status(
  p_slug text,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
  v_method text;
  v_status text;
BEGIN
  IF p_order_id IS NULL OR trim(coalesce(p_slug, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parâmetros inválidos.');
  END IF;

  SELECT (public.get_public_store_by_slug(p_slug) ->> 'id')::uuid INTO v_store_id;
  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Loja não encontrada.');
  END IF;

  SELECT payment_method, payment_status
  INTO v_method, v_status
  FROM public.orders
  WHERE id = p_order_id
    AND store_id = v_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido não encontrado.');
  END IF;

  IF lower(coalesce(v_method, '')) <> 'pix' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este pedido não usa PIX.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'paymentStatus', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_pix_order_status(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_pix_order_status(text, uuid) TO anon, authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
