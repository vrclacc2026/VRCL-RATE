-- VRCL secure wholesale rate portal

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

do $$ begin
  create type public.user_role as enum ('admin','wholesaler');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.user_role not null default 'wholesaler',
  city text check (city in ('Rajkot','Ahmedabad','Udaan')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists public.rates (
  id uuid primary key default gen_random_uuid(),
  city text not null check (city in ('Rajkot','Ahmedabad','Udaan')),
  product_id uuid not null references public.products(id) on delete cascade,
  packing text not null,
  rate numeric(12,2) not null default 0,
  narration text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique(city, product_id, packing)
);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active = true
  );
$$;

create or replace function private.is_current_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    where s.id = nullif((select auth.jwt()->>'session_id'),'')::uuid
      and s.user_id = (select auth.uid())
      and s.id = (
        select s2.id
        from auth.sessions s2
        where s2.user_id = (select auth.uid())
        order by s2.created_at desc, s2.id desc
        limit 1
      )
  );
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.is_current_session() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_current_session() to authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.rates enable row level security;

drop policy if exists "profiles_self_or_admin_read" on public.profiles;
create policy "profiles_self_or_admin_read" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "profiles_single_session_guard" on public.profiles;
create policy "profiles_single_session_guard" on public.profiles
as restrictive for all to authenticated
using ((select private.is_current_session()))
with check ((select private.is_current_session()));

drop policy if exists "products_authenticated_read" on public.products;
create policy "products_authenticated_read" on public.products
for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true));

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "products_single_session_guard" on public.products;
create policy "products_single_session_guard" on public.products
as restrictive for all to authenticated
using ((select private.is_current_session()))
with check ((select private.is_current_session()));

drop policy if exists "rates_city_read" on public.rates;
create policy "rates_city_read" on public.rates
for select to authenticated
using (
  (select private.is_admin())
  or exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active=true
      and p.role='wholesaler' and p.city = rates.city
  )
);

drop policy if exists "rates_admin_write" on public.rates;
create policy "rates_admin_write" on public.rates
for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "rates_single_session_guard" on public.rates;
create policy "rates_single_session_guard" on public.rates
as restrictive for all to authenticated
using ((select private.is_current_session()))
with check ((select private.is_current_session()));

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin new.updated_at = now(); return new; end; $$;

revoke all on function private.touch_updated_at() from public;

drop trigger if exists rates_touch_updated_at on public.rates;
create trigger rates_touch_updated_at before update on public.rates
for each row execute function private.touch_updated_at();

revoke all on public.profiles, public.products, public.rates from anon;
grant select, insert, update, delete on public.profiles, public.products, public.rates to authenticated;

insert into public.products(code,name,sort_order) values
('palm','Palmolein',1),('visvita','Visvita',2),('sunflower','Sunflower',3),
('groundnut','Groundnut',4),('cotton','Cottonseed',5),('mustard','Mustard',6),('soya','Soya',7)
on conflict (code) do nothing;

-- FIRST ADMIN SETUP:
-- Create user in Supabase Authentication > Users, then:
-- insert into public.profiles(id,display_name,role,active)
-- values ('USER_UUID','VRCL Admin','admin',true)
-- on conflict(id) do update set role='admin',active=true;

-- WHOLESALER EXAMPLE:
-- insert into public.profiles(id,display_name,role,city,active)
-- values ('USER_UUID','Shreeji Traders','wholesaler','Rajkot',true);
