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

- `poster.html` — admin-only Ahmedabad poster, using the original emerald–gold artwork, saved live rates, N/S Tin columns, and HD PNG download. It refreshes on rate events, every 15 seconds, on returning to the page, and before export. Failed checks disable download. All active Ahmedabad products are always included, including newly added oils. Packing columns and names come only from current saved Ahmedabad rates; deletions, renames and N/S Tin are reflected automatically. Products without saved rates show blank (—) cells.

## Development checks

Run the repository tests with:

```bash
NODE_OPTIONS=--experimental-vm-modules node --test tests/*.cjs
```

Supabase schema and migration files are under `supabase/`. Never put a service-role key or database password in browser code.
