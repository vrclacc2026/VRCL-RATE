-- Restore one product atomically after verifying the active admin session.
-- The browser cannot bypass RLS; only this narrowly-scoped routine runs with
-- the table owner's privileges after completing both authorization checks.
create or replace function public.restore_vrcl_product_backup(
  product_payload jsonb,
  rates_payload jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  restored_product_id uuid;
  restored_rate_count integer := 0;
begin
  if not (select private.is_admin())
     or not (select private.is_current_session()) then
    raise exception 'Admin access required';
  end if;

  if jsonb_typeof(product_payload) <> 'object'
     or nullif(product_payload->>'id', '') is null then
    raise exception 'Invalid VRCL product backup';
  end if;
  if jsonb_typeof(coalesce(rates_payload, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid VRCL product rates';
  end if;

  insert into public.products(
    id, code, name, sort_order, active, ingredient_image_url,
    header_image_url, city, customer_visible
  )
  select
    x.id, x.code, x.name, coalesce(x.sort_order, 0), coalesce(x.active, true),
    x.ingredient_image_url, x.header_image_url, x.city,
    coalesce(x.customer_visible, true)
  from jsonb_to_record(product_payload) as x(
    id uuid, code text, name text, sort_order integer, active boolean,
    ingredient_image_url text, header_image_url text, city text,
    customer_visible boolean
  )
  on conflict (id) do update set
    code = excluded.code,
    name = excluded.name,
    sort_order = excluded.sort_order,
    active = excluded.active,
    ingredient_image_url = excluded.ingredient_image_url,
    header_image_url = excluded.header_image_url,
    city = excluded.city,
    customer_visible = excluded.customer_visible
  returning id into restored_product_id;

  delete from public.rates where product_id = restored_product_id;

  insert into public.rates(
    id, city, product_id, packing, rate, narration, sort_order, updated_at
  )
  select
    x.id, x.city, restored_product_id, x.packing, coalesce(x.rate, 0),
    coalesce(x.narration, ''), coalesce(x.sort_order, 0),
    coalesce(x.updated_at, now())
  from jsonb_to_recordset(coalesce(rates_payload, '[]'::jsonb)) as x(
    id uuid, city text, product_id uuid, packing text, rate numeric,
    narration text, sort_order integer, updated_at timestamptz
  );
  get diagnostics restored_rate_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'product_id', restored_product_id,
    'rates', restored_rate_count
  );
end;
$function$;

revoke all on function public.restore_vrcl_product_backup(jsonb, jsonb) from public;
revoke all on function public.restore_vrcl_product_backup(jsonb, jsonb) from anon;
revoke all on function public.restore_vrcl_product_backup(jsonb, jsonb) from service_role;
grant execute on function public.restore_vrcl_product_backup(jsonb, jsonb) to authenticated;
