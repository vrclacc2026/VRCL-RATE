// Public browser configuration only. Safe to expose with correct RLS policies.
// NEVER put a Supabase secret/service_role key in frontend code.
export const SUPABASE_URL = "https://rdmgzkxroydsuantzbwn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ";
export const APP_NAME = "VRCL Wholesale Rate Portal";

const isAdminPage = typeof window !== 'undefined' && /\/admin(?:\.html)?\/?$/.test(window.location.pathname);

// One-time compatibility: preserve existing admin formula/rounding metadata from V2.
try {
  const oldKey = "VISHWAS_RATE_ADMIN_META_V2";
  const newKey = "VISHWAS_RATE_ADMIN_META_V3";
  if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
    localStorage.setItem(newKey, localStorage.getItem(oldKey));
  }

  // One-time admin cache repair. Published packaging/rates live in Supabase and the
  // canonical formula state lives in admin_state. Old recovery experiments could
  // leave browser-only metadata from another product in localStorage, so force one
  // clean cloud hydration without touching any database record or customer data.
  if (isAdminPage) {
    const repairKey = 'VRCL_ADMIN_CACHE_REPAIR_20260915_V2';
    if (localStorage.getItem(repairKey) !== '1') {
      localStorage.removeItem('VISHWAS_RATE_ADMIN_META_V3');
      localStorage.removeItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1');
      localStorage.removeItem('VRCL_ADMIN_FORMULA_RECOVERY_V1');
      localStorage.removeItem('VRCL_ADMIN_STATE_UPDATED_AT');
      localStorage.setItem(repairKey, '1');
    }
  }
} catch {}

// admin.html owns all rate rendering/saving. This module only adds product management.
if (isAdminPage) {
  import('./admin-products.js?v=20260915-clean-admin-cache-v2');
}
if (typeof window !== 'undefined' && /\/dashboard(?:\.html)?\/?$/.test(window.location.pathname)) {
  import('./backup-manager.js?v=20260915-clean-admin-cache-v2');
}
