
create or replace function public.publish_final_rates_v1(
  p_publish_id uuid,
  p_rates jsonb,
  p_history jsonb,
  p_deletions jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $fn$
declare
  actor uuid := auth.uid();
  request_hash text;
  previous_count integer;
  previous_hash text;
  item jsonb;
  saved public.rates%rowtype;
  product_record record;
  count_rates integer;
  count_history integer;
  history_ids jsonb := '[]'::jsonb;
  new_history_id bigint;
  pack_rates jsonb;
begin
  if actor is null or not private.is_admin() or not private.is_current_session() then
    raise exception 'An active admin session is required to publish final rates.' using errcode='42501';
  end if;
  if p_publish_id is null or jsonb_typeof(p_rates) is distinct from 'array'
    or jsonb_typeof(p_history) is distinct from 'array'
    or jsonb_typeof(p_deletions) is distinct from 'array' then
    raise exception 'Invalid final publish request.';
  end if;
  count_rates := jsonb_array_length(p_rates);
  count_history := jsonb_array_length(p_history);
  if count_rates < 1 or count_rates > 2000 or count_history < 1 or count_history > 200
    or jsonb_array_length(p_deletions)>2000 then
    raise exception 'Final publish request is empty or too large.';
  end if;
  -- Serializes final publishes; all rates and their history commit together.
  perform pg_advisory_xact_lock(764321,1);
  request_hash := md5(p_rates::text || p_history::text || p_deletions::text);
  select count(*), min(h.snapshot->>'publication_request_hash')
    into previous_count,previous_hash from public.rate_history h
    where h.snapshot->>'publication_status'='final'
      and h.snapshot->>'publish_id'=p_publish_id::text;
  if previous_count>0 then
    if previous_count<>count_history or previous_hash is distinct from request_hash then
      raise exception 'This publish ID was already used with different rates.';
    end if;
    return jsonb_build_object('publish_id',p_publish_id,'rates_count',count_rates,
      'history_count',previous_count,'duplicate',true);
  end if;
  if exists (select 1 from jsonb_array_elements(p_rates) r
      where nullif(btrim(r->>'city'),'') is null
      or nullif(btrim(r->>'packing'),'') is null
      or nullif(r->>'product_id','') is null
      or jsonb_typeof(r->'rate') is distinct from 'number'
      or (r->>'rate')::numeric<0)
    or (select count(distinct (r->>'city',r->>'product_id',r->>'packing')) from jsonb_array_elements(p_rates) r)<>count_rates then
    raise exception 'Packing names must be unique and final rates must be valid non-negative numbers.';
  end if;
  if (select count(distinct (h->>'city',h->>'product_id')) from jsonb_array_elements(p_history) h)<>count_history
    or exists(select 1 from jsonb_array_elements(p_history) h
      where jsonb_typeof(h->'snapshot') is distinct from 'object'
      or not exists(select 1 from public.products p where p.id=(h->>'product_id')::uuid and p.city=h->>'city')
      or not exists(select 1 from jsonb_array_elements(p_rates) r where r->>'city'=h->>'city' and r->>'product_id'=h->>'product_id'))
    or exists(select 1 from jsonb_array_elements(p_rates) r
      where not exists(select 1 from jsonb_array_elements(p_history) h where r->>'city'=h->>'city' and r->>'product_id'=h->>'product_id'))
    or exists(select 1 from jsonb_array_elements(p_deletions) d
      where not exists(select 1 from jsonb_array_elements(p_history) h where d->>'city'=h->>'city' and d->>'product_id'=h->>'product_id')
      or exists(select 1 from jsonb_array_elements(p_rates) r where d->>'city'=r->>'city' and d->>'product_id'=r->>'product_id' and d->>'packing'=r->>'packing')) then
    raise exception 'Each saved rate and removed packing must belong to its confirmed product.';
  end if;
  -- Preserve row identity when a packing was renamed.
  for item in select value from jsonb_array_elements(p_rates)
    where nullif(value->>'id','') is not null and nullif(value->>'originalPacking','') is not null
      and value->>'originalPacking'<>value->>'packing'
  loop
    update public.rates set packing=item->>'packing'
    where id=(item->>'id')::uuid and city=item->>'city'
      and product_id=(item->>'product_id')::uuid and packing=item->>'originalPacking';
    if not found then raise exception 'A renamed packing changed in another tab. Reload and publish again.'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_deletions) loop
    delete from public.rates where city=item->>'city' and product_id=(item->>'product_id')::uuid and packing=item->>'packing';
  end loop;
  insert into public.rates(city,product_id,packing,rate,narration,sort_order)
    select r->>'city',(r->>'product_id')::uuid,r->>'packing',(r->>'rate')::numeric,
      coalesce(r->>'narration',''),coalesce((r->>'sort_order')::integer,0)
    from jsonb_array_elements(p_rates) r
  on conflict(city,product_id,packing) do update set
    rate=excluded.rate,narration=excluded.narration,sort_order=excluded.sort_order;
  for item in select value from jsonb_array_elements(p_rates) loop
    select * into saved from public.rates where city=item->>'city'
      and product_id=(item->>'product_id')::uuid and packing=item->>'packing';
    if not found or saved.rate is distinct from (item->>'rate')::numeric
      or saved.narration is distinct from coalesce(item->>'narration','') then
      raise exception 'Saved rates do not match the confirmed publish. No rates or history were committed.';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_history) loop
    select p.name into product_record from public.products p where p.id=(item->>'product_id')::uuid and p.city=item->>'city';
    select jsonb_agg(jsonb_build_object('packing',r.packing,'rate',r.rate) order by r.sort_order,r.packing)
      into pack_rates from public.rates r
      where r.city=item->>'city' and r.product_id=(item->>'product_id')::uuid
        and exists(select 1 from jsonb_array_elements(p_rates) pr where pr->>'city'=r.city and (pr->>'product_id')::uuid=r.product_id and pr->>'packing'=r.packing);
    insert into public.rate_history(city,product_id,changed_by,snapshot)
      values(item->>'city',(item->>'product_id')::uuid,actor,
        (item->'snapshot') || jsonb_build_object(
          'product_name',product_record.name,'rates',pack_rates,
          'publication_status','final','publish_id',p_publish_id,
          'publication_request_hash',request_hash,'publication_version',1,
          'published_at',transaction_timestamp()))
      returning id into new_history_id;
    history_ids:=history_ids || jsonb_build_array(new_history_id);
  end loop;
  return jsonb_build_object('publish_id',p_publish_id,'rates_count',count_rates,
    'history_count',count_history,'history_ids',history_ids,'duplicate',false,
    'saved_at',transaction_timestamp());
end;
$fn$;
revoke all on function public.publish_final_rates_v1(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.publish_final_rates_v1(uuid,jsonb,jsonb,jsonb) to authenticated;
comment on function public.publish_final_rates_v1(uuid,jsonb,jsonb,jsonb) is
  'Admin-confirmed final publish: validates source/linked rate payloads, commits rates and FINAL history atomically under existing RLS.';
