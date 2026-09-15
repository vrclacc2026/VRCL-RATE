import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { calcFormula, applyExtraCost, roundPackingValue, roundLooseValue } from './rate-calculator.js?v=20260915-admin-exact-fallback';
import { resolveLooseRate, looseRateDependants, calculateReferencedRates } from './loose-rate-reference.js?v=20260915-admin-exact-fallback';
import { packingReferenceKey, packingRateDependants, calculatePackingReferencedRates } from './packing-rate-reference.js?v=20260915-admin-exact-fallback';

// Public browser credentials. Kept here deliberately so this helper does not import
// supabase-config.js back into itself and create a second circular admin runtime.
const SUPABASE_URL = 'https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vrcl-admin-auth' }
});

const META = 'VISHWAS_RATE_ADMIN_META_V3';
const LOCKKEY = 'VRCL_ADMIN_COLUMN_LOCKS';
const MASTERKEY = 'VRCL_MASTER_LOCK';
const CLOUDKEY = 'admin_formula_state_v1';
const area = document.getElementById('productArea');
let fallback = null;
let fallbackLoading = false;
let fallbackSaving = false;
let fallbackTimer = null;

function $(id){ return document.getElementById(id); }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function clone(v){ return JSON.parse(JSON.stringify(v ?? {})); }
function norm(v){ return String(v ?? '').trim().toLocaleUpperCase('en-IN'); }
function selectedId(){ return area?.querySelector('.productBtn.active')?.dataset.product || ''; }
function selectedCity(){ return document.querySelector('.city.active')?.dataset.city || 'Rajkot'; }
function selectedKey(){ const id=selectedId(); return id ? selectedCity()+'|'+id : ''; }
function cleanCode(v){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,''); }
function masterLocked(){ return localStorage.getItem(MASTERKEY)==='1'; }
function locks(){ try{return Object.assign({packing:false,master:false,old:true,formula:false,extra:false,round:false},JSON.parse(localStorage.getItem(LOCKKEY)||'{}'))}catch{return{packing:false,master:false,old:true,formula:false,extra:false,round:false}} }
function productFamily(product){ const text=((product?.code||'')+' '+(product?.name||'')).toLowerCase(); return ['palm','groundnut','cotton','mustard','soya','sun','corn','visvita'].find(x=>text.includes(x))||product?.code||''; }
function isUdaanPalm(product){ return product?.city==='Udaan' && productFamily(product)==='palm'; }
function toast(message){ const el=$('toast'); if(!el)return; el.textContent=message; el.style.display='block'; clearTimeout(window.__vrclFallbackToast); window.__vrclFallbackToast=setTimeout(()=>el.style.display='none',2600); }
function fallbackActive(){ return !!fallback && fallback.key===selectedKey() && !!document.querySelector('#rateBody [data-fallback-row]'); }

async function requireAdmin(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error('Admin session expired. Please login again.');
  const {data:profile,error}=await supabase.from('profiles').select('id,display_name,login_id,role,active').eq('id',session.user.id).single();
  if(error||!profile||profile.role!=='admin'||!profile.active) throw new Error('Active admin login required.');
  return {session,profile};
}

async function loadSourceMap(state, products){
  const map=new Map();
  if(!state?.packingRateReference) return {map,error:null};
  const ref=state.packingRateReference;
  if(!products.some(p=>p.id===ref.productId&&p.city===ref.city&&p.active!==false)) return {map,error:'Packing rate source product is unavailable'};
  const {data,error}=await supabase.from('rates').select('packing,rate').eq('city',ref.city).eq('product_id',ref.productId).order('sort_order');
  if(error) return {map,error:'Packing source rates could not be loaded'};
  for(const row of data||[]){
    const key=norm(row.packing),value=Number(row.rate);
    if(!key||map.has(key)||!Number.isFinite(value)) return {map:new Map(),error:'Packing source contains invalid or duplicate rows'};
    map.set(key,value);
  }
  return map.size?{map,error:null}:{map,error:'Packing source has no saved rates'};
}

