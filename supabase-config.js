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
  // Product removal is server-verified so inactive products cannot reappear.
  await import('./product-delete-control.js?v=20260915-product-delete-v2');

  // Prevent deletion of any packing row that is still used as another row's MASTER.
  await import('./packing-delete-guard.js?v=20260915-master-delete-guard-v1');

  // Udaan packing deletion is an explicit override of the Ahmedabad packing list.
  // Load this BEFORE the Udaan editor so its capture handler persists exclusions
  // and the same Ahmedabad packing cannot be auto-created again on reload/save.
  await import('./udaan-packing-delete-control.js?v=20260915-udaan-packing-delete-v1');

  // Udaan owns its Ahmedabad packing-reference editor.
  await import('./udaan-rate-system.js?v=20260915-udaan-packing-delete-v1');

  // Keep photo upload + customer visibility switch visible in Udaan while hiding
  // only the loose-rate controls that Udaan does not use.
  const udaanPhotoStyle = document.createElement('style');
  udaanPhotoStyle.id = 'vrclUdaanPhotoControls';
  udaanPhotoStyle.textContent = `
    .vrcl-udaan-mode .masterRow{display:flex!important;justify-content:flex-end;align-items:center;min-height:88px}
    .vrcl-udaan-mode .masterRow>:not(.photoCtl){display:none!important}
    .vrcl-udaan-mode .masterRow>.photoCtl{display:flex!important;border-left:0!important;padding-left:0!important;margin-left:auto!important}
    .vrcl-udaan-mode #looseRefRow{display:none!important}
  `;
  document.head.appendChild(udaanPhotoStyle);

  await import('./loose-reference-control.js?v=20260915-loose-ref-control-v2');
  await import('./admin-products.js?v=20260915-rate-table-rescue-v4');
}

if (isAdminRateCheck) {
  await import('./admin-rate-check-copy.js?v=20260915-copy-fix-v2');
}

if (typeof window !== 'undefined' && /\/dashboard(?:\.html)?\/?$/.test(window.location.pathname)) {
  import('./backup-manager.js?v=20260915-rate-table-rescue-v4');
}
