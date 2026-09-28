import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js?v=20260912-rate-tools';

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
export function syncStateToCloud(value = currentLocalState()) {
  const snapshot = JSON.parse(JSON.stringify(value));
  const task = syncQueue.catch(() => {}).then(async () => {
    if (!await isAdmin()) throw new Error('Active admin login required to save formulas.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Admin session expired. Please log in again.');
    const synced = safeJson(localStorage.getItem(SYNCED_STATE), null);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: current, error: readError } = await supabase.from('admin_state').select('value,updated_at').eq('key', CLOUDKEY).maybeSingle();
      if (readError) throw readError;
      // A browser can have only one product cached. Merge against the newest
      // cloud copy instead of replacing all products with that partial cache.
      const merged = mergeFormulaState(current?.value || {}, snapshot, synced);
      for (const [key, state] of Object.entries(current?.value?.meta || {})) {
        if (!Array.isArray(state?.excludedPackings) || !merged.meta?.[key]) continue;
        const productState = merged.meta[key];
        const excluded = [...new Set([...state.excludedPackings, ...(productState.excludedPackings || [])])];
        productState.excludedPackings = excluded;
        for (const packing of excluded) if (productState.rows) delete productState.rows[packing];
      }
      merged.captured_at = new Date().toISOString();
      const update = { value: merged, updated_by: session.user.id, updated_at: merged.captured_at };
      // A second admin may save between the read and write. Retry on a changed
      // timestamp so that neither tab can erase the other tab's product edits.
      const result = current
        ? await supabase.from('admin_state').update(update).eq('key', CLOUDKEY).eq('updated_at', current.updated_at).select('key').maybeSingle()
        : await supabase.from('admin_state').upsert({ key: CLOUDKEY, ...update }, { onConflict: 'key' }).select('key').maybeSingle();
      if (result.error) throw result.error;
      if (result.data?.key === CLOUDKEY) {
        localStorage.setItem(SYNCED_STATE, JSON.stringify(merged));
        return;
      }
    }
    throw new Error('Formula settings changed in another tab. Please save again.');
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
function selectedRestoreTarget() {
  const product_id = selectedProductId();
  return product_id ? { product_id, city: selectedCity() } : null;
}
function iconStyle() {
  return 'width:30px;height:30px;padding:0;border:1px solid #cbd5e1;border-radius:8px;background:#fff;display:inline-grid;place-items:center;cursor:pointer;box-shadow:0 2px 0 #d5dbe2;font-size:14px';
}
function noteStyle() { return 'font-size:8px;color:#667085;line-height:1.25'; }

async function makeProductBackup() {
  const id = selectedProductId(); if (!id) throw new Error('Select a product first.');
  if (!await isAdmin()) throw new Error('Active admin login required to take a backup.');
  const source = selectedCity() === 'Udaan' ? window.vrclUdaanBackup : window.vrclFallbackBackup?.active?.() ? window.vrclFallbackBackup : window.vrclAdminBackup;
  if (!source?.captureProduct) throw new Error('Wait for the packing editor to finish loading.');
  const editor = source.captureProduct();
  if (editor.product_id !== id) throw new Error('The selected product changed. Please try again.');
  const [{ data: product, error: pe }, { data: cloud, error: ce }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('admin_state').select('value').eq('key', CLOUDKEY).maybeSingle()
  ]);
  if (pe) throw pe; if (ce) throw ce;
  const cloudState = cloud?.value || {}, localState = currentLocalState();
  const productKey = editor.city + '|' + id;
  const productMeta = { [productKey]: editor.formula_state || cloudState.meta?.[productKey] || localState.meta?.[productKey] || {} };
  const backup = {
    format: PRODUCT_FORMAT,
    created_at: new Date().toISOString(),
    product,
    rates: editor.rates,
    formula_state: { meta: productMeta, locks: cloudState.locks || localState.locks, master_lock: cloudState.master_lock ?? localState.master_lock },
    images: {
      ingredient: await urlToEmbedded(product.ingredient_image_url),
      header: await urlToEmbedded(product.header_image_url)
    }
  };
  const clean = String(product.name || product.code || 'product').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  downloadJson(backup, `vrcl-${clean}-backup-${new Date().toISOString().slice(0,10)}.json`);
  let cloudError = null;
  try { await saveCloudBackup(backup, `products/${editor.city.toLowerCase()}/${id}`); }
  catch (error) { cloudError = error; console.error('Product cloud backup failed', error); }
  return { product_name: product.name, cloudError };
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
async function restoreProductBackup(backup, target = selectedRestoreTarget(), { confirmRestore = false } = {}) {
  const prepared = prepareProductRestore(backup);
  if (!await isAdmin()) throw new Error('Admin access required.');
  let p = prepared.product;
  if (target) {
    if (!target.product_id || !['Rajkot','Ahmedabad','Udaan'].includes(target.city)) throw new Error('Select a valid destination product before restoring.');
    const { data, error } = await supabase.from('products').select('*').eq('id', target.product_id).eq('city', target.city).eq('active', true).single();
    if (error) throw error;
    if (!data) throw new Error('The selected product is no longer available. Select it again before restoring.');
    p = { ...data };
  }
  const copyingProduct = p.id !== prepared.product.id;
  const rates = prepared.rates.map(r => ({ ...r, id: copyingProduct ? crypto.randomUUID() : r.id, product_id: p.id, city: p.city }));
  if (confirmRestore && !confirm('Restore "'+prepared.product.name+'" backup into "'+p.name+'" ('+p.city+')? Packaging, rates, formulas and narration for "'+p.name+'" will be replaced. The product name will stay "'+p.name+'".')) return null;
  restoreInProgress = true;
  try {
  await syncQueue.catch(() => {});
  const stamp = Date.now();
  if (!copyingProduct && backup.images?.ingredient?.base64) p.ingredient_image_url = await uploadEmbeddedImage(backup.images.ingredient, `restored/ingredients/${p.code || p.id}-${stamp}.webp`);
  if (!copyingProduct && backup.images?.header?.base64) p.header_image_url = await uploadEmbeddedImage(backup.images.header, `restored/headers/${p.code || p.id}-${stamp}.webp`);
  const { data: restored, error } = await supabase.rpc('restore_vrcl_product_backup', {
    product_payload: p,
    rates_payload: rates
  });
  if (error) throw error;
  if (!restored?.ok || restored.product_id !== p.id || restored.rates !== rates.length) throw new Error('The server did not confirm all packaging rows for the selected product. Please retry the restore.');
  const local = currentLocalState();
  // Read formulas under the backup's original key, then save them under the destination key.
  if (prepared.formula) local.meta = { ...(local.meta || {}), [p.city + '|' + p.id]: prepared.formula };
  if (backup.formula_state?.locks) local.locks = backup.formula_state.locks;
  if (typeof backup.formula_state?.master_lock === 'boolean') local.master_lock = backup.formula_state.master_lock;
  applyLocalState(local);
  try { await syncStateToCloud(); }
  catch (error) { throw new Error('Packaging restored, but formulas could not be saved: '+(error.message || error)+'. Please retry this backup.'); }
  sessionStorage.setItem(RESTORE_SELECTION, JSON.stringify({city:p.city,product_id:p.id}));
  const formulasIncluded = !!prepared.formula && prepared.rates.every(r => typeof prepared.formula.rows?.[r.packing]?.formula === 'string');
  return { ...restored, formulas_included: formulasIncluded, product_name: p.name, source_product_name: prepared.product.name };
  } finally { restoreInProgress = false; }
}

async function collectCodeSnapshot() {
  const files = ['index.html','admin.html','dashboard.html','customer-check.html','users.html','customer.js','customer.css','admin-products.js','backup-manager.js','supabase-config.js','loose-rate-reference.js','rate-calculator.js'];
  const out = {};
  await Promise.all(files.map(async f => {
    try { const r = await fetch('./' + f + '?backup=' + Date.now(), { cache: 'no-store' }); if (r.ok) out[f] = await r.text(); }
    catch {}
  }));
  return out;
}
async function readAll(table, orderColumn) {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error, count } = await supabase.from(table).select('*',{count:'exact'}).order(orderColumn).range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if (count === result.length) return result;
    if (!data || data.length !== 500 || count == null) throw new Error('Incomplete '+table+' backup: received '+result.length+' of '+count+' rows.');
  }
}
async function readCurrentFormulaState() {
  const { data, error } = await supabase.from('admin_state').select('*').eq('key', CLOUDKEY).single();
  if (error || !data) throw error || new Error('Cloud formula state missing.');
  return [data];
}
function inspectFullBackup(backup) {
  if (backup?.format !== FULL_FORMAT) throw new Error('This is not a formula-inclusive VRCL full backup (V2). Older data-only files cannot restore formulas.');
  for (const key of ['products','rates','rate_history','admin_state','header_assets']) {
    if (!Array.isArray(backup.data?.[key])) throw new Error('Backup is missing '+key+'. Nothing was restored.');
  }
  const formula = backup.data.admin_state.find(x => x.key === CLOUDKEY)?.value;
  if (!formula?.meta || typeof formula.meta !== 'object') throw new Error('Backup has no saved formula state.');
  const ids = new Set(backup.data.products.map(p => p.id));
  if (ids.size !== backup.data.products.length || backup.data.rates.some(r => !ids.has(r.product_id))) throw new Error('Backup has duplicate products or orphaned packing rates.');
  const missing = backup.data.products.filter(p => p.active !== false && backup.data.rates.some(r => r.product_id === p.id && r.city === p.city) && backup.data.rates.some(r => r.product_id === p.id && r.city === p.city && typeof formula.meta[p.city+'|'+p.id]?.rows?.[r.packing]?.formula !== 'string')).map(p => p.city+' / '+p.name);
  return { products: backup.data.products.length, rates: backup.data.rates.length, history: backup.data.rate_history.length, formulaProducts: backup.data.products.filter(p => !!formula.meta[p.city+'|'+p.id]).length, missing };
}
async function buildFullBackup() {
  if (!await isAdmin()) throw new Error('Admin access required.');
  const [profiles, products, rates, history, activity, headers, adminState] = await Promise.all([
    readAll('profiles','id'), readAll('products','id'), readAll('rates','id'),
    readAll('rate_history','id'), readAll('user_activity','user_id'),
    readAll('header_assets','code'), readCurrentFormulaState()
  ]);
  const formula = adminState.find(x => x.key === CLOUDKEY)?.value;
  if (!formula?.meta) throw new Error('Cloud formula settings are missing. Backup was not labeled complete.');
  const imageMap = {};
  for (const p of products) {
    imageMap[p.id] = {
      ingredient: await urlToEmbedded(p.ingredient_image_url),
      header: await urlToEmbedded(p.header_image_url)
    };
  }
  const backup = {
    format: FULL_FORMAT,
    created_at: new Date().toISOString(),
    restore_scope: 'data+formulas+photos+runtime-code-snapshot',
    data: { profiles, products, rates, rate_history: history, user_activity: activity, header_assets: headers, admin_state: adminState },
    local_admin_state: formula,
    images: imageMap,
    code_snapshot: await collectCodeSnapshot(),
    note: 'GitHub stores deployed code. Full restore replaces site business data, formulas and photos; review the backup date first.'
  };
  backup.summary = inspectFullBackup(backup);
  backup.summary.imageErrors = Object.entries(imageMap).flatMap(([id,imgs]) => Object.entries(imgs).filter(([,v]) => v?.error).map(([type]) => id+'/'+type));
  return backup;
}
async function checksum(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map(n => n.toString(16).padStart(2,'0')).join('');
}
async function saveCloudBackup(backup, prefix = 'vrcl') {
  const folder = prefix.startsWith('products/') ? prefix : 'full';
  const label = prefix.startsWith('products/') ? 'vrcl' : prefix;
  const name = folder+'/'+label+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  const bytes = new TextEncoder().encode(JSON.stringify(backup));
  const storage = supabase.storage.from('site-backups');
  const { error } = await storage.upload(name, bytes, { contentType:'application/json', upsert:false });
  if (error) throw error;
  const { data: verified, error: verifyError } = await storage.download(name);
  if (verifyError || !verified || await checksum(bytes) !== await checksum(await verified.arrayBuffer())) throw new Error('Cloud backup verification failed for '+name+'. Keep the downloaded file.');
  return name;
}
async function listCloudBackups() {
  if (!await isAdmin()) throw new Error('Admin access required.');
  const { data, error } = await supabase.storage.from('site-backups').list('full', { limit:100, sortBy:{column:'name',order:'desc'} });
  if (error) throw error;
  return (data || []).filter(file => file.name?.endsWith('.json')).map(file => file.name);
}
async function readCloudBackup(name) {
  if (!/^(?:vrcl|pre-restore)-[0-9TZ-]+\.json$/.test(name)) throw new Error('Invalid backup selection.');
  const { data, error } = await supabase.storage.from('site-backups').download('full/'+name);
  if (error || !data) throw error || new Error('Backup could not be downloaded.');
  return JSON.parse(await data.text());
}
async function restoreFullBackup(backup) {
  if (!await isAdmin()) throw new Error('Admin access required.');
  const requested = inspectFullBackup(backup);
  if (requested.missing.length || backup.summary?.imageErrors?.length) throw new Error('This backup is incomplete: '+requested.missing.join(', ')+(backup.summary?.imageErrors?.length ? '; some product images failed to embed' : '')+'. Restore was blocked.');
  restoreInProgress = true;
  try {
    await syncQueue.catch(() => {});
    const safety = await buildFullBackup();
    const safetyPath = await saveCloudBackup(safety,'pre-restore');
    const copy = JSON.parse(JSON.stringify(backup));
    const stamp = Date.now();
    for (const p of copy.data.products) {
      const imgs = copy.images?.[p.id] || {};
      if (imgs.ingredient?.base64) p.ingredient_image_url = await uploadEmbeddedImage(imgs.ingredient, 'restored/ingredients/'+(p.code||p.id)+'-'+stamp+'.webp');
      if (imgs.header?.base64) p.header_image_url = await uploadEmbeddedImage(imgs.header, 'restored/headers/'+(p.code||p.id)+'-'+stamp+'.webp');
    }
    const { data, error } = await supabase.rpc('restore_vrcl_full_backup', { payload: copy });
    if (error) throw new Error('Restore failed; pre-restore copy: '+safetyPath+'. '+error.message);
    if (!data?.ok || data.products !== requested.products || data.rates !== requested.rates || data.rate_history !== requested.history) throw new Error('Restore response count mismatch; inspect the site before proceeding. Safety copy: '+safetyPath);
    const { data: restored, error: checkError } = await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).single();
    if (checkError || !sameValue(restored?.value?.meta,copy.local_admin_state?.meta)) throw new Error('Formula verification failed after restore. Pre-restore copy: '+safetyPath);
    applyLocalState(copy.local_admin_state);
    localStorage.setItem(SYNCED_STATE,JSON.stringify(restored.value));
    return { ...data, safetyPath };
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
  let restoreTarget;
  const status = document.createElement('span'); status.style.cssText=noteStyle(); status.setAttribute('role','status');
  tools.append(backup, restore, input, status); photo.insertAdjacentElement('afterend', tools);
  backup.onclick = async () => { backup.disabled=true; status.textContent='PREPARING…'; try { const result=await makeProductBackup(); status.textContent=result.cloudError?'FILE DOWNLOADED · CLOUD SAVE FAILED':'BACKUP SAVED'; if(result.cloudError)alert('Product backup file downloaded, but cloud copy failed: '+(result.cloudError.message||result.cloudError)); } catch(e){ status.textContent='BACKUP FAILED'; alert('Product backup failed: '+(e.message||e)); } finally { backup.disabled=false; } };
  restore.onclick = () => { restoreTarget = selectedRestoreTarget(); input.click(); };
  input.onchange = async () => {
    const file=input.files?.[0]; if(!file)return;
    restore.disabled=true;
    try { const result = await restoreProductBackup(await readFileJson(file), restoreTarget, { confirmRestore: true }); if(result){ alert('Backup applied to '+result.product_name+'. Packaging rows: '+result.rates+'.'+(result.formulas_included?'':' This backup does not contain all formula settings.')); location.reload(); } }
    catch(e){ alert('Product restore failed: '+(e.message||e)); }
    finally { restore.disabled=false; input.value=''; restoreTarget=undefined; }
  };
}

async function listFormulaVersions() {
  if (!await isAdmin()) throw new Error('Admin access required.');
  const { data, error } = await supabase.from('admin_state').select('key,updated_at,value').like('key','formula_revision_%').order('updated_at',{ascending:false}).limit(40);
  if (error) throw error;
  return (data || []).map(item => ({ key:item.key, at:item.updated_at, count:Object.keys(item.value?.meta || {}).length }));
}
async function restoreFormulaVersion(versionKey) {
  if (!/^formula_revision_[0-9_\-a-f]+$/.test(versionKey) || !await isAdmin()) throw new Error('Invalid formula version or admin login.');
  const [{data:chosen,error:chosenError},{data:current,error:currentError}] = await Promise.all([
    supabase.from('admin_state').select('value').eq('key',versionKey).single(),
    supabase.from('admin_state').select('value,updated_at').eq('key',CLOUDKEY).single()
  ]);
  if (chosenError || currentError || !chosen?.value?.meta || !current?.value?.meta) throw chosenError || currentError || new Error('Saved formula version is unavailable.');
  const merged={...current.value,meta:{...current.value.meta,...chosen.value.meta},captured_at:new Date().toISOString()};
  if (sameValue(merged.meta,current.value.meta)) throw new Error('This version has the same formulas as the current state.');
  const safetyPath=await saveCloudBackup(await buildFullBackup(),'pre-restore');
  const {data,error}=await supabase.from('admin_state').update({value:merged,updated_at:merged.captured_at}).eq('key',CLOUDKEY).eq('updated_at',current.updated_at).select('value').maybeSingle();
  if(error || !data || !sameValue(data.value?.meta,merged.meta)) throw error || new Error('Formula restore was blocked or changed in another tab. Safety copy: '+safetyPath);
  applyLocalState(data.value);
  localStorage.setItem(SYNCED_STATE,JSON.stringify(data.value));
  return safetyPath;
}
function upgradeDashboardBackup() {
  const old = $('manifest'); if (!old || document.getElementById('vrclRestoreFull')) return;
  old.textContent = 'BACKUP NOW · DOWNLOAD + CLOUD';
  const host=old.parentElement;
  const status=document.createElement('div');status.id='vrclBackupStatus';status.style.cssText='font-size:10px;line-height:1.5;margin-top:9px;color:#475467';status.textContent='A complete backup includes product rates, formulas, history and images.';
  const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:10px';
  const versions=document.createElement('select');versions.id='vrclBackupVersions';versions.style.cssText='max-width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff';
  const refresh=document.createElement('button');refresh.type='button';refresh.className='btn light';refresh.textContent='REFRESH BACKUPS';
  const restore=document.createElement('button');restore.id='vrclRestoreFull';restore.type='button';restore.className='btn dark';restore.textContent='RESTORE CLOUD VERSION';
  const local=document.createElement('button');local.type='button';local.className='btn light';local.textContent='RESTORE FROM FILE';
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  const show=message=>{status.textContent=message};
  host.append(status,controls,input);controls.append(versions,refresh,restore,local);
  async function reloadVersions(){
    try {const names=await listCloudBackups();versions.replaceChildren(...names.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;return option}));if(!names.length)show('No cloud backup yet. Click BACKUP NOW.')}
    catch(error){show('Cloud backup list: '+(error.message||error))}
  }
  refresh.onclick=reloadVersions;
  old.onclick=async()=>{
    old.disabled=true;old.textContent='PREPARING FULL BACKUP…';show('Reading current products, formulas, rates and all history…');
    try{
      const backup=await buildFullBackup(),report=backup.summary;
      downloadJson(backup,'vrcl-'+(report.missing.length?'partial':'full')+'-'+backup.created_at.replace(/[:.]/g,'-')+'.json');
      show('File downloaded. Verifying cloud copy…');
      const path=await saveCloudBackup(backup);
      const warning=report.missing.length?' INCOMPLETE: '+report.missing.join(', ')+'.':'';
      const images=report.imageErrors.length?' Image errors: '+report.imageErrors.join(', ')+'.':'';
      show('Downloaded + verified cloud '+path+'. '+report.products+' products, '+report.rates+' rates, '+report.history+' history rows, '+report.formulaProducts+' formula products.'+warning+images);
      if(warning||images)alert('Backup saved, but a full restore is unsafe until these gaps are fixed:'+warning+images);
      await reloadVersions();
    }catch(error){show('Backup issue: '+(error.message||error));alert('Backup issue: '+(error.message||error))}
    finally{old.disabled=false;old.textContent='BACKUP NOW · DOWNLOAD + CLOUD'}
  };
  async function runRestore(backup, label){
    const report=inspectFullBackup(backup);
    if(report.missing.length||backup.summary?.imageErrors?.length){show('Restore blocked: backup has missing formulas or images.');throw new Error('Incomplete backup: '+report.missing.join(', '))}
    const message='Restore '+label+' from '+backup.created_at+'? This replaces '+report.products+' products, '+report.rates+' rates and '+report.history+' history records. A verified pre-restore cloud backup is created first.';
    if(!confirm(message))return;
    restore.disabled=true;local.disabled=true;show('Saving and verifying a pre-restore backup…');
    try{const result=await restoreFullBackup(backup);show('Restore verified. Safety copy: '+result.safetyPath);alert('Full site restored and verified. Safety copy: '+result.safetyPath);location.reload()}
    finally{restore.disabled=false;local.disabled=false}
  }
  restore.onclick=async()=>{if(!versions.value){show('Select a cloud version first.');return}try{await runRestore(await readCloudBackup(versions.value),versions.value)}catch(error){show('Restore failed: '+(error.message||error));alert('Restore failed: '+(error.message||error))}};
  local.onclick=()=>input.click();
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{await runRestore(await readFileJson(file),file.name)}catch(error){show('Restore failed: '+(error.message||error));alert('Restore failed: '+(error.message||error))}finally{input.value=''}};
  const formulaTools=document.createElement('div');formulaTools.style.cssText='display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #e1e7ec';
  const formulaSelect=document.createElement('select');formulaSelect.style.cssText=versions.style.cssText;
  const formulaRefresh=document.createElement('button');formulaRefresh.className='btn light';formulaRefresh.type='button';formulaRefresh.textContent='FORMULA VERSIONS';
  const formulaRestore=document.createElement('button');formulaRestore.className='btn dark';formulaRestore.type='button';formulaRestore.textContent='RESTORE FORMULAS ONLY';
  formulaTools.append(formulaSelect,formulaRefresh,formulaRestore);controls.after(formulaTools);
  async function reloadFormulaVersions(){
    try{
      const versions=await listFormulaVersions();
      formulaSelect.replaceChildren(...versions.map(version=>{const option=document.createElement('option');option.value=version.key;option.textContent=new Date(version.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' · '+version.count+' products';return option}));
      if(!versions.length)formulaSelect.replaceChildren(new Option('No older formula revisions yet',''));
    }catch(error){show('Formula versions: '+(error.message||error))}
  }
  formulaRefresh.onclick=reloadFormulaVersions;
  formulaRestore.onclick=async()=>{
    if(!formulaSelect.value){show('Select a formula version first.');return}
    if(!confirm('Restore formula settings from '+formulaSelect.selectedOptions[0].textContent+'? Current rates and history will stay unchanged. A verified pre-restore backup is saved first.'))return;
    formulaRestore.disabled=true;
    try{show('Saving pre-restore backup and restoring formulas…');const safetyPath=await restoreFormulaVersion(formulaSelect.value);show('Formula version restored. Safety copy: '+safetyPath);alert('Formulas restored. Safety copy: '+safetyPath);location.reload()}
    catch(error){show('Formula restore failed: '+(error.message||error));alert('Formula restore failed: '+(error.message||error))}
    finally{formulaRestore.disabled=false}
  };
  window.addEventListener('vrcl:dashboard-ready',()=>{void reloadVersions();void reloadFormulaVersions()});
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
