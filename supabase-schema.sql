-- VRCL secure wholesale rate portal
-- Run this in Supabase SQL Editor after creating the project.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin','wholesaler');

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

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id = uid and role = 'admin' and active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.rates enable row level security;

-- A user may read only their own profile. Admins may read/manage all profiles.
create policy "profiles_self_or_admin_read" on public.profiles
for select using (id = auth.uid() or public.is_admin(auth.uid()));

create policy "profiles_admin_write" on public.profiles
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Products are visible only to authenticated active users.
create policy "products_authenticated_read" on public.products
for select using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.active=true)
);

create policy "products_admin_write" on public.products
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Critical rule: wholesaler can read rates ONLY for their assigned city.
-- Admin can read/write every city.
create policy "rates_city_read" on public.rates
for select using (
  public.is_admin(auth.uid())
  or exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.active=true
      and p.role='wholesaler'
      and p.city = rates.city
  )
);

create policy "rates_admin_write" on public.rates
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Keep updated_at current.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists rates_touch_updated_at on public.rates;
create trigger rates_touch_updated_at before update on public.rates
for each row execute function public.touch_updated_at();

-- Optional starter products.
insert into public.products(code,name,sort_order) values
('palm','Palmolein',1),('visvita','Visvita',2),('sunflower','Sunflower',3),
('groundnut','Groundnut',4),('cotton','Cottonseed',5),('mustard','Mustard',6),('soya','Soya',7)
on conflict (code) do nothing;

-- IMPORTANT FIRST ADMIN SETUP:
-- 1) Create the admin user in Supabase Authentication > Users.
-- 2) Copy that user's UUID and run:
-- insert into public.profiles(id,display_name,role,active)
-- values ('USER_UUID','VRCL Admin','admin',true)
-- on conflict(id) do update set role='admin',active=true;

-- WHOLESALER SETUP EXAMPLE:
-- Create user in Authentication, then:
-- insert into public.profiles(id,display_name,role,city,active)
-- values ('USER_UUID','Shreeji Traders','wholesaler','Rajkot',true);
