// Public browser configuration only. Safe to expose with correct RLS policies.
// NEVER put a Supabase secret/service_role key in frontend code.
export const SUPABASE_URL = "https://rdmgzkxroydsuantzbwn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ";
export const APP_NAME = "VRCL Wholesale Rate Portal";

// One-time compatibility: preserve existing admin formula/rounding metadata from V2.
try {
  const oldKey = "VISHWAS_RATE_ADMIN_META_V2";
  const newKey = "VISHWAS_RATE_ADMIN_META_V3";
  if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
    localStorage.setItem(newKey, localStorage.getItem(oldKey));
  }
} catch {}

// On the admin page, admin.html already imports backup-manager.js directly.
// Import it only once: duplicate module URLs create two hydration/sync runtimes
// and can race the selected product's rate table. Product management stays separate.
if (typeof window !== 'undefined' && /\/admin(?:\.html)?\/?$/.test(window.location.pathname)) {
  import('./admin-products.js?v=20260915-admin-selection-guard');
}
if (typeof window !== 'undefined' && /\/dashboard(?:\.html)?\/?$/.test(window.location.pathname)) {
  import('./backup-manager.js?v=20260915-admin-single-runtime');
}
