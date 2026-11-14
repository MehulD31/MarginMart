-- Trip screens show money too: each item's trade price per case, so "loaded / came back / parchi still to enter" have a ₹ value.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.trip_detail(uuid)'::regprocedure);
  if position('pli.trade_price_paise' in d) = 0 then
    d := replace(d, $x$'variant_id', v.id, 'label', public._item_label(v.id),$x$,
      $x$'variant_id', v.id, 'label', public._item_label(v.id),
        'price_paise', coalesce((select pli.trade_price_paise from public.price_list_item pli join public.price_list pl on pl.id = pli.price_list_id where pl.status = 'active' and pli.pack_id = pk.id limit 1), 0),$x$);
    execute d;
  end if;
end $$;
