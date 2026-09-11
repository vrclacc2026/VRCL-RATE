-- Storage upsert requires SELECT in addition to INSERT and UPDATE.
-- Keep access limited to the active administrator's current session.
create policy product_images_admin_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.is_admin())
  and (select private.is_current_session())
);
