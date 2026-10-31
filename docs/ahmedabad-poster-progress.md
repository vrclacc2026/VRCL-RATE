# Ahmedabad poster checkpoint — 30 October 2026

The user requested short work stages. This checkpoint completes the dynamic-data stage, not final live publication.

- Restored the previous poster implementation and its original background image.
- Always include every active Ahmedabad product, including newly added product families.
- Generate packing columns from current saved Ahmedabad rate rows; preserve exact product/packing names and separate N Tin/S Tin and Jar/Bucket values.
- Rebuild on realtime events, 15-second polling, focus/online and before export. Removed fixed packing columns and the default restricted product selector.
- Added products without rates remain visible with blank (—) cells. Deleted/inactive products and orphaned rates cannot leave stale columns. Missing/invalid saved rates or network failures disable export.
- Verification: all 14 poster data/refresh tests pass; poster JS syntax and git diff whitespace checks pass. Original artwork is preserved outside the table. The public template has its printed product/packing/rate table blanked; rates load only after the existing admin login.

Next small stage: inspect the full all-product/all-packing layout visually against the original artwork; many columns may require table pagination to keep text readable. Verify HD PNG output and actual live data, then publish after that stage. Do not claim the new page is live yet. Do not rebuild the artwork.

Run: `node --test tests/poster-data.test.cjs tests/poster-refresh.test.cjs`
