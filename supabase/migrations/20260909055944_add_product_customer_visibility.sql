-- Existing products stay visible until an admin switches them OFF.
alter table public.products
  add column customer_visible boolean not null default true;

-- Keep existing city, account, session and write policies in place.
-- Admins can still select, edit and restore products hidden from customers.
create policy products_customer_visibility
on public.products
as restrictive for select to authenticated
using ((select private.is_admin()) or customer_visible);

-- Withhold the rates too, including requests made outside the Customer Panel.
create policy rates_customer_visibility
on public.rates
as restrictive for select to authenticated
using (
  (select private.is_admin())
  or product_id in (
    select id from public.products where customer_visible
  )
);