function evaluateRows(ctx){
  const {rows,state,meta,products,product,sourceMap,sourceError}=ctx;
  const names=new Map(rows.map((r,i)=>[String(r.packing||''),i]));
  const cached=new Map();
  const loose=resolveLooseRate(meta,ctx.key,products);
  function evaluate(index,seen=new Set()){
    if(cached.has(index)) return cached.get(index);
    if(seen.has(index)) return {rate:0,cycle:true,error:'MASTER LINK CYCLE FOUND'};
    const row=rows[index]; if(!row) return {rate:0,error:'Packing row missing'};
    const next=new Set(seen); next.add(index);
    let master=0;
    if(state.packingRateReference){
      if(sourceError) return {rate:0,error:sourceError};
      const value=sourceMap.get(norm(row.packing));
      if(!Number.isFinite(value)) return {rate:0,error:'Source has no matching rate for '+(row.packing||'this packing')};
      master=value;
    }else if(!row.master||row.master==='LOOSE OIL RATE'){
      if(loose.error) return {rate:0,error:loose.error};
      master=Number(loose.value)||0;
    }else{
      const linked=names.get(row.master);
      if(linked===undefined) return {rate:0,error:'Packing master is missing for '+row.packing};
      const result=evaluate(linked,next); if(result.error||result.cycle)return result; master=result.rate;
    }
    const subtotal=isUdaanPalm(product)&&state.packingRateReference ? master*1.05 : calcFormula(row.formula||'MASTER*1',master);
    const calculated=isUdaanPalm(product)&&state.packingRateReference ? subtotal : applyExtraCost(subtotal,row.extra);
    const rate=roundPackingValue(calculated,row.round??0);
    const out=Number.isFinite(rate)?{rate,master}:{rate:0,error:'Invalid calculated rate'};
    cached.set(index,out); return out;
  }
  return rows.map((_,i)=>evaluate(i));
}

function renderFallback(){
  if(!fallback||fallback.key!==selectedKey())return;
  const body=$('rateBody'); if(!body)return;
  const l=locks(),linked=!!fallback.state.packingRateReference,values=evaluateRows(fallback);
  body.innerHTML=fallback.rows.length?fallback.rows.map((r,i)=>{
    const opts=fallback.rows.map((x,j)=>j!==i&&x.packing?`<option value="${esc(x.packing)}" ${r.master===x.packing?'selected':''}>${esc(x.packing)}</option>`:'').join('');
    const sourceLabel=fallback.sourceError?'SOURCE ERROR':`${esc(fallback.sourceProduct?.city||'SOURCE')} / ${esc(fallback.sourceProduct?.name||'PRODUCT')} / ${esc(r.packing||'SAME PACKING')}`;
    const masterControl=linked?`<select class="sourceMaster" disabled><option>${sourceLabel}</option></select>`:`<select data-i="${i}" data-f="master" ${l.master?'disabled':''}><option value="LOOSE OIL RATE" ${r.master==='LOOSE OIL RATE'?'selected':''}>LOOSE OIL RATE</option>${opts}</select>`;
    const ev=values[i]||{rate:0,error:'Calculation error'},issue=ev.error||ev.cycle;
    return `<tr data-fallback-row="1"><td><input class="packingField" data-i="${i}" data-f="packing" value="${esc(r.packing)}" ${l.packing?'disabled':''}></td><td>${masterControl}</td><td><input class="oldRateField" data-i="${i}" data-f="oldRate" value="${Number(r.oldRate||0).toFixed(2)}" ${l.old?'disabled':''}></td><td><input data-i="${i}" data-f="formula" value="${esc(r.formula)}" ${l.formula?'disabled':''}></td><td><input type="text" inputmode="decimal" data-i="${i}" data-f="extra" value="${esc(r.extra)}" ${l.extra?'disabled':''}></td><td><input type="number" data-i="${i}" data-f="round" value="${esc(r.round)}" ${l.round?'disabled':''}></td><td><input class="newRate ${issue?'cycle':''}" data-new="${i}" value="${ev.error?'SOURCE ERROR':ev.cycle?'CYCLE':Number(ev.rate).toFixed(2)}" disabled></td><td><button class="btn light" type="button" data-fb-del="${i}">🗑️</button></td></tr>`;
  }).join(''):'<tr><td colspan="8" class="empty">No packing yet. Click ADD PACKING.</td></tr>';
}

