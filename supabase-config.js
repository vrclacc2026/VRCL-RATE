// Public browser configuration only. Safe to expose with correct RLS policies.
// NEVER put a Supabase secret/service_role key in frontend code.
export const SUPABASE_URL = "https://rdmgzkxroydsuantzbwn.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ";
export const APP_NAME = "VRCL Wholesale Rate Portal";

const isAdminPage = typeof window !== 'undefined' && /\/admin(?:\.html)?\/?$/.test(window.location.pathname);
const isAdminRateCheck = typeof window !== 'undefined' && /\/customer-check(?:\.html)?\/?$/.test(window.location.pathname);

try {
  const oldKey = "VISHWAS_RATE_ADMIN_META_V2";
  const newKey = "VISHWAS_RATE_ADMIN_META_V3";
  if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
    localStorage.setItem(newKey, localStorage.getItem(oldKey));
  }
} catch {}

if (isAdminPage) {
  await import('./product-delete-control.js?v=20260916-product-delete-v3');
  await import('./packing-delete-guard.js?v=20260916-master-delete-guard-v2');
  await import('./udaan-rate-system.js?v=20260916-udaan-core-delete-v1');

  const udaanPhotoStyle = document.createElement('style');
  udaanPhotoStyle.id = 'vrclUdaanPhotoControls';
  udaanPhotoStyle.textContent = `
    .vrcl-udaan-mode .masterRow{display:flex!important;justify-content:flex-end;align-items:center;min-height:88px}
    .vrcl-udaan-mode .masterRow>:not(.photoCtl){display:none!important}
    .vrcl-udaan-mode .masterRow>.photoCtl{display:flex!important;border-left:0!important;padding-left:0!important;margin-left:auto!important}
    .vrcl-udaan-mode #looseRefRow{display:none!important}
  `;
  document.head.appendChild(udaanPhotoStyle);

  await import('./loose-reference-control.js?v=20260916-loose-ref-control-v3');
  await import('./admin-products.js?v=20260916-rate-table-rescue-v5');
}

if (isAdminRateCheck) {
  await import('./admin-rate-check-copy.js?v=20260916-copy-hit-fix-v4');
}

if (typeof window !== 'undefined' && /\/dashboard(?:\.html)?\/?$/.test(window.location.pathname)) {
  import('./backup-manager.js?v=20260916-rate-table-rescue-v5');
}
