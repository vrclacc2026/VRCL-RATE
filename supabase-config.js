// Public browser configuration only. Safe to expose with correct RLS policies.
// NEVER put a Supabase secret/service_role key in frontend code.
export const SUPABASE_URL = "https://rdmgzkxroydsuantzbwn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ";
export const APP_NAME = "VRCL Wholesale Rate Portal";

const isAdminPage = typeof window !== 'undefined' && /\/admin(?:\.html)?\/?$/.test(window.location.pathname);

try {
  const oldKey = "VISHWAS_RATE_ADMIN_META_V2";
  const newKey = "VISHWAS_RATE_ADMIN_META_V3";
  if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
    localStorage.setItem(newKey, localStorage.getItem(oldKey));
  }
} catch {}

// admin.html owns the normal rate editor; admin-products provides product management
// plus an exact DB-backed fallback only when that normal editor leaves the table blank.
if (isAdminPage) {
  import('./admin-products.js?v=20260915-exact-selected-product-v1');
}
if (typeof window !== 'undefined' && /\/dashboard(?:\.html)?\/?$/.test(window.location.pathname)) {
  import('./backup-manager.js?v=20260915-exact-selected-product-v1');
}
