-- The "discount larger than the bill" check multiplied qty as a whole number; pieces made it fail. It now uses the exact (fractional) quantity.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.counter_sale_save(uuid, uuid, uuid, text, jsonb, bigint, uuid)'::regprocedure);
  if position($x$sum((e ->> 'qty')::bigint * (e ->> 'price_paise')::bigint)$x$ in d) = 0 then raise exception 'discount pattern missing'; end if;
  d := replace(d, $x$sum((e ->> 'qty')::bigint * (e ->> 'price_paise')::bigint)$x$, $x$round(sum((e ->> 'qty')::numeric * (e ->> 'price_paise')::bigint))$x$);
  execute d;
end $$;