function refreshFallback(){
  if(!fallbackActive())return;
  const values=evaluateRows(fallback);
  values.forEach((ev,i)=>{const el=document.querySelector(`#rateBody [data-new="${i}"]`);if(!el)return;const issue=ev.error||ev.cycle;el.value=ev.error?'SOURCE ERROR':ev.cycle?'CYCLE':Number(ev.rate).toFixed(2);el.classList.toggle('cycle',!!issue)});
  const loose=resolveLooseRate(fallback.meta,fallback.key,fallback.products);
  if($('pvDiff')) $('pvDiff').textContent=loose.error?'SOURCE ERROR':roundLooseValue(calcFormula(fallback.state.masterFormula||'MASTER*1',loose.value),fallback.state.masterRound??0).toFixed(2);
}

async function activateFallback(force=false){
  if(fallbackLoading)return;
  const body=$('rateBody'),id=selectedId(),city=selectedCity(),key=selectedKey();
  if(!body||!id)return;
  if(!force&&body.querySelector('[data-i]:not([data-fallback-marker])')&&!body.querySelector('[data-fallback-row]')){fallback=null;return}
  if(body.querySelector('[data-i]')&&!body.querySelector('[data-fallback-row]')){fallback=null;return}
  fallbackLoading=true;
  try{
    const [{data:products,error:pe},{data:cloud,error:ce},{data:rates,error:re}]=await Promise.all([
      supabase.from('products').select('id,code,name,sort_order,city,active').eq('active',true).order('sort_order'),
      supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle(),
      supabase.from('rates').select('id,city,product_id,packing,rate,narration,sort_order').eq('city',city).eq('product_id',id).order('sort_order')
    ]);
    if(pe||ce||re) return;
    if(key!==selectedKey())return;
    if(!rates?.length){fallback=null;return}
    const product=(products||[]).find(p=>p.id===id&&p.city===city); if(!product)return;
    const cloudValue=cloud?.value||{},meta=clone(cloudValue.meta||{}),state=clone(meta[key]||{looseRate:'',masterFormula:'MASTER*1',masterRound:0,rows:{}});
    state.rows=state.rows&&typeof state.rows==='object'?state.rows:{};
    const rows=(rates||[]).map((r,i)=>{const m=state.rows[r.packing]||{};return{id:r.id,packing:r.packing,oldRate:Number(r.rate)||0,master:m.master||'LOOSE OIL RATE',formula:m.formula||'MASTER*1',extra:m.extra??0,round:m.round??0,sort_order:r.sort_order??i};});
    const source=await loadSourceMap(state,products||[]); if(key!==selectedKey())return;
    const sourceProduct=state.packingRateReference?(products||[]).find(p=>p.id===state.packingRateReference.productId&&p.city===state.packingRateReference.city):null;
    fallback={key,city,id,product,products:products||[],cloudValue,meta,state,rows,sourceMap:source.map,sourceError:source.error,sourceProduct,narration:rates[0]?.narration||''};
    if(!state.looseReference&&$('looseRate')) $('looseRate').value=state.looseRate??'';
    if($('pvFormula')) $('pvFormula').value=state.masterFormula||'MASTER*1';
    if($('pvRound')) $('pvRound').value=state.masterRound??0;
    renderFallback();refreshFallback();
  } finally { fallbackLoading=false; }
}

function scheduleFallback(delay=550){ clearTimeout(fallbackTimer); fallbackTimer=setTimeout(()=>void activateFallback(true),delay); }

