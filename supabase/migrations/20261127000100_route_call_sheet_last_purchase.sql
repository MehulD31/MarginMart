-- Migration: route call sheet last purchase view
-- Exposes the latest purchase (cash sale, order, invoice) per shop with items breakdown for calling talk-track
CREATE OR REPLACE VIEW public.v_shop_last_purchase AS
WITH combined_purchases AS (
  SELECT 
    cs.shop_id,
    cs.created_at,
    cs.total_paise,
    'bill'::text as purchase_type,
    (
      SELECT json_agg(json_build_object(
        'qty', round(csl.qty::numeric, 1),
        'name', CASE 
          WHEN v.flavour_en IS NULL OR v.flavour_en = '' THEN coalesce(p.name_en, 'Item')
          WHEN p.name_en IS NULL OR p.name_en = '' OR v.flavour_en = p.name_en THEN v.flavour_en
          ELSE concat(v.flavour_en, ' (', p.name_en, ')')
        END
      ))
      FROM cash_sale_line csl
      LEFT JOIN variant v ON v.id = csl.variant_id
      LEFT JOIN pack p ON p.id = v.pack_id
      WHERE csl.cash_sale_id = cs.id
    ) as items
  FROM cash_sale cs
  WHERE cs.voided_at IS NULL AND cs.shop_id IS NOT NULL

  UNION ALL

  SELECT 
    o.shop_id,
    o.created_at,
    COALESCE((
      SELECT sum(ol.qty_ordered * ol.unit_price_paise)
      FROM order_line ol
      WHERE ol.order_id = o.id
    ), 0)::bigint as total_paise,
    'order'::text as purchase_type,
    (
      SELECT json_agg(json_build_object(
        'qty', round(ol.qty_ordered::numeric, 1),
        'name', CASE 
          WHEN v.flavour_en IS NULL OR v.flavour_en = '' THEN coalesce(p.name_en, 'Item')
          WHEN p.name_en IS NULL OR p.name_en = '' OR v.flavour_en = p.name_en THEN v.flavour_en
          ELSE concat(v.flavour_en, ' (', p.name_en, ')')
        END
      ))
      FROM order_line ol
      LEFT JOIN variant v ON v.id = ol.variant_id
      LEFT JOIN pack p ON p.id = v.pack_id
      WHERE ol.order_id = o.id
    ) as items
  FROM orders o
  WHERE o.status != 'cancelled' AND o.shop_id IS NOT NULL

  UNION ALL

  SELECT 
    i.shop_id,
    i.created_at,
    COALESCE((
      SELECT sum(dl.qty_delivered * dl.unit_price_paise)
      FROM delivery_line dl
      WHERE dl.invoice_id = i.id
    ), 0)::bigint as total_paise,
    'invoice'::text as purchase_type,
    (
      SELECT json_agg(json_build_object(
        'qty', round(dl.qty_delivered::numeric, 1),
        'name', CASE 
          WHEN v.flavour_en IS NULL OR v.flavour_en = '' THEN coalesce(p.name_en, 'Item')
          WHEN p.name_en IS NULL OR p.name_en = '' OR v.flavour_en = p.name_en THEN v.flavour_en
          ELSE concat(v.flavour_en, ' (', p.name_en, ')')
        END
      ))
      FROM delivery_line dl
      LEFT JOIN variant v ON v.id = dl.variant_id
      LEFT JOIN pack p ON p.id = v.pack_id
      WHERE dl.invoice_id = i.id
    ) as items
  FROM invoice i
  WHERE coalesce(i.status, '') <> 'void' AND i.shop_id IS NOT NULL
),
ranked AS (
  SELECT 
    shop_id,
    created_at,
    total_paise,
    purchase_type,
    items,
    ROW_NUMBER() OVER (PARTITION BY shop_id ORDER BY created_at DESC) as rn
  FROM combined_purchases
)
SELECT shop_id, created_at, total_paise, purchase_type, items
FROM ranked
WHERE rn = 1;

GRANT SELECT ON public.v_shop_last_purchase TO authenticated, anon, service_role;
