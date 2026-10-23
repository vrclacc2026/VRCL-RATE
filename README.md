# VRCL Rate Portal

Daily wholesale rate portal for Vishwas Refoils & Consumer Limited.

## Pages

- `index.html` — customer rate portal.
- `admin.html` — authorized rate, formula, and packaging editor.
- `users.html` — customer account and city access management.
- `dashboard.html` — admin activity, backup, and system checks.
- `customer-check.html` — admin-only view for reviewing customer rate cards.

## Rate publishing

1. Open `admin.html`, sign in, and select the city and product.
2. Edit the intended rates or formula settings, then review the calculated rates.
3. Select **SAVE ALL** and wait for the success message. If saving fails, the editor shows the error and keeps the published rates unchanged.
4. Customer sessions receive rate changes through Supabase Realtime. The customer page also checks for updates every three minutes as a fallback.

Rajkot and Ahmedabad have their own rates. Udaan uses its selected city/product source and configured formulas. Review the source and formula fields before saving linked products.

## Development checks

Run the repository tests with:

```bash
NODE_OPTIONS=--experimental-vm-modules node --test tests/*.cjs
```

Supabase schema and migration files are under `supabase/`. Never put a service-role key or database password in browser code.
