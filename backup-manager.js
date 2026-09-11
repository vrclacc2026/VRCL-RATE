import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js?v=20260911-formula-cloud';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vrcl-admin-auth' }
});

const META = 'VISHWAS_RATE_ADMIN_META_V3';
const LOCKKEY = 'VRCL_ADMIN_COLUMN_LOCKS';
const MASTERKEY = 'VRCL_MASTER_LOCK';
const STATE_UPDATED = 'VRCL_ADMIN_STATE_UPDATED_AT';
const SYNCED_STATE = 'VRCL_ADMIN_SYNCED_FORMULA_STATE_V1';
const LOCAL_RECOVERY = 'VRCL_ADMIN_FORMULA_RECOVERY_V1';
const RESTORE_SELECTION = 'VRCL_RESTORED_PRODUCT';
const CLOUDKEY = 'admin_formula_state_v1';
const FULL_FORMAT = 'VRCL_FULL_BACKUP_V2';
const PRODUCT_FORMAT = 'VRCL_PRODUCT_BACKUP_V1';
const $ = id => document.getElementById(id);
let syncQueue = Promise.resolve();
let restoreInProgress = false;
let hydrationTask = null;

function safeJson(s, fallback = {}) { try { return JSON.parse(s || '') ?? fallback; } catch { return fallback; } }
function currentLocalState() {
  return {
    meta: safeJson(localStorage.getItem(META), {}),
    locks: safeJson(localStorage.getItem(LOCKKEY), {}),
    master_lock: localStorage.getItem(MASTERKEY) === '1',
    captured_at: localStorage.getItem(STATE_UPDATED) || null
  };
}
function stateSignature(v) { return JSON.stringify([v.meta, v.locks, v.master_lock]); }
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]));
}
function mergeFormulaState(cloud, local, synced) {
  const merged = { ...cloud, meta: { ...(local.meta || {}), ...(cloud.meta || {}) } };
  for (const [key, value] of Object.entries(local.meta || {})) {
    // Preserve an unsynced edit only when that product has not changed on the server.
    // A timestamp for a different product (or a fast device clock) cannot hide a restore.
    if (synced && !sameValue(value, synced.meta?.[key]) && sameValue(cloud.meta?.[key], synced.meta?.[key])) merged.meta[key] = value;
  }
  for (const key of ['locks', 'master_lock']) {
    if (cloud[key] === undefined || (synced && !sameValue(local[key], synced[key]) && sameValue(cloud[key], synced[key]))) merged[key] = local[key];
  }
  return merged;
}
function preserveLocalFormulaCopy(local, merged) {
  const recovery = safeJson(localStorage.getItem(LOCAL_RECOVERY), { meta: {} });
  if (!recovery.meta || typeof recovery.meta !== 'object') recovery.meta = {};
  let changed = false;
  for (const [key, value] of Object.entries(local.meta || {})) {
    if (!sameValue(value, merged.meta?.[key])) { recovery.meta[key] = value; changed = true; }
  }
  if (changed) localStorage.setItem(LOCAL_RECOVERY, JSON.stringify({ ...recovery, captured_at: new Date().toISOString() }));
}
function applyLocalState(v, updatedAt = new Date().toISOString()) {
  if (!v || typeof v !== 'object') return;
  if (v.meta && typeof v.meta === 'object') localStorage.setItem(META, JSON.stringify(v.meta));
  if (v.locks && typeof v.locks === 'object') localStorage.setItem(LOCKKEY, JSON.stringify(v.locks));
  if (typeof v.master_lock === 'boolean') localStorage.setItem(MASTERKEY, v.master_lock ? '1' : '0');
  localStorage.setItem(STATE_UPDATED, updatedAt);
  window.dispatchEvent(new Event('vrcl:admin-state-applied'));
}
async function isAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data } = await supabase.from('profiles').select('role,active').eq('id', session.user.id).single();
  return !!data && data.role === 'admin' && data.active === true;
}
function syncStateToCloud(value = currentLocalState()) {
  const snapshot = JSON.parse(JSON.stringify(value));
  const task = syncQueue.catch(() => {}).then(async () => {
    if (!await isAdmin()) throw new Error('Active admin login required to save formulas.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Admin session expired. Please log in again.');
    const { data, error } = await supabase.from('admin_state').upsert({ key: CLOUDKEY, value: snapshot, updated_by: session.user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' }).select('key').single();
    if (error) throw error;
    if (data?.key !== CLOUDKEY) throw new Error('Formulas could not be saved. Please try again.');
    localStorage.setItem(SYNCED_STATE, JSON.stringify(snapshot));
  });
  syncQueue = task;
  return task;
}
export function hydrateStateFromCloud() {
  if (!hydrationTask) hydrationTask = loadStateFromCloud().finally(() => { hydrationTask = null; });
  return hydrationTask;
}
async function loadStateFromCloud() {
  if (!await isAdmin()) return;
  const local = currentLocalState();
  const { data, error } = await supabase.from('admin_state').select('value,updated_at').eq('key', CLOUDKEY).maybeSingle();
  if (error) throw error;
  if (!data?.value || restoreInProgress || stateSignature(local) !== stateSignature(currentLocalState())) return;
  const synced = safeJson(localStorage.getItem(SYNCED_STATE), null);
  const merged = mergeFormulaState(data.value, local, synced);
  preserveLocalFormulaCopy(local, merged);
  localStorage.setItem(SYNCED_STATE, JSON.stringify(data.value));
  applyLocalState(merged, data.updated_at || data.value.captured_at || new Date().toISOString());
}
function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function readFileJson(file) {
  return file.text().then(t => JSON.parse(t));
}
function bytesToBase64(bytes) {
  let s = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}
function base64ToBytes(s) {
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function urlToEmbedded(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    return { content_type: blob.type || 'application/octet-stream', base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  } catch (e) {
    return { source_url: url, error: String(e?.message || e) };
  }
}
async function uploadEmbeddedImage(image, path) {
  if (!image?.base64) return image?.source_url || null;
  const bytes = base64ToBytes(image.base64);
  const { error } = await supabase.storage.from('product-images').upload(path, bytes, { contentType: image.content_type || 'image/webp', cacheControl: '31536000', upsert: true });
  if (error) throw error;
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
function selectedProductId() { return document.querySelector('#productArea .productBtn.active')?.dataset.product || ''; }
function selectedCity() { return document.querySelector('#cityArea .city.active')?.dataset.city || 'Rajkot'; }
function iconStyle() {
  return 'width:30px;height:30px;padding:0;border:1px solid #cbd5e1;border-radius:8px;background:#fff;display:inline-grid;place-items:center;cursor:pointer;box-shadow:0 2px 0 #d5dbe2;font-size:14px';
}
function noteStyle() { return 'font-size:8px;color:#667085;line-height:1.25'; }

async function makeProductBackup() {
  const id = selectedProductId(); if (!id) throw new Error('Select a product first.');
  if (!window.vrclAdminBackup?.captureProduct) throw new Error('Refresh the admin page before taking a backup.');
  const editor = window.vrclAdminBackup.captureProduct();
  if (editor.product_id !== id) throw new Error('The selected product changed. Please try again.');
  const state = currentLocalState();
  await syncStateToCloud(state);
  const [{ data: product, error: pe }, { data: rates, error: re }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('rates').select('*').eq('product_id', id).order('city').order('sort_order')
  ]);
  if (pe) throw pe; if (re) throw re;
  const productMeta = {};
  for (const [k, v] of Object.entries(state.meta || {})) if (k.endsWith('|' + id)) productMeta[k] = v;
  const backup = {
    format: PRODUCT_FORMAT,
    created_at: new Date().toISOString(),
    product,
    rates: [...(rates || []).filter(r => r.city !== editor.city), ...editor.rates],
    formula_state: { meta: productMeta, locks: state.locks, master_lock: state.master_lock },
    images: {
      ingredient: await urlToEmbedded(product.ingredient_image_url),
      header: await urlToEmbedded(product.header_image_url)
    }
  };
  const clean = String(product.name || product.code || 'product').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  downloadJson(backup, `vrcl-${clean}-backup-${new Date().toISOString().slice(0,10)}.json`);
}
function prepareProductRestore(backup) {
  if (backup?.format !== PRODUCT_FORMAT || !backup.product?.id) throw new Error('Invalid VRCL product backup file.');
  if (!Array.isArray(backup.rates)) throw new Error('Backup is missing packaging/rate data. Restore was not started.');
  const p = { ...backup.product };
  if (!['Rajkot','Ahmedabad','Udaan'].includes(p.city)) throw new Error('Backup has an invalid product city.');
  const rates = backup.rates.map(r => {
    if (!r || typeof r.packing !== 'string' || !r.packing.trim() || r.product_id !== p.id || r.city !== p.city || !Number.isFinite(Number(r.rate))) throw new Error('Backup has invalid packaging/rate data. Restore was not started.');
    return { ...r, id: r.id || crypto.randomUUID() };
  });
  if (new Set(rates.map(r => r.packing)).size !== rates.length) throw new Error('Backup has duplicate packaging rows.');
  const productKey = p.city + '|' + p.id;
  const formula = backup.formula_state?.meta?.[productKey];
  if (!rates.length && Object.keys(formula?.rows || {}).length) throw new Error('This backup contains formulas but no saved packaging/rates. A complete backup is needed.');
  return { product: p, rates, formula };
}
async function restoreProductBackup(backup) {
  const prepared = prepareProductRestore(backup);
  if (!await isAdmin()) throw new Error('Admin access required.');
  restoreInProgress = true;
  try {
  await syncQueue.catch(() => {});
  const p = prepared.product;
  const stamp = Date.now();
  if (backup.images?.ingredient?.base64) p.ingredient_image_url = await uploadEmbeddedImage(backup.images.ingredient, `restored/ingredients/${p.code || p.id}-${stamp}.webp`);
  if (backup.images?.header?.base64) p.header_image_url = await uploadEmbeddedImage(backup.images.header, `restored/headers/${p.code || p.id}-${stamp}.webp`);
  const { data: restored, error } = await supabase.rpc('restore_vrcl_product_backup', {
    product_payload: p,
    rates_payload: prepared.rates
  });
  if (error) throw error;
  if (!restored?.ok || restored.rates !== prepared.rates.length) throw new Error('The server did not confirm all packaging rows. Please retry the restore.');
  const local = currentLocalState();
  // A product backup may only replace the formulas for its own city/product.
  if (prepared.formula) local.meta = { ...(local.meta || {}), [p.city + '|' + p.id]: prepared.formula };
  if (backup.formula_state?.locks) local.locks = backup.formula_state.locks;
  if (typeof backup.formula_state?.master_lock === 'boolean') local.master_lock = backup.formula_state.master_lock;
  applyLocalState(local);
  try { await syncStateToCloud(); }
  catch (error) { throw new Error('Packaging restored, but formulas could not be saved: '+(error.message || error)+'. Please retry this backup.'); }
  sessionStorage.setItem(RESTORE_SELECTION, JSON.stringify({city:p.city,product_id:p.id}));
  const formulasIncluded = !!prepared.formula && prepared.rates.every(r => typeof prepared.formula.rows?.[r.packing]?.formula === 'string');
  return { ...restored, formulas_included: formulasIncluded, product_name: p.name };
  } finally { restoreInProgress = false; }
}

async function collectCodeSnapshot() {
  const files = ['index.html','admin.html','dashboard.html','customer-check.html','users.html','customer.js','customer.css','admin-products.js','backup-manager.js','supabase-config.js'];
  const out = {};
  await Promise.all(files.map(async f => {
    try { const r = await fetch('./' + f + '?backup=' + Date.now(), { cache: 'no-store' }); if (r.ok) out[f] = await r.text(); }
    catch {}
  }));
  return out;
}
async function buildFullBackup() {
  await hydrateStateFromCloud();
  await syncStateToCloud();
  const [profiles, products, rates, history, activity, headers, adminState] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at'),
    supabase.from('products').select('*').order('city').order('sort_order'),
    supabase.from('rates').select('*').order('city').order('sort_order'),
    supabase.from('rate_history').select('*').order('changed_at'),
    supabase.from('user_activity').select('*').order('last_seen'),
    supabase.from('header_assets').select('*').order('code'),
    supabase.from('admin_state').select('*').order('key')
  ]);
  const errs = [profiles,products,rates,history,activity,headers,adminState].map(x=>x.error).filter(Boolean); if (errs.length) throw errs[0];
  const plist = products.data || [];
  const imageMap = {};
  for (const p of plist) {
    imageMap[p.id] = {
      ingredient: await urlToEmbedded(p.ingredient_image_url),
      header: await urlToEmbedded(p.header_image_url)
    };
  }
  const backup = {
    format: FULL_FORMAT,
    created_at: new Date().toISOString(),
    restore_scope: 'data+formulas+photos+runtime-code-snapshot',
    data: {
      profiles: profiles.data || [], products: plist, rates: rates.data || [], rate_history: history.data || [],
      user_activity: activity.data || [], header_assets: headers.data || [], admin_state: adminState.data || []
    },
    local_admin_state: currentLocalState(),
    images: imageMap,
    code_snapshot: await collectCodeSnapshot(),
    note: 'GitHub remains the authoritative deploy/version history. This backup restores Supabase business data, formulas and photos from the dashboard.'
  };
  return backup;
}
async function saveCloudBackup(backup) {
  const name = `full/vrcl-full-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(backup));
  const { error } = await supabase.storage.from('site-backups').upload(name, bytes, { contentType: 'application/json', upsert: false });
  if (error) throw error;
  return name;
}
async function restoreFullBackup(backup) {
  if (backup?.format !== FULL_FORMAT) throw new Error('Invalid VRCL full backup file.');
  if (!await isAdmin()) throw new Error('Admin access required.');
  restoreInProgress = true;
  try {
  await syncQueue.catch(() => {});
  const copy = JSON.parse(JSON.stringify(backup));
  const stamp = Date.now();
  for (const p of copy.data?.products || []) {
    const imgs = copy.images?.[p.id] || {};
    if (imgs.ingredient?.base64) p.ingredient_image_url = await uploadEmbeddedImage(imgs.ingredient, `restored/ingredients/${p.code || p.id}-${stamp}.webp`);
    if (imgs.header?.base64) p.header_image_url = await uploadEmbeddedImage(imgs.header, `restored/headers/${p.code || p.id}-${stamp}.webp`);
  }
  const { data, error } = await supabase.rpc('restore_vrcl_full_backup', { payload: copy });
  if (error) throw error;
  if (copy.local_admin_state) applyLocalState(copy.local_admin_state);
  else {
    const cloud = (copy.data?.admin_state || []).find(x => x.key === CLOUDKEY)?.value;
    if (cloud) applyLocalState(cloud);
  }
  await syncStateToCloud();
  return data;
  } finally { restoreInProgress = false; }
}

function addProductControls() {
  const photo = $('photoPrev'); if (!photo || document.getElementById('vrclProductBackupTools')) return;
  const host = photo.parentElement; if (!host) return;
  const tools = document.createElement('div');
  tools.id = 'vrclProductBackupTools';
  tools.style.cssText = 'display:flex;flex-direction:column;gap:5px;align-items:center;flex:0 0 auto';
  const backup = document.createElement('button'); backup.type='button'; backup.title='Backup selected product'; backup.setAttribute('aria-label','Backup selected product'); backup.style.cssText=iconStyle(); backup.innerHTML='↓';
  const restore = document.createElement('button'); restore.type='button'; restore.title='Restore product backup'; restore.setAttribute('aria-label','Restore product backup'); restore.style.cssText=iconStyle(); restore.innerHTML='↺';
  const input = document.createElement('input'); input.type='file'; input.accept='.json,application/json'; input.hidden=true;
  tools.append(backup, restore, input); photo.insertAdjacentElement('afterend', tools);
  backup.onclick = async () => { backup.disabled=true; try { await makeProductBackup(); } catch(e){ alert('Product backup failed: '+(e.message||e)); } finally { backup.disabled=false; } };
  restore.onclick = () => input.click();
  input.onchange = async () => {
    const file=input.files?.[0]; if(!file)return;
    if(!confirm('Restore this product backup? Current data for that product will be replaced.')){ input.value=''; return; }
    restore.disabled=true;
    try { const result = await restoreProductBackup(await readFileJson(file)); alert('Product restored: '+result.product_name+'. Packaging rows: '+result.rates+'.'+(result.formulas_included?'':' This backup does not contain all formula settings.')); location.reload(); }
    catch(e){ alert('Product restore failed: '+(e.message||e)); }
    finally { restore.disabled=false; input.value=''; }
  };
}

function upgradeDashboardBackup() {
  const old = $('manifest'); if (!old || document.getElementById('vrclRestoreFull')) return;
  old.textContent = 'DOWNLOAD FULL SITE BACKUP';
  old.onclick = async () => {
    old.disabled=true; const prev=old.textContent; old.textContent='PREPARING FULL BACKUP…';
    try { const backup=await buildFullBackup(); await saveCloudBackup(backup); downloadJson(backup,`vrcl-full-site-backup-${new Date().toISOString().slice(0,10)}.json`); }
    catch(e){ alert('Full backup failed: '+(e.message||e)); }
    finally { old.disabled=false; old.textContent=prev; }
  };
  const restore=document.createElement('button'); restore.id='vrclRestoreFull'; restore.type='button'; restore.className='btn dark'; restore.style.cssText='margin-top:8px;margin-left:6px'; restore.textContent='RESTORE FULL SITE';
  const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json'; input.hidden=true;
  old.insertAdjacentElement('afterend',restore); restore.insertAdjacentElement('afterend',input);
  const info=document.createElement('div'); info.style.cssText=noteStyle()+';margin-top:8px'; info.textContent='Includes products, rates, formulas, narration, customer visibility, photos, header assets and a runtime code snapshot. GitHub keeps the deploy/version history.'; input.insertAdjacentElement('afterend',info);
  restore.onclick=()=>input.click();
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    if(!confirm('FULL RESTORE will replace current products/rates/formulas with this backup. Continue?')){input.value='';return;}
    restore.disabled=true;restore.textContent='RESTORING…';
    try{const result=await restoreFullBackup(await readFileJson(file));alert('Full site data restored successfully. Products: '+(result?.products??'—')+', Rates: '+(result?.rates??'—'));location.reload();}
    catch(e){alert('Full restore failed: '+(e.message||e));}
    finally{restore.disabled=false;restore.textContent='RESTORE FULL SITE';input.value='';}
  };
}

async function bootAdmin() {
  try { await hydrateStateFromCloud(); } catch (error) { console.error('Formula settings could not be loaded:', error); }
  addProductControls();
  let last = stateSignature(currentLocalState());
  setInterval(async () => {
    addProductControls();
    if (restoreInProgress) return;
    const state = currentLocalState(), now = stateSignature(state);
    if (now !== last) {
      try { await syncStateToCloud(state); last = now; }
      catch (error) { console.error('Formula settings could not be saved:', error); }
    }
  }, 2500);
  window.addEventListener('beforeunload', () => { if (!restoreInProgress && stateSignature(currentLocalState()) !== last) syncStateToCloud().catch(() => {}); });
}
async function bootDashboard() { upgradeDashboardBackup(); setInterval(upgradeDashboardBackup, 1500); }

const path = location.pathname;
if (/\/admin(?:\.html)?\/?$/.test(path)) bootAdmin();
if (/\/dashboard(?:\.html)?\/?$/.test(path)) bootDashboard();
