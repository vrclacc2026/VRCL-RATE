alter table public.profiles
  add column if not exists allowed_cities text[];

update public.profiles
set allowed_cities = case
  when role = 'admin' then array['Rajkot','Ahmedabad','Udaan']::text[]
  when city = any(array['Rajkot','Ahmedabad','Udaan']::text[]) then array[city]::text[]
  else '{}'::text[]
end
where allowed_cities is null or cardinality(allowed_cities) = 0;

alter table public.profiles
  alter column allowed_cities set default '{}'::text[],
  alter column allowed_cities set not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_allowed_cities_valid'
  ) then
    alter table public.profiles
      add constraint profiles_allowed_cities_valid
      check (
        allowed_cities <@ array['Rajkot','Ahmedabad','Udaan']::text[]
        and cardinality(allowed_cities) <= 3
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_wholesaler_city_permission'
  ) then
    alter table public.profiles
      add constraint profiles_wholesaler_city_permission
      check (
        role <> 'wholesaler'
        or (
          city = any(allowed_cities)
          and cardinality(allowed_cities) between 1 and 3
        )
      );
  end if;
end
$migration$;

drop policy if exists products_authenticated_read on public.products;
create policy products_authenticated_read on public.products
for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.role = 'wholesaler'
      and products.city = any(p.allowed_cities)
  )
);

drop policy if exists rates_city_read on public.rates;
create policy rates_city_read on public.rates
for select to authenticated
using (
  (select private.is_admin())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.role = 'wholesaler'
      and rates.city = any(p.allowed_cities)
  )
);

create or replace function public.restore_vrcl_full_backup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  product_count integer := 0;
  rate_count integer := 0;
  history_count integer := 0;
  header_count integer := 0;
begin
  if not (select private.is_admin()) or not (select private.is_current_session()) then
    raise exception 'Admin access required';
  end if;
  if coalesce(payload->>'format','') <> 'VRCL_FULL_BACKUP_V2' then
    raise exception 'Unsupported backup format';
  end if;
  if jsonb_typeof(payload #> '{data,products}') <> 'array'
     or jsonb_typeof(payload #> '{data,rates}') <> 'array' then
    raise exception 'Backup is missing products or rates';
  end if;

  delete from public.rates;
  delete from public.products;

  insert into public.products(
    id,code,name,sort_order,active,ingredient_image_url,
    header_image_url,city,customer_visible
  )
  select
    id,code,name,coalesce(sort_order,0),coalesce(active,true),
    ingredient_image_url,header_image_url,city,coalesce(customer_visible,true)
  from jsonb_to_recordset(payload #> '{data,products}') as x(
    id uuid, code text, name text, sort_order integer, active boolean,
    ingredient_image_url text, header_image_url text, city text,
    customer_visible boolean
  );
  get diagnostics product_count = row_count;

  insert into public.rates(
    id,city,product_id,packing,rate,narration,sort_order,updated_at
  )
  select
    id,city,product_id,packing,coalesce(rate,0),coalesce(narration,''),
    coalesce(sort_order,0),coalesce(updated_at,now())
  from jsonb_to_recordset(payload #> '{data,rates}') as x(
    id uuid, city text, product_id uuid, packing text, rate numeric,
    narration text, sort_order integer, updated_at timestamptz
  );
  get diagnostics rate_count = row_count;

  delete from public.header_assets;
  if jsonb_typeof(payload #> '{data,header_assets}') = 'array' then
    insert into public.header_assets(code,image_url,updated_at)
    select code,image_url,coalesce(updated_at,now())
    from jsonb_to_recordset(payload #> '{data,header_assets}')
      as x(code text,image_url text,updated_at timestamptz);
    get diagnostics header_count = row_count;
  end if;

  if jsonb_typeof(payload #> '{data,profiles}') = 'array' then
    insert into public.profiles(
      id,display_name,role,city,active,created_at,login_id,allowed_cities
    )
    select
      x.id,coalesce(x.display_name,''),x.role::public.user_role,x.city,
      coalesce(x.active,true),coalesce(x.created_at,now()),x.login_id,
      case
        when cardinality(coalesce(x.allowed_cities,'{}'::text[])) > 0
          then x.allowed_cities
        when x.role = 'admin'
          then array['Rajkot','Ahmedabad','Udaan']::text[]
        else array[x.city]::text[]
      end
    from jsonb_to_recordset(payload #> '{data,profiles}') as x(
      id uuid, display_name text, role text, city text, active boolean,
      created_at timestamptz, login_id text, allowed_cities text[]
    )
    join auth.users u on u.id = x.id
    on conflict (id) do update set
      display_name = excluded.display_name,
      role = excluded.role,
      city = excluded.city,
      active = excluded.active,
      login_id = excluded.login_id,
      allowed_cities = excluded.allowed_cities;
  end if;

  if jsonb_typeof(payload #> '{data,rate_history}') = 'array' then
    delete from public.rate_history;
    insert into public.rate_history(
      id,city,product_id,changed_by,changed_at,snapshot
    )
    select
      x.id,x.city,x.product_id,
      case
        when x.changed_by is not null
         and exists(select 1 from auth.users u where u.id=x.changed_by)
        then x.changed_by else null
      end,
      coalesce(x.changed_at,now()),coalesce(x.snapshot,'{}'::jsonb)
    from jsonb_to_recordset(payload #> '{data,rate_history}') as x(
      id bigint, city text, product_id uuid, changed_by uuid,
      changed_at timestamptz, snapshot jsonb
    );
    get diagnostics history_count = row_count;
    perform setval(
      pg_get_serial_sequence('public.rate_history','id'),
      greatest(coalesce((select max(id) from public.rate_history),1),1),
      exists(select 1 from public.rate_history)
    );
  end if;

  if jsonb_typeof(payload #> '{data,admin_state}') = 'array' then
    insert into public.admin_state(key,value,updated_at,updated_by)
    select
      key,coalesce(value,'{}'::jsonb),coalesce(updated_at,now()),
      case
        when updated_by is not null
         and exists(select 1 from auth.users u where u.id=updated_by)
        then updated_by else (select auth.uid())
      end
    from jsonb_to_recordset(payload #> '{data,admin_state}')
      as x(key text,value jsonb,updated_at timestamptz,updated_by uuid)
    on conflict (key) do update set
      value=excluded.value,updated_at=now(),updated_by=(select auth.uid());
  end if;

  return jsonb_build_object(
    'ok',true,'products',product_count,'rates',rate_count,
    'rate_history',history_count,'header_assets',header_count
  );
end;
$function$;

revoke all on function public.restore_vrcl_full_backup(jsonb) from public, anon;
grant execute on function public.restore_vrcl_full_backup(jsonb) to authenticated;
