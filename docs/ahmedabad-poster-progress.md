# Ahmedabad poster release checks — 31 October 2026

The user requested short work stages and has now authorized live publication with existing admin login required.

- Restored the previous poster implementation and its original background image.
- Always include every active Ahmedabad product, including newly added product families.
- Generate packing columns from current saved Ahmedabad rate rows; preserve exact product/packing names and separate N Tin/S Tin and Jar/Bucket values.
- Rebuild on realtime events, 15-second polling, focus/online and before export. Removed fixed packing columns and the default restricted product selector.
- Added products without rates remain visible with blank (—) cells. Deleted/inactive products and orphaned rates cannot leave stale columns. Missing/invalid saved rates or network failures disable export.
- Verification: all 14 poster data/refresh tests pass; poster JS syntax and git diff whitespace checks pass. Original artwork is preserved outside the table. The public template has its printed product/packing/rate table blanked; rates load only after the existing admin login.

Browser QA completed on 31 October: the saved Ahmedabad snapshot renders 13 products and 13 packing columns with readable labels, original branding and four footer terms. Browser PNG encoding passed (3,329,676 bytes). Without login, the poster is hidden and Download is disabled; existing admin email/password is required. No live rates were modified during QA. Production reads current saved rates at runtime. Synthetic data/refresh tests passed previously (14/14).

Run: `node --test tests/poster-data.test.cjs tests/poster-refresh.test.cjs`