async function saveFormulaState(meta,cloudValue,session){
  const value={...cloudValue,meta,locks:cloudValue?.locks||locks(),master_lock:typeof cloudValue?.master_lock==='boolean'?cloudValue.master_lock:masterLocked(),captured_at:new Date().toISOString()};
  const {data,error}=await supabase.from('admin_state').upsert({key:CLOUDKEY,value,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();
  if(error)throw error;if(data?.key!==CLOUDKEY)throw new Error('Formula settings could not be saved.');
  localStorage.setItem(META,JSON.stringify(meta));
  localStorage.setItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1',JSON.stringify(value));
  localStorage.setItem('VRCL_ADMIN_STATE_UPDATED_AT',new Date().toISOString());
}

async function saveFallback(){
  if(!fallbackActive()||fallbackSaving)return;
  fallbackSaving=true;const save=$('saveAll');if(save)save.disabled=true;
  try{
    if(masterLocked())throw new Error('MASTER LOCKED');
    const {session,profile}=await requireAdmin();
    const sourceKey=fallback.key;if(sourceKey!==selectedKey())throw new Error('Product selection changed.');
    const {data:cloud,error:ce}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(ce)throw ce;
    const cloudValue=cloud?.value||{},meta=clone(cloudValue.meta||{}),state=clone(meta[sourceKey]||fallback.state||{});
    state.rows={};
    if(!state.looseReference)state.looseRate=$('looseRate')?.value??state.looseRate??'';
    state.masterFormula=$('pvFormula')?.value||state.masterFormula||'MASTER*1';state.masterRound=$('pvRound')?.value??state.masterRound??0;
    const names=new Set();
    for(const row of fallback.rows){
      const packing=String(row.packing||'').trim();if(!packing)throw new Error('Enter a name for every packaging row.');
      const key=norm(packing);if(names.has(key))throw new Error('Packaging names must be unique.');names.add(key);row.packing=packing;
      state.rows[packing]={master:row.master||'LOOSE OIL RATE',formula:row.formula||'MASTER*1',extra:row.extra??0,round:row.round??0};
    }
    meta[sourceKey]=state;
    const {data:products,error:pe}=await supabase.from('products').select('id,code,name,sort_order,city,active').eq('active',true).order('sort_order');if(pe)throw pe;
    const source=await loadSourceMap(state,products||[]);
    const current={...fallback,state,meta,products:products||[],sourceMap:source.map,sourceError:source.error};
    const values=evaluateRows(current);for(const v of values)if(v.error||v.cycle)throw new Error(v.error||'MASTER LINK CYCLE FOUND');
    const narr=$('narration')?.value??fallback.narration??'';
    const sourceRates=fallback.rows.map((row,i)=>({city:fallback.city,product_id:fallback.id,packing:row.packing,rate:values[i].rate,narration:narr,sort_order:i+1}));
    const groupsByKey=new Map([[sourceKey,{product:fallback.product,rates:sourceRates}]]),publishedByKey=new Map([[sourceKey,sourceRates]]);
    const looseLinked=await Promise.all(looseRateDependants(meta,sourceKey,products||[]).filter(p=>!meta[p.city+'|'+p.id]?.packingRateReference).map(async product=>{
      const {data,error}=await supabase.from('rates').select('*').eq('city',product.city).eq('product_id',product.id).order('sort_order');if(error)throw error;
      return {product,rates:calculateReferencedRates({meta,product,rates:data||[],products:products||[],calcFormula,applyExtraCost,roundPackingValue})};
    }));
    for(const group of looseLinked){const k=group.product.city+'|'+group.product.id;groupsByKey.set(k,group);publishedByKey.set(k,group.rates)}
    for(const product of packingRateDependants(meta,[...publishedByKey.keys()],products||[])){
      const k=product.city+'|'+product.id,refKey=packingReferenceKey(meta[k]?.packingRateReference),masterRates=publishedByKey.get(refKey);if(!masterRates)throw new Error(product.name+': packing source rates are unavailable');
      const {data,error}=await supabase.from('rates').select('*').eq('city',product.city).eq('product_id',product.id).order('sort_order');if(error)throw error;
      const rates=calculatePackingReferencedRates({meta,product,rates:data||[],sourceRates:masterRates,calcFormula,applyExtraCost,roundPackingValue});groupsByKey.set(k,{product,rates});publishedByKey.set(k,rates);
    }
    const groups=[...groupsByKey.values()].filter(g=>g.rates.length),payload=groups.flatMap(g=>g.rates);if(!payload.length)throw new Error('No packing rates to save.');
    await saveFormulaState(meta,cloudValue,session);
    const {data:saved,error:se}=await supabase.from('rates').upsert(payload,{onConflict:'city,product_id,packing'}).select('city,product_id,packing');if(se)throw se;if(saved?.length!==payload.length)throw new Error('Server did not confirm every saved rate.');
    const historyRows=groups.map(group=>{const k=group.product.city+'|'+group.product.id,s=meta[k]||{},loose=resolveLooseRate(meta,k,products||[]);return{city:group.product.city,product_id:group.product.id,changed_by:session.user.id,snapshot:{product_name:group.product.name,changed_by_name:profile.display_name||profile.login_id||null,loose_rate:loose.error?null:loose.value,loose_unit:'10 KG',rates:group.rates.map(r=>({packing:r.packing,rate:r.rate})),narration:group.rates[0]?.narration||''}}});
    const history=await supabase.from('rate_history').insert(historyRows);
    toast(history.error?'✅ RATES SAVED (history warning)':'✅ RATE UPDATE SAVED');
    fallback=null;await activateFallback(true);
  }catch(error){console.error('Exact admin fallback save failed',error);toast('Rates not saved: '+(error.message||error))}
  finally{fallbackSaving=false;if(save)save.disabled=false}
}

async function deleteFallbackRow(index){
  if(!fallbackActive())return;const row=fallback.rows[index];if(!row)return;
  try{
    await requireAdmin();
    if(row.id){const {error}=await supabase.from('rates').delete().eq('id',row.id).eq('city',fallback.city).eq('product_id',fallback.id);if(error)throw error}
    fallback.rows.splice(index,1);delete fallback.state.rows?.[row.packing];fallback.meta[fallback.key]=fallback.state;
    const {data:{session}}=await supabase.auth.getSession();const {data:cloud}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(session)await saveFormulaState(fallback.meta,cloud?.value||{},session);
    renderFallback();refreshFallback();toast('Packing removed.');
  }catch(error){toast('Packing not removed: '+(error.message||error))}
}

function installFallbackEvents(){
  const body=$('rateBody');if(!body)return;
  body.addEventListener('input',e=>{if(!fallbackActive())return;const el=e.target.closest('[data-i]');if(!el)return;e.stopImmediatePropagation();const row=fallback.rows[+el.dataset.i];if(row){row[el.dataset.f]=el.value;refreshFallback()}},true);
  body.addEventListener('change',e=>{if(!fallbackActive())return;const el=e.target.closest('[data-i]');if(!el)return;e.stopImmediatePropagation();const row=fallback.rows[+el.dataset.i];if(row){row[el.dataset.f]=el.value;refreshFallback()}},true);
  document.addEventListener('input',e=>{if(!fallbackActive())return;if(e.target===$('looseRate')&&!fallback.state.looseReference&&!masterLocked()){e.stopImmediatePropagation();fallback.state.looseRate=e.target.value;fallback.meta[fallback.key]=fallback.state;refreshFallback()}else if(e.target===$('pvFormula')&&!masterLocked()){e.stopImmediatePropagation();fallback.state.masterFormula=e.target.value;fallback.meta[fallback.key]=fallback.state;refreshFallback()}else if(e.target===$('pvRound')&&!masterLocked()){e.stopImmediatePropagation();fallback.state.masterRound=e.target.value;fallback.meta[fallback.key]=fallback.state;refreshFallback()}},true);
  document.addEventListener('click',e=>{
    if(e.target.closest('.productBtn')||e.target.closest('.city')){fallback=null;scheduleFallback(650);return}
    if(!fallbackActive())return;
    const del=e.target.closest('[data-fb-del]');if(del){e.preventDefault();e.stopImmediatePropagation();void deleteFallbackRow(+del.dataset.fbDel);return}
    if(e.target.closest('#addPacking')){e.preventDefault();e.stopImmediatePropagation();fallback.rows.push({id:null,packing:'',oldRate:0,master:'LOOSE OIL RATE',formula:'MASTER*1',extra:0,round:0,sort_order:fallback.rows.length+1});renderFallback();return}
    if(e.target.closest('#saveAll')){e.preventDefault();e.stopImmediatePropagation();void saveFallback();}
  },true);
}

if(area){
  installFallbackEvents();
  scheduleFallback(900);setTimeout(()=>scheduleFallback(0),2200);

  const card=area.closest('.card'),title=card?.querySelector('.title');
  if(!document.querySelector('.productManageBar')){
    const style=document.createElement('style');style.textContent=`.productManageBar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:-3px 0 10px}.productManageBar button{padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-size:9px;font-weight:950;cursor:pointer;box-shadow:0 3px 0 #d5dbe2}.productManageBar .pmAdd{background:#087f70;color:#fff;border-color:#087f70;box-shadow:0 3px 0 #045d52}.productManageBar .pmDelete{background:#fff1f0;color:#b42318;border-color:#f1b8b2;box-shadow:0 3px 0 #e7b0aa}.pmModal{position:fixed;inset:0;z-index:10050;background:#101827aa;display:grid;place-items:center;padding:18px}.pmBox{width:min(430px,100%);background:#fff;border-radius:15px;padding:17px;box-shadow:0 25px 70px #0005}.pmBox h3{margin:0 0 11px;font-size:16px}.pmGrid{display:grid;gap:9px}.pmGrid label{font-size:9px;font-weight:950}.pmGrid input{width:100%;margin-top:4px}.pmActions{display:flex;gap:7px;justify-content:flex-end;margin-top:12px}`;document.head.appendChild(style);
    const bar=document.createElement('div');bar.id='productManageBar';bar.className='productManageBar';bar.innerHTML='<button class="pmAdd" id="pmAdd">＋ ADD PRODUCT</button><button id="pmEdit">✏️ EDIT PRODUCT</button><button class="pmDelete" id="pmDelete">🗑 DELETE PRODUCT</button>';title?.insertAdjacentElement('afterend',bar);

    function openEditor(mode,p={}){
      $('pmModal')?.remove();const modal=document.createElement('div');modal.id='pmModal';modal.className='pmModal';modal.innerHTML=`<div class="pmBox"><h3>${mode==='add'?'ADD PRODUCT':'EDIT PRODUCT'}</h3><div class="pmGrid"><label>PRODUCT NAME<input id="pmName" value="${String(p.name||'').replace(/"/g,'&quot;')}"></label><label>PRODUCT CODE<input id="pmCode" value="${String(p.code||'').replace(/"/g,'&quot;')}"></label><label>SORT ORDER<input id="pmSort" type="number" min="0" value="${Number(p.sort_order??0)}"></label></div><div class="pmActions"><button class="btn light" id="pmCancel">CANCEL</button><button class="btn green" id="pmSave">SAVE PRODUCT</button></div></div>`;document.body.appendChild(modal);$('pmCancel').onclick=()=>modal.remove();$('pmSave').onclick=async()=>{try{await requireAdmin();const name=$('pmName').value.trim(),code=cleanCode($('pmCode').value),sort_order=Number($('pmSort').value||0);if(!name||!code)throw new Error('Product name and code required.');const payload={name,code,sort_order,active:true,city:selectedCity()};const q=mode==='add'?supabase.from('products').insert(payload):supabase.from('products').update(payload).eq('id',p.id).eq('city',selectedCity());const{error}=await q;if(error)throw error;location.reload()}catch(error){alert(error.message||error)}};
    }
    $('pmAdd').onclick=async()=>{try{await requireAdmin();const{data}=await supabase.from('products').select('sort_order').eq('city',selectedCity()).order('sort_order',{ascending:false}).limit(1);openEditor('add',{sort_order:(Number(data?.[0]?.sort_order)||0)+1})}catch(error){alert(error.message||error)}};
    $('pmEdit').onclick=async()=>{try{await requireAdmin();const id=selectedId();if(!id)throw new Error('Select a product first.');const{data,error}=await supabase.from('products').select('id,code,name,sort_order,city').eq('id',id).eq('city',selectedCity()).single();if(error)throw error;openEditor('edit',data)}catch(error){alert(error.message||error)}};
    $('pmDelete').onclick=async()=>{try{await requireAdmin();const id=selectedId();if(!id)throw new Error('Select a product first.');const btn=area.querySelector('.productBtn.active');if(!confirm(`Remove ${btn?.textContent||'this product'} from active products? Existing rates will be preserved.`))return;const{error}=await supabase.from('products').update({active:false}).eq('id',id).eq('city',selectedCity());if(error)throw error;location.reload()}catch(error){alert(error.message||error)}};
  }
}