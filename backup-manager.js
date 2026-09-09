import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vrcl-admin-auth' }
});

const META = 'VISHWAS_RATE_ADMIN_META_V3';
const LOCKKEY = 'VRCL_ADMIN_COLUMN_LOCKS';
const MASTERKEY = 'VRCL_MASTER_LOCK';
const CLOUDKEY = 'admin_formula_state_v1';
const FULL_FORMAT = 'VRCL_FULL_BACKUP_V2';
const PRODUCT_FORMAT = 'VRCL_PRODUCT_BACKUP_V1';
const $ = id => document.getElementById(id);

function safeJson(s, fallback = {}) { try { return JSON.parse(s || '') ?? fallback; } catch { return fallback; } }
function currentLocalState() {
  return {
    meta: safeJson(localStorage.getItem(META), {}),
    locks: safeJson(localStorage.getItem(LOCKKEY), {}),
    master_lock: localStorage.getItem(MASTERKEY) === '1',
    captured_at: new Date().toISOString()
  };
}
function applyLocalState(v) {
  if (!v || typeof v !== 'object') return;
  if (v.meta && typeof v.meta === 'object') localStorage.setItem(META, JSON.stringify(v.meta));
  if (v.locks && typeof v.locks === 'object') localStorage.setItem(LOCKKEY, JSON.stringify(v.locks));
  if (typeof v.master_lock === 'boolean') localStorage.setItem(MASTERKEY, v.master_lock ? '1' : '0');
}
async function isAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data } = await supabase.from('profiles').select('role,active').eq('id', session.user.id).single();
  return !!data && data.role === 'admin' && data.active === true;
}
async function syncStateToCloud() {
  if (!await isAdmin()) return;
  const { data: { session } } = await supabase.auth.getSession();
  const value = currentLocalState();
  await supabase.from('admin_state').upsert({ key: CLOUDKEY, value, updated_by: session.user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}
async function hydrateStateFromCloud() {
  if (!await isAdmin()) return;
  const { data } = await supabase.from('admin_state').select('value,updated_at').eq('key', CLOUDKEY).maybeSingle();
  if (!data?.value) return;
  const local = currentLocalState();
  const cloudTime = Date.parse(data.updated_at || data.value.captured_at || 0) || 0;
  const localTime = Date.parse(local.captured_at || 0) || 0;
  const localHasMeta = Object.keys(local.meta || {}).length > 0;
  if (!localHasMeta || cloudTime >= localTime) applyLocalState(data.value);
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
  await syncStateToCloud();
  const [{ data: product, error: pe }, { data: rates, error: re }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('rates').select('*').eq('product_id', id).order('city').order('sort_order')
  ]);
  if (pe) throw pe; if (re) throw re;
  const state = currentLocalState();
  const productMeta = {};
  for (const [k, v] of Object.entries(state.meta || {})) if (k.endsWith('|' + id)) productMeta[k] = v;
  const backup = {
    format: PRODUCT_FORMAT,
    created_at: new Date().toISOString(),
    product,
    rates: rates || [],
    formula_state: { meta: productMeta, locks: state.locks, master_lock: state.master_lock },
    images: {
      ingredient: await urlToEmbedded(product.ingredient_image_url),
      header: await urlToEmbedded(product.header_image_url)
    }
  };
  const clean = String(product.name || product.code || 'product').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  downloadJson(backup, `vrcl-${clean}-backup-${new Date().toISOString().slice(0,10)}.json`);
}
async function restoreProductBackup(backup) {
  if (backup?.format !== PRODUCT_FORMAT || !backup.product?.id) throw new Error('Invalid VRCL product backup file.');
  if (!await isAdmin()) throw new Error('Admin access required.');
  const p = { ...backup.product };
  const stamp = Date.now();
  if (backup.images?.ingredient?.base64) p.ingredient_image_url = await uploadEmbeddedImage(backup.images.ingredient, `restored/ingredients/${p.code || p.id}-${stamp}.webp`);
  if (backup.images?.header?.base64) p.header_image_url = await uploadEmbeddedImage(backup.images.header, `restored/headers/${p.code || p.id}-${stamp}.webp`);
  const { error: pErr } = await supabase.from('products').upsert(p, { onConflict: 'id' }); if (pErr) throw pErr;
  const { error: delErr } = await supabase.from('rates').delete().eq('product_id', p.id); if (delErr) throw delErr;
  if (Array.isArray(backup.rates) && backup.rates.length) {
    const { error } = await supabase.from('rates').insert(backup.rates); if (error) throw error;
  }
  const local = currentLocalState();
  if (backup.formula_state?.meta) local.meta = { ...(local.meta || {}), ...backup.formula_state.meta };
  if (backup.formula_state?.locks) local.locks = backup.formula_state.locks;
  if (typeof backup.formula_state?.master_lock === 'boolean') local.master_lock = backup.formula_state.master_lock;
  applyLocalState(local); await syncStateToCloud();
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
    try { await restoreProductBackup(await readFileJson(file)); alert('Product restored successfully.'); location.reload(); }
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
  await hydrateStateFromCloud();
  addProductControls();
  let last = JSON.stringify(currentLocalState());
  setInterval(async () => {
    addProductControls();
    const now = JSON.stringify(currentLocalState());
    if (now !== last) { last = now; await syncStateToCloud(); }
  }, 2500);
  window.addEventListener('beforeunload', () => { syncStateToCloud(); });
}
async function bootDashboard() { upgradeDashboardBackup(); setInterval(upgradeDashboardBackup, 1500); }

const path = location.pathname;
if (/\/admin(?:\.html)?\/?$/.test(path)) bootAdmin();
if (/\/dashboard(?:\.html)?\/?$/.test(path)) bootDashboard();
