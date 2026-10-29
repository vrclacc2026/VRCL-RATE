-- Sheet uploads write a complete, narration-free snapshot to the master history.
-- The Apps Script reads loose_rate and saved_by from each queued row.
create or replace function public.request_sheet_upload_v1(p_city text, p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor uuid := auth.uid();
  p_name text;
  actor_name text;
  latest_snapshot jsonb;
  loose_value numeric;
  rate_rows jsonb;
  job_id uuid;
begin
  if actor is null or not private.is_admin() or not private.is_current_session() then
    raise exception 'Active admin session required.' using errcode='42501';
  end if;
  if p_city not in ('Rajkot','Ahmedabad','Udaan') then
    raise exception 'Select a valid city.';
  end if;

  select p.name into p_name
  from public.products p
  where p.id=p_product_id and p.city=p_city and p.active=true;

  if p_name is null then
    raise exception 'Selected product was not found.';
  end if;

  select coalesce(nullif(pr.display_name,''),'VRCL Admin')
  into actor_name
  from public.profiles pr
  where pr.id=actor;
  actor_name := coalesce(actor_name,'VRCL Admin');

  select rh.snapshot into latest_snapshot
  from public.rate_history rh
  where rh.city=p_city and rh.product_id=p_product_id
  order by rh.changed_at desc
  limit 1;

  begin
    loose_value := nullif(latest_snapshot->>'loose_rate','')::numeric;
  exception when others then
    loose_value := null;
  end;

  select jsonb_agg(
    jsonb_build_object(
      'packing',r.packing,
      'rate',r.rate,
      'saved_at',r.updated_at,
      'loose_rate',loose_value,
      'saved_by',actor_name
    )
    order by r.sort_order,r.packing
  )
  into rate_rows
  from public.rates r
  where r.city=p_city and r.product_id=p_product_id;

  if rate_rows is null then
    raise exception 'No saved rates for this product.';
  end if;

  insert into public.sheet_upload_jobs(created_by,city,product_id,product_name,rows)
  values(actor,p_city,p_product_id,p_name,rate_rows)
  returning id into job_id;

  return jsonb_build_object(
    'id',job_id,
    'city',p_city,
    'product',p_name,
    'count',jsonb_array_length(rate_rows),
    'status','pending'
  );
end;
$function$;
