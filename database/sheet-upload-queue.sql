create table if not exists public.sheet_upload_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  city text not null check (city in ('Rajkot','Ahmedabad','Udaan')),
  product_id uuid not null references public.products(id),
  product_name text not null,
  rows jsonb not null check (jsonb_typeof(rows)='array'),
  status text not null default 'pending' check (status in ('pending','uploaded','failed')),
  uploaded_at timestamptz,
  last_error text
);
alter table public.sheet_upload_jobs enable row level security;
revoke all on public.sheet_upload_jobs from public, anon;
grant select on public.sheet_upload_jobs to authenticated;
create policy sheet_upload_jobs_admin_read on public.sheet_upload_jobs
  for select to authenticated using (private.is_admin() and private.is_current_session());
create or replace function public.request_sheet_upload_v1(p_city text,p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  actor uuid:=auth.uid();
  p_name text;
  rate_rows jsonb;
  job_id uuid;
begin
  if actor is null or not private.is_admin() or not private.is_current_session() then
    raise exception 'Active admin session required.' using errcode='42501';
  end if;
  if p_city not in ('Rajkot','Ahmedabad','Udaan') then raise exception 'Select a valid city.'; end if;
  select p.name into p_name from public.products p where p.id=p_product_id and p.city=p_city and p.active=true;
  if p_name is null then raise exception 'Selected product was not found.'; end if;
  select jsonb_agg(jsonb_build_object('packing',r.packing,'rate',r.rate,'narration',r.narration,'saved_at',r.updated_at) order by r.sort_order,r.packing)
    into rate_rows from public.rates r where r.city=p_city and r.product_id=p_product_id;
  if rate_rows is null then raise exception 'No saved rates for this product.'; end if;
  insert into public.sheet_upload_jobs(created_by,city,product_id,product_name,rows)
    values(actor,p_city,p_product_id,p_name,rate_rows) returning id into job_id;
  return jsonb_build_object('id',job_id,'city',p_city,'product',p_name,'count',jsonb_array_length(rate_rows),'status','pending');
end;
$fn$;
revoke all on function public.request_sheet_upload_v1(text,uuid) from public,anon;
grant execute on function public.request_sheet_upload_v1(text,uuid) to authenticated;
grant select,update on public.sheet_upload_jobs to service_role;
