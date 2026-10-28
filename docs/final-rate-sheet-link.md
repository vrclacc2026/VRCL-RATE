# Final rate publishing and linked Google Sheet

## Operator workflow
- Edit a rate and use TEST PREVIEW to inspect the on-screen rate card without publishing.
- PUBLISH FINAL calculates the selected product and linked products, shows their exact packing rates, and asks for confirmation.
- On confirmation, publish_final_rates_v1 commits rates and FINAL-tagged history in one database transaction. A history failure rolls back the rate write.
- Formula settings are still saved through the existing settings code; the atomic transaction covers rates, packing renames/deletions supplied to the publish, and history.
- Publish does not verify which numeric rate is commercially correct. Admin confirmation defines finality.
- Other admin actions (packing deletion, narration save, photo changes, source configuration) retain their existing behavior.

## Sheet link
Workbook: 1T8xuvj1mRgx9rWRocYg3uhBWn0P3sTHSvv05-tcalkI
- Final Feed uses one IMPORTDATA formula pointed at the read-only sheets-final-rates Edge Function.
- Rajkot, Ahmedabad and Udaan filter this feed. Rows are one packing per confirmed publication, newest publication first.
- Only snapshots with publication_status=final and publication_version=1 are exported.
- Existing All History and dated tabs retain legacy data. Legacy records are NOT retroactively labelled final.
- This is a linked view of Supabase final history. It is not an independent, scheduled Google Sheets archive.
- Google checks IMPORTDATA approximately hourly while the spreadsheet is open. Reopening/refreshing the browser does not force an immediate fetch. Database final history keeps accumulating while the Sheet is closed.
- Feed metadata shows the fetch timestamp in IST. The city tabs show an error if the feed is unavailable, and a waiting message before the first confirmed final publish.
- No ChatGPT scheduled task or daily assistant upload is involved.
- The feed has a dedicated read-only credential stored in the Sheet formula. Do not copy its URL into public source, logs or messages. Only its SHA-256 digest is in the Edge Function source.
- Large histories eventually require partitioning to stay within Google import size limits. The endpoint returns an explicit error rather than silently truncating data.

## Deployment
1. Apply database/publish-final-rates.sql (migration atomic_final_rate_publication was applied on 2026-10-28).
2. Deploy supabase/functions/sheets-final-rates/index.ts with JWT verification disabled; the function validates its own scoped token. Never expose the service-role key.
3. Publish the frontend files via the main branch GitHub Pages deployment.
4. Admins should hard-refresh an already-open admin page to load the updated modules.

## Validation
- Syntax checks passed for the admin, fallback, Udaan, configuration and shared publish modules.
- In-memory checks passed for cancellation, confirmed-payload copying, RPC arguments, and one-use confirmation.
- CSV checks passed for quoting, formula-injection prevention, IST timestamps, and exclusion of unmarked records.
- Google Sheets fetched the live endpoint successfully and returned FEED OK with zero confirmed publications at setup time.
- Database function signature, SECURITY INVOKER, search_path and grants were inspected. Security advisors added no new warning.
- Automatic approval review rejected invoking the production publish RPC for a rollback-only test because the user had not requested live database tests. No production write test was run. The first genuine admin-confirmed publication remains to be checked end to end.
