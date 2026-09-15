import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { calcFormula, applyExtraCost, roundPackingValue } from './rate-calculator.js?v=20260915-udaan-editable-v1';

const SUPABASE_URL='https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});
const CLOUDKEY='admin_formula_state_v1',META='VISHWAS_RATE_ADMIN_META_V3',AHD='AHMEDABAD SAME PACKING';
const $=id=>document.getElementById(id);
let editor=null,busy=false,saving=false,locking=false,timer=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLocaleUpperCase('en-IN');
const selectedCity=()=>document.querySelector('#cityArea .city.active')?.dataset.city||'';
const selectedId=()=>document.querySelector('#productArea .productBtn.active')?.dataset.product||'';
const selectedKey=()=>selectedId()?selectedCity()+'|'+selectedId():'';
function clone(v){return JSON.parse(JSON.stringify(v??{}))}
function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.style.display='block';clearTimeout(window.__udaanToast);window.__udaanToast=setTimeout(()=>el.style.display='none',2400)}
function identity(v){return String(v??'').toLowerCase().replace(/\b(udaan|ahmedabad|ahd|amd|rajkot)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function family(p){const t=((p?.code||'')+' '+(p?.name||'')).toLowerCase();return['palm','groundnut','cotton','mustard','soya','sun','corn','visvita'].find(x=>t.includes(x))||''}
function findAhmedabadSource(target,products){const list=(products||[]).filter(p=>p.active!==false&&p.city==='Ahmedabad');return list.find(p=>identity(p.name)===identity(target.name))||list.find(p=>identity(p.code)===identity(target.code))||(()=>{const f=family(target),same=f?list.filter(p=>family(p)===f):[];return same.length===1?same[0]:null})()}
async function requireAdmin(){const{data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Admin session expired.');const{data:p,error}=await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();if(error||!p||p.role!=='admin'||!p.active)throw new Error('Active admin login required.');return session}
async function saveCloud(value,session){const{data,error}=await supabase.from('admin_state').upsert({key:CLOUDKEY,value,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();if(error)throw error;if(data?.key!==CLOUDKEY)throw new Error('Udaan settings could not be saved.');localStorage.setItem(META,JSON.stringify(value.meta||{}));localStorage.setItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1',JSON.stringify(value));localStorage.setItem('VRCL_ADMIN_STATE_UPDATED_AT',new Date().toISOString())}

function normalizedSetting(old={}){
  const legacyMaster=!old.master||old.master==='LOOSE OIL RATE'?AHD:old.master;
  const legacyFormula=['0','00'].includes(String(old.formula??'').trim())?'MASTER*1':(old.formula||'MASTER*1');
  return{master:legacyMaster,formula:legacyFormula,extra:old.extra??0,round:old.round??0};
}
async function ensureReference(target,source,cloudValue,targetRates){
  const key='Udaan|'+target.id,meta=clone(cloudValue.meta||{}),existing=clone(meta[key]||{}),rows=clone(existing.rows||{});
  for(const rate of targetRates||[])rows[rate.packing]=normalizedSetting(rows[rate.packing]);
  const state={...existing,packingRateReference:{city:'Ahmedabad',productId:source.id},packingRateReferenceLocked:existing.packingRateReferenceLocked===true,rows};
  delete state.looseReference;delete state.looseReferenceLocked;
  meta[key]=state;
  const changed=existing.packingRateReference?.city!=='Ahmedabad'||existing.packingRateReference?.productId!==source.id||!!existing.looseReference||Object.prototype.hasOwnProperty.call(existing,'looseReferenceLocked');
  if(!changed)return{cloudValue,meta,state};
  const next={...cloudValue,meta,captured_at:new Date().toISOString()};const session=await requireAdmin();await saveCloud(next,session);return{cloudValue:next,meta,state};
}

function evaluateRows(ctx){
  const names=new Map(ctx.rows.map((r,i)=>[r.packing,i])),cache=new Map();
  function one(i,seen=new Set()){
    if(cache.has(i))return cache.get(i);if(seen.has(i))return{rate:0,error:'MASTER LINK CYCLE'};
    const row=ctx.rows[i];if(!row)return{rate:0,error:'Missing row'};const next=new Set(seen);next.add(i);let master;
    if(!row.master||row.master===AHD){master=ctx.sourceMap.get(norm(row.packing));if(!Number.isFinite(master))return{rate:0,error:'Ahmedabad has no matching '+row.packing}}
    else{const j=names.get(row.master);if(j===undefined)return{rate:0,error:'Master packing missing: '+row.master};const linked=one(j,next);if(linked.error)return linked;master=linked.rate}
    const subtotal=calcFormula(row.formula||'MASTER*1',master),calculated=applyExtraCost(subtotal,row.extra),rate=roundPackingValue(calculated,row.round??0),out=Number.isFinite(rate)?{rate,master}:{rate:0,error:'Invalid rate'};cache.set(i,out);return out;
  }
  return ctx.rows.map((_,i)=>one(i));
}
function applyUdaanUi(){
  const udaan=selectedCity()==='Udaan';const looseRef=$('looseRefRow'),masterLock=$('masterLock'),loose=$('looseRate');
  if(udaan){if(looseRef)looseRef.hidden=true;if(masterLock)masterLock.hidden=true;if(loose){loose.disabled=true;loose.title='Not used for Udaan. Packing MASTER comes from Ahmedabad reference.'}}
  else{if(looseRef)looseRef.hidden=false;if(masterLock)masterLock.hidden=false;if(loose)loose.removeAttribute('title')}
}
function render(){
  if(!editor||editor.key!==selectedKey()||selectedCity()!=='Udaan')return;applyUdaanUi();
  const body=$('rateBody');if(!body)return;const values=evaluateRows(editor),locked=editor.state.packingRateReferenceLocked===true;
  body.innerHTML=editor.rows.map((r,i)=>{const v=values[i],opts=editor.rows.filter((_,j)=>j!==i).map(x=>`<option value="${esc(x.packing)}" ${r.master===x.packing?'selected':''}>${esc(x.packing)}</option>`).join('');return`<tr data-udaan-row="1"><td><input class="packingField" value="${esc(r.packing)}" disabled></td><td><select data-udaan-i="${i}" data-udaan-f="master" ${locked?'disabled':''}><option value="${AHD}" ${!r.master||r.master===AHD?'selected':''}>Ahmedabad / ${esc(editor.source.name)} / SAME PACKING</option>${opts}</select></td><td><input class="oldRateField" value="${Number(r.oldRate||0).toFixed(2)}" disabled></td><td><input data-udaan-i="${i}" data-udaan-f="formula" value="${esc(r.formula||'MASTER*1')}" placeholder="MASTER*1 / +5% / *1.02" ${locked?'disabled':''}></td><td><input type="text" inputmode="decimal" data-udaan-i="${i}" data-udaan-f="extra" value="${esc(r.extra)}" placeholder="0 / +5% / +2% / +15" ${locked?'disabled':''}></td><td><input type="number" data-udaan-i="${i}" data-udaan-f="round" value="${esc(r.round)}" ${locked?'disabled':''}></td><td><input class="newRate ${v?.error?'cycle':''}" data-udaan-new="${i}" value="${v?.error?'SOURCE ERROR':Number(v.rate).toFixed(2)}" disabled></td><td><button class="btn light" type="button" data-udaan-delete="${i}" ${locked?'disabled':''}>🗑️</button></td></tr>`}).join('');
  const refRow=$('packingRefRow');if(refRow){refRow.hidden=false;if($('packingRefModeField'))$('packingRefModeField').hidden=true;if($('packingRefCityField'))$('packingRefCityField').hidden=true;if($('packingRefProductField'))$('packingRefProductField').hidden=true;if($('packingRefOpen'))$('packingRefOpen').hidden=true;const lock=$('packingRefLock');if(lock){lock.hidden=false;lock.disabled=saving||locking;lock.textContent=locked?'🔒 UNLOCK':'🔓 LOCK';lock.classList.toggle('on',locked);lock.setAttribute('aria-pressed',String(locked))}const status=$('packingRefStatus');if(status){status.textContent=`Reference = Ahmedabad / ${editor.source.name}. MASTER LINK, FORMULA, EXTRA COSTING and ROUND OFF are editable when unlocked.`;status.classList.remove('refError')}}
}
function refresh(){if(!editor)return;const values=evaluateRows(editor);values.forEach((v,i)=>{const el=document.querySelector(`[data-udaan-new="${i}"]`);if(el){el.value=v.error?'SOURCE ERROR':Number(v.rate).toFixed(2);el.classList.toggle('cycle',!!v.error)}})}

async function loadUdaan(){
  if(selectedCity()!=='Udaan'){editor=null;applyUdaanUi();return}if(busy||!selectedId())return;busy=true;const key=selectedKey(),id=selectedId();
  try{
    const[{data:products,error:pe},{data:cloud,error:ce},{data:targetRates,error:te}]=await Promise.all([supabase.from('products').select('id,code,name,city,active,sort_order').eq('active',true).order('sort_order'),supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle(),supabase.from('rates').select('id,packing,rate,narration,sort_order').eq('city','Udaan').eq('product_id',id).order('sort_order')]);
    if(pe||ce||te||key!==selectedKey())return;const target=(products||[]).find(p=>p.id===id&&p.city==='Udaan');if(!target)return;const source=findAhmedabadSource(target,products||[]);if(!source){editor=null;applyUdaanUi();toast('Ahmedabad matching product not found for '+target.name);return}
    const{data:sourceRates,error:se}=await supabase.from('rates').select('packing,rate,sort_order').eq('city','Ahmedabad').eq('product_id',source.id).order('sort_order');if(se||key!==selectedKey())return;const sourceMap=new Map((sourceRates||[]).map(r=>[norm(r.packing),Number(r.rate)])),ensured=await ensureReference(target,source,cloud?.value||{},targetRates||[]);if(key!==selectedKey())return;const state=ensured.state,existingByPacking=new Map((targetRates||[]).map(r=>[norm(r.packing),r]));
    const rowSource=(sourceRates||[]).map((src,i)=>{const current=existingByPacking.get(norm(src.packing)),setting=normalizedSetting(state.rows?.[src.packing]||{});return{id:current?.id||null,packing:src.packing,oldRate:Number(current?.rate||0),master:setting.master,formula:setting.formula,extra:setting.extra,round:setting.round,sort_order:current?.sort_order??src.sort_order??i+1}});
    editor={key,id,target,source,products:products||[],cloudValue:ensured.cloudValue,meta:ensured.meta,state,sourceMap,rows:rowSource,narration:targetRates?.[0]?.narration||''};render();refresh();
  }catch(error){console.error('Udaan editor load failed',error);toast('Udaan setup load failed: '+(error.message||error))}finally{busy=false}
}
function schedule(delay=450){clearTimeout(timer);timer=setTimeout(()=>void loadUdaan(),delay)}
async function toggleUdaanLock(){if(!editor||locking||saving)return;locking=true;try{const session=await requireAdmin(),{data:cloud,error}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(error)throw error;const value=cloud?.value||{},meta=clone(value.meta||{}),state=clone(meta[editor.key]||editor.state||{});state.packingRateReference={city:'Ahmedabad',productId:editor.source.id};state.packingRateReferenceLocked=state.packingRateReferenceLocked!==true;delete state.looseReference;delete state.looseReferenceLocked;meta[editor.key]=state;await saveCloud({...value,meta,captured_at:new Date().toISOString()},session);editor.state=state;editor.meta=meta;render();toast(state.packingRateReferenceLocked?'🔒 UDAAN EDITING LOCKED':'🔓 UDAAN EDITING UNLOCKED')}catch(error){toast('Lock not saved: '+(error.message||error))}finally{locking=false;render()}}
async function saveUdaan(){
  if(!editor||saving)return;saving=true;const btn=$('saveAll');if(btn)btn.disabled=true;
  try{const session=await requireAdmin(),values=evaluateRows(editor);for(const v of values)if(v.error)throw new Error(v.error);const{data:cloud,error:ce}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(ce)throw ce;const cloudValue=cloud?.value||{},meta=clone(cloudValue.meta||{}),state=clone(meta[editor.key]||editor.state||{});state.packingRateReference={city:'Ahmedabad',productId:editor.source.id};state.packingRateReferenceLocked=editor.state.packingRateReferenceLocked===true;delete state.looseReference;delete state.looseReferenceLocked;state.rows={};editor.rows.forEach(r=>{state.rows[r.packing]={master:r.master||AHD,formula:r.formula||'MASTER*1',extra:r.extra??0,round:r.round??0}});meta[editor.key]=state;await saveCloud({...cloudValue,meta,captured_at:new Date().toISOString()},session);const narration=$('narration')?.value??editor.narration??'',payload=editor.rows.map((r,i)=>({city:'Udaan',product_id:editor.id,packing:r.packing,rate:values[i].rate,narration,sort_order:i+1}));const{data,error}=await supabase.from('rates').upsert(payload,{onConflict:'city,product_id,packing'}).select('city,product_id,packing');if(error)throw error;if(data?.length!==payload.length)throw new Error('Server did not confirm all Udaan rates.');toast('✅ UDAAN RATES SAVED');await loadUdaan()}catch(error){toast('Udaan rates not saved: '+(error.message||error))}finally{saving=false;if(btn)btn.disabled=false;render()}
}
async function deleteRow(index){if(!editor)return;if(editor.state.packingRateReferenceLocked===true){toast('🔒 Unlock Udaan editing first.');return}const row=editor.rows[index];if(!row)return;try{await requireAdmin();if(row.id){const{error}=await supabase.from('rates').delete().eq('id',row.id).eq('city','Udaan').eq('product_id',editor.id);if(error)throw error}editor.rows.splice(index,1);render();toast('Packing removed.')}catch(error){toast('Packing not removed: '+(error.message||error))}}

if($('rateBody')){
  $('rateBody').addEventListener('input',e=>{if(selectedCity()!=='Udaan'||!editor)return;const el=e.target.closest('[data-udaan-i]');if(!el)return;e.stopImmediatePropagation();if(editor.state.packingRateReferenceLocked===true)return;const row=editor.rows[+el.dataset.udaanI];if(row){row[el.dataset.udaanF]=el.value;refresh()}},true);
  $('rateBody').addEventListener('change',e=>{if(selectedCity()!=='Udaan'||!editor)return;const el=e.target.closest('[data-udaan-i]');if(!el)return;e.stopImmediatePropagation();if(editor.state.packingRateReferenceLocked===true)return;const row=editor.rows[+el.dataset.udaanI];if(row){row[el.dataset.udaanF]=el.value;refresh()}},true);
  document.addEventListener('click',e=>{if(e.target.closest('.productBtn')||e.target.closest('.city')){editor=null;setTimeout(applyUdaanUi,0);schedule(650);return}if(selectedCity()!=='Udaan'||!editor)return;if(e.target.closest('#packingRefLock')){e.preventDefault();e.stopImmediatePropagation();void toggleUdaanLock();return}const del=e.target.closest('[data-udaan-delete]');if(del){e.preventDefault();e.stopImmediatePropagation();void deleteRow(+del.dataset.udaanDelete);return}if(e.target.closest('#saveAll')){e.preventDefault();e.stopImmediatePropagation();void saveUdaan();return}if(e.target.closest('#addPacking')){e.preventDefault();e.stopImmediatePropagation();toast('Udaan packing comes automatically from the matching Ahmedabad product.')}},true);
  const observer=new MutationObserver(()=>{if(selectedCity()==='Udaan'&&editor&&!document.querySelector('#rateBody [data-udaan-row]'))schedule(60);if(selectedCity()==='Udaan')applyUdaanUi()});observer.observe($('rateBody'),{childList:true,subtree:true});applyUdaanUi();schedule(1000);setTimeout(()=>schedule(0),2200);
}