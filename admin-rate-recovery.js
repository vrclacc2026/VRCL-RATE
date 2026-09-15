import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js?v=20260915-rate-save-recovery';
import { resolveLooseRate, looseRateDependants, calculateReferencedRates } from './loose-rate-reference.js?v=20260912-rate-tools';
import { packingReferenceKey, packingRateDependants, calculatePackingReferencedRates } from './packing-rate-reference.js?v=20260915-udaan-palm';
import { calcFormula, applyExtraCost, roundPackingValue, roundLooseValue } from './rate-calculator.js?v=20260912-rate-tools';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vrcl-admin-auth' }
});

const META='VISHWAS_RATE_ADMIN_META_V3';
const META_UPDATED='VRCL_ADMIN_STATE_UPDATED_AT';
const LOCKKEY='VRCL_ADMIN_COLUMN_LOCKS';
const MASTERKEY='VRCL_MASTER_LOCK';
const CLOUDKEY='admin_formula_state_v1';
const $=id=>document.getElementById(id);
let context=null;
let recalculationTimer=null;
let recoverySaving=false;

function readJson(key,fallback={}){try{return JSON.parse(localStorage.getItem(key)||'')??fallback}catch{return fallback}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function normalizedPacking(v){return String(v??'').trim().toLocaleUpperCase('en-IN')}
function selectedId(){return document.querySelector('#productArea .productBtn.active')?.dataset.product||''}
function selectedCity(){return document.querySelector('#cityArea .city.active')?.dataset.city||'Rajkot'}
function selectedKey(){const id=selectedId();return id?selectedCity()+'|'+id:''}
function isRecovered(){return !!document.querySelector('#rateBody button[title*="recovered row"]')}
function notify(message){const t=$('toast');if(!t)return;t.textContent=message;t.style.display='block';clearTimeout(window.__vrclRecoveryToast);window.__vrclRecoveryToast=setTimeout(()=>t.style.display='none',2600)}
function currentProduct(products=context?.products||[]){const id=selectedId(),city=selectedCity();return products.find(p=>p.id===id&&p.city===city)}
function productFamily(product){const text=((product?.code||'')+' '+(product?.name||'')).toLowerCase();return['palm','groundnut','cotton','mustard','soya','sun','corn','visvita'].find(name=>text.includes(name))||product?.code||''}
function isUdaanPalm(product){return product?.city==='Udaan'&&productFamily(product)==='palm'}
function localStateForKey(key){return readJson(META,{})[key]||{looseRate:'',masterFormula:'MASTER*1',masterRound:0,rows:{}}}

function collectRows(state){
  const rows=[];
  document.querySelectorAll('#rateBody tr').forEach((tr,index)=>{
    const packingEl=tr.querySelector('[data-f="packing"]');if(!packingEl)return;
    const packing=packingEl.value.trim(),saved=state.rows?.[packing]||{};
    rows.push({
      packing,
      oldRate:Number(tr.querySelector('[data-f="oldRate"]')?.value||0),
      master:tr.querySelector('[data-f="master"]')?.value||saved.master||'LOOSE OIL RATE',
      formula:tr.querySelector('[data-f="formula"]')?.value||'MASTER*1',
      extra:tr.querySelector('[data-f="extra"]')?.value??0,
      round:tr.querySelector('[data-f="round"]')?.value??0,
      sort_order:index+1
    });
  });
  return rows;
}

async function loadContext(force=false){
  const key=selectedKey();if(!key)return null;
  if(!force&&context?.key===key)return context;
  const {data:products,error}=await supabase.from('products').select('id,code,name,sort_order,city,active').eq('active',true).order('sort_order');
  if(error)throw error;
  const meta=readJson(META,{}),state=meta[key]||{},sourceMap=new Map();let sourceError='';
  if(state.packingRateReference){
    const ref=state.packingRateReference;
    const result=await supabase.from('rates').select('packing,rate').eq('city',ref.city).eq('product_id',ref.productId).order('sort_order');
    if(result.error)sourceError='Packing source rates could not be loaded';
    else for(const row of result.data||[]){const name=normalizedPacking(row.packing),value=Number(row.rate);if(!name||sourceMap.has(name)||!Number.isFinite(value)){sourceError='Packing source contains invalid or duplicate rows';sourceMap.clear();break}sourceMap.set(name,value)}
    if(!sourceError&&!sourceMap.size)sourceError='Packing source has no saved rates';
  }
  context={key,products:products||[],sourceMap,sourceError};
  return context;
}

function evaluateRows(rows,meta,ctx){
  const key=selectedKey(),state=meta[key]||{},product=currentProduct(ctx.products),loose=resolveLooseRate(meta,key,ctx.products),cache=new Map();
  const byPacking=new Map(rows.map((r,i)=>[r.packing,i]));
  function evaluate(index,visited=new Set()){
    if(cache.has(index))return cache.get(index);
    if(visited.has(index))return{rate:0,cycle:true,error:'MASTER LINK CYCLE FOUND'};
    const row=rows[index];if(!row)return{rate:0,error:'Packing row missing'};
    const next=new Set(visited);next.add(index);let master=0;
    if(state.packingRateReference){
      if(ctx.sourceError)return{rate:0,error:ctx.sourceError};
      const value=ctx.sourceMap.get(normalizedPacking(row.packing));
      if(!Number.isFinite(value))return{rate:0,error:'Source has no matching rate for '+(row.packing||'this packing')};
      master=value;
    }else if(!row.master||row.master==='LOOSE OIL RATE'){
      if(loose.error)return{rate:0,error:loose.error};
      master=Number(loose.value)||0;
    }else{
      const linkedIndex=byPacking.get(row.master);
      if(linkedIndex===undefined)return{rate:0,error:'Packing master is missing for '+row.packing};
      const linked=evaluate(linkedIndex,next);if(linked.error||linked.cycle)return linked;master=linked.rate;
    }
    const subtotal=isUdaanPalm(product)&&state.packingRateReference?master*1.05:calcFormula(row.formula||'MASTER*1',master);
    const calculated=isUdaanPalm(product)&&state.packingRateReference?subtotal:applyExtraCost(subtotal,row.extra);
    const rate=roundPackingValue(calculated,row.round??0);
    const out=Number.isFinite(rate)?{rate,master}:{rate:0,error:'Invalid calculated rate'};cache.set(index,out);return out;
  }
  return rows.map((_,i)=>evaluate(i));
}

async function recalculateRecovered(){
  if(!isRecovered()||recoverySaving)return;
  try{
    const key=selectedKey();if(!key)return;
    const ctx=await loadContext();if(!ctx||ctx.key!==key||!isRecovered())return;
    const meta=readJson(META,{}),state=meta[key]||{};
    const loose=$('looseRate');if(loose&&!state.looseReference){state.looseRate=loose.value;meta[key]=state;localStorage.setItem(META,JSON.stringify(meta));localStorage.setItem(META_UPDATED,new Date().toISOString())}
    const rows=collectRows(state),values=evaluateRows(rows,meta,ctx);
    values.forEach((value,i)=>{const el=document.querySelector(`[data-new="${i}"]`);if(!el)return;el.value=value.error?'SOURCE ERROR':value.cycle?'CYCLE':value.rate.toFixed(2);el.classList.toggle('cycle',!!(value.error||value.cycle))});
    if($('pvDiff')){const resolved=resolveLooseRate(meta,key,ctx.products);$('pvDiff').textContent=resolved.error?'SOURCE ERROR':roundLooseValue(calcFormula(state.masterFormula||$('pvFormula')?.value||'MASTER*1',resolved.value),state.masterRound??$('pvRound')?.value??0).toFixed(2)}
  }catch(error){console.error('Recovered rate recalculation failed:',error)}
}
function scheduleRecalculation(){clearTimeout(recalculationTimer);recalculationTimer=setTimeout(()=>void recalculateRecovered(),40)}

async function requireAdminSession(){
  const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Admin session expired. Please log in again.');
  const {data:profile,error}=await supabase.from('profiles').select('id,display_name,login_id,role,active').eq('id',session.user.id).single();
  if(error||!profile||profile.role!=='admin'||!profile.active)throw new Error('Active admin login required.');
  return{session,profile};
}

async function cloudFormulaState(){
  const {data,error}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(error)throw error;return data?.value||{};
}
async function saveFormulaState(meta,cloudValue,session){
  const value={...cloudValue,meta,locks:readJson(LOCKKEY,cloudValue?.locks||{}),master_lock:localStorage.getItem(MASTERKEY)==='1',captured_at:new Date().toISOString()};
  const {data,error}=await supabase.from('admin_state').upsert({key:CLOUDKEY,value,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();
  if(error)throw error;if(data?.key!==CLOUDKEY)throw new Error('Formula settings could not be saved.');
  localStorage.setItem(META,JSON.stringify(meta));localStorage.setItem(META_UPDATED,new Date().toISOString());
}

async function saveRecoveredRates(){
  if(recoverySaving)return;
  recoverySaving=true;const button=$('saveAll');if(button)button.disabled=true;
  try{
    const sourceKey=selectedKey();if(!sourceKey||!isRecovered())throw new Error('Select a product first.');
    const {session,profile}=await requireAdminSession(),ctx=await loadContext(true);if(ctx.key!==sourceKey)throw new Error('Product selection changed. Click SAVE ALL again.');
    const cloudValue=await cloudFormulaState(),cloudMeta=cloudValue?.meta&&typeof cloudValue.meta==='object'?cloudValue.meta:{},localMeta=readJson(META,{});
    const selectedState=JSON.parse(JSON.stringify(localMeta[sourceKey]||cloudMeta[sourceKey]||{looseRate:'',masterFormula:'MASTER*1',masterRound:0,rows:{}}));
    if(!selectedState.looseReference)selectedState.looseRate=$('looseRate')?.value??selectedState.looseRate;
    selectedState.masterFormula=$('pvFormula')?.value||selectedState.masterFormula||'MASTER*1';selectedState.masterRound=$('pvRound')?.value??selectedState.masterRound??0;
    const meta={...cloudMeta,[sourceKey]:selectedState},rows=collectRows(selectedState),names=new Set();
    if(!rows.length)throw new Error('No packing rates to save.');
    selectedState.rows={};
    for(const row of rows){if(!row.packing)throw new Error('Enter a name for every packaging row.');const key=normalizedPacking(row.packing);if(names.has(key))throw new Error('Packaging names must be unique.');names.add(key);selectedState.rows[row.packing]={master:row.master,formula:row.formula,extra:row.extra,round:row.round}}
    meta[sourceKey]=selectedState;
    const values=evaluateRows(rows,meta,ctx);for(const value of values)if(value.error||value.cycle)throw new Error(value.error||'MASTER LINK CYCLE FOUND');
    const sourceProduct=currentProduct(ctx.products);if(!sourceProduct)throw new Error('Selected product is unavailable.');const narration=$('narration')?.value||'';
    const sourceRates=rows.map((row,i)=>({city:sourceProduct.city,product_id:sourceProduct.id,packing:row.packing,rate:values[i].rate,narration,sort_order:i+1}));
    const snapshot=JSON.parse(JSON.stringify(meta)),groupsByKey=new Map([[sourceKey,{product:sourceProduct,rates:sourceRates}]]),publishedByKey=new Map([[sourceKey,sourceRates]]);

    const looseLinked=await Promise.all(looseRateDependants(snapshot,sourceKey,ctx.products).filter(product=>!snapshot[product.city+'|'+product.id]?.packingRateReference).map(async product=>{
      const {data,error}=await supabase.from('rates').select('*').eq('city',product.city).eq('product_id',product.id).order('sort_order');if(error)throw error;
      return{product,rates:calculateReferencedRates({meta:snapshot,product,rates:data||[],products:ctx.products,calcFormula,applyExtraCost,roundPackingValue})};
    }));
    for(const group of looseLinked){const groupKey=group.product.city+'|'+group.product.id;groupsByKey.set(groupKey,group);publishedByKey.set(groupKey,group.rates)}

    const packingLinked=packingRateDependants(snapshot,[...publishedByKey.keys()],ctx.products);
    for(const product of packingLinked){
      const groupKey=product.city+'|'+product.id,referenceKey=packingReferenceKey(snapshot[groupKey]?.packingRateReference),masterRates=publishedByKey.get(referenceKey);if(!masterRates)throw new Error(product.name+': packing source rates are unavailable');
      const {data,error}=await supabase.from('rates').select('*').eq('city',product.city).eq('product_id',product.id).order('sort_order');if(error)throw error;
      const rates=calculatePackingReferencedRates({meta:snapshot,product,rates:data||[],sourceRates:masterRates,calcFormula,applyExtraCost,roundPackingValue});groupsByKey.set(groupKey,{product,rates});publishedByKey.set(groupKey,rates);
    }

    const groups=[...groupsByKey.values()].filter(group=>group.rates.length),linked=groups.filter(group=>group.product.city+'|'+group.product.id!==sourceKey),payload=groups.flatMap(group=>group.rates);if(!payload.length)throw new Error('No packing rates to save.');
    if(selectedKey()!==sourceKey)throw new Error('Product selection changed. Click SAVE ALL again.');
    await saveFormulaState(snapshot,cloudValue,session);
    const {data,error}=await supabase.from('rates').upsert(payload,{onConflict:'city,product_id,packing'}).select('city,product_id,packing');if(error)throw error;if(data?.length!==payload.length)throw new Error('The server did not confirm every rate. Please check and save again.');

    const sourceName=reference=>{const p=ctx.products.find(x=>x.city===reference?.city&&x.id===reference?.productId);return p?reference.city+' / '+p.name:null};
    const history=await supabase.from('rate_history').insert(groups.map(group=>{const groupKey=group.product.city+'|'+group.product.id,state=snapshot[groupKey]||{},loose=resolveLooseRate(snapshot,groupKey,ctx.products);return{city:group.product.city,product_id:group.product.id,changed_by:session.user.id,snapshot:{product_name:group.product.name,changed_by_name:profile.display_name||profile.login_id||null,loose_rate:loose.error?null:loose.value,loose_unit:'10 KG',loose_source:sourceName(state.looseReference),packing_source:sourceName(state.packingRateReference),rates:group.rates.map(r=>({packing:r.packing,rate:r.rate})),narration:group.rates[0]?.narration||''}}}));

    sourceRates.forEach((row,i)=>{const old=document.querySelector(`[data-f="oldRate"][data-i="${i}"]`),next=document.querySelector(`[data-new="${i}"]`);if(old)old.value=Number(row.rate).toFixed(2);if(next)next.value=Number(row.rate).toFixed(2)});
    notify(history.error?'Rates saved. History could not be saved.':'✅ RATE UPDATE SAVED'+(linked.length?' + '+linked.length+' LINKED PRODUCTS':''));
  }catch(error){notify('Rates not saved: '+(error.message||error));console.error('Recovered SAVE ALL failed:',error)}
  finally{recoverySaving=false;if(button)button.disabled=false;void recalculateRecovered()}
}

function install(){
  const body=$('rateBody'),loose=$('looseRate'),save=$('saveAll');if(!body||!loose||!save)return;
  body.addEventListener('input',e=>{if(isRecovered()&&e.target.closest('[data-i]'))scheduleRecalculation()},true);
  body.addEventListener('change',e=>{if(isRecovered()&&e.target.closest('[data-i]'))scheduleRecalculation()},true);
  loose.addEventListener('input',()=>{if(isRecovered())scheduleRecalculation()},true);
  $('pvFormula')?.addEventListener('input',()=>{if(isRecovered())scheduleRecalculation()},true);
  $('pvRound')?.addEventListener('input',()=>{if(isRecovered())scheduleRecalculation()},true);
  save.addEventListener('click',e=>{if(!isRecovered())return;e.preventDefault();e.stopImmediatePropagation();void saveRecoveredRates()},true);
  let last='';setInterval(()=>{const key=selectedKey()+(isRecovered()?'|R':'|N');if(key!==last){last=key;context=null;if(isRecovered()){void loadContext(true).then(()=>recalculateRecovered()).catch(error=>console.error(error))}}},300);
}

if(/\/admin(?:\.html)?\/?$/.test(location.pathname))install();