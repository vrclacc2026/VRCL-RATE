# VRCL Secure Portal Setup

This branch replaces public city switching with authenticated, city-restricted access.

## Security model

- Every customer has an individual Supabase Authentication account.
- Every account has a `profiles` row with `role`, `city`, and `active` status.
- A Rajkot wholesaler receives only Rajkot rate rows from the database.
- Ahmedabad/Udaan names are not shown to a Rajkot wholesaler.
- Typing another city in a URL or modifying browser JavaScript does not bypass database Row Level Security.
- Admin pages require an active `admin` profile.
- Never put a Supabase `service_role` key in GitHub or browser code.

## One-time activation

1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
3. In Project Settings > API, copy the Project URL and public anon/publishable key.
4. Put those two public values in `supabase-config.js`.
5. In Authentication > Users, create the VRCL admin login.
6. Copy the admin user UUID and insert its profile using the example at the bottom of `supabase-schema.sql`.
7. Create wholesaler users in Authentication. In `admin.html`, assign each UUID to Rajkot, Ahmedabad, or Udaan.
8. Add rates using `admin.html`.
9. Only after testing, merge the secure branch to `main`.

## Important

The old `rates.json` must not be used for confidential rates after migration because a public GitHub repository exposes that file. Once the database migration is complete, remove confidential rate values from `rates.json` or delete the file if no longer needed.

For stronger admin protection, enable MFA for the admin account in Supabase Auth before production use.
