import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { applyExtraCost, roundPackingValue } from './rate-calculator.js?v=20260915-udaan-all-products';

const SUPABASE_URL='https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});
const CLOUDKEY='admin_formula_state_v1',META='VISHWAS_RATE_ADMIN_META_V3',MASTERKEY='VRCL_MASTER_LOCK';
const $=id=>document.getElementById(id);
let editor=null,busy=false,saving=false,timer=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normPacking=v=>String(v??'').trim().toLocaleUpperCase('en-IN');
const selectedCity=()=>document.querySelector('#cityArea .city.active')?.dataset.city||'';
const selectedId=()=>document.querySelector('#productArea .productBtn.active')?.dataset.product||'';
const selectedKey=()=>selectedId()?selectedCity()+'|'+selectedId():'';
const masterLocked=()=>localStorage.getItem(MASTERKEY)==='1';
function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.style.display='block';clearTimeout(window.__udaanToast);window.__udaanToast=setTimeout(()=>el.style.display='none',2400)}
function clone(v){return JSON.parse(JSON.stringify(v??{}))}
function identity(v){return String(v??'').toLowerCase().replace(/\b(udaan|ahmedabad|ahd|amd|rajkot)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function family(p){const t=((p?.code||'')+' '+(p?.name||'')).toLowerCase();return['palm','groundnut','cotton','mustard','soya','sun','corn','visvita'].find(x=>t.includes(x))||''}
function findAhmedabadSource(target,products){
  const candidates=(products||[]).filter(p=>p.active!==false&&p.city==='Ahmedabad');
  const byName=candidates.find(p=>identity(p.name)===identity(target.name));if(byName)return byName;
  const byCode=candidates.find(p=>identity(p.code)===identity(target.code));if(byCode)return byCode;
  const f=family(target),same=f?candidates.filter(p=>family(p)===f):[];return same.length===1?same[0]:null;
}
async function requireAdmin(){const{data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Admin session expired.');const{data:p,error}=await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();if(error||!p||p.role!=='admin'||!p.active)throw new Error('Active admin login required.');return session}
async function saveCloud(value,session){const{data,error}=await supabase.from('admin_state').upsert({key:CLOUDKEY,value,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();if(error)throw error;if(data?.key!==CLOUDKEY)throw new Error('Udaan settings could not be saved.');localStorage.setItem(META,JSON.stringify(value.meta||{}));localStorage.setItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1',JSON.stringify(value));localStorage.setItem('VRCL_ADMIN_STATE_UPDATED_AT',new Date().toISOString())}

async function ensureReference(target,source,cloudValue,targetRates){
  const key='Udaan|'+target.id,meta=clone(cloudValue.meta||{}),existing=clone(meta[key]||{}),wasCorrect=existing.packingRateReference?.city==='Ahmedabad'&&existing.packingRateReference?.productId===source.id;
  if(wasCorrect)return{cloudValue,meta,state:existing,changed:false};
  const rows={};
  for(const rate of targetRates||[]){const old=existing.rows?.[rate.packing]||{};rows[rate.packing]={master:'LOOSE OIL RATE',formula:'MASTER*1',extra:0,round:old.round??0}}
  const state={...existing,packingRateReference:{city:'Ahmedabad',productId:source.id},packingRateReferenceLocked:true,rows};
  meta[key]=state;
  const next={...cloudValue,meta,captured_at:new Date().toISOString()};
  const session=await requireAdmin();await saveCloud(next,session);
  return{cloudValue:next,meta,state,changed:true};
}

function calcRows(ctx){return ctx.rows.map(row=>{const source=ctx.sourceMap.get(normPacking(row.packing));if(!Number.isFinite(source))return{rate:0,error:'Ahmedabad has no matching '+row.packing};const rate=roundPackingValue(applyExtraCost(source,row.extra),row.round??0);return Number.isFinite(rate)?{rate,master:source}:{rate:0,error:'Invalid rate'}})}
function render(){
  if(!editor||editor.key!==selectedKey()||selectedCity()!=='Udaan')return;
  const body=$('rateBody');if(!body)return;const values=calcRows(editor);
  body.innerHTML=editor.rows.map((r,i)=>{const v=values[i],source=editor.sourceMap.get(normPacking(r.packing));return`<tr data-udaan-row="1"><td><input class="packingField" value="${esc(r.packing)}" disabled></td><td><select class="sourceMaster" disabled><option>Ahmedabad / ${esc(editor.source.name)} / ${esc(r.packing)}</option></select></td><td><input class="oldRateField" value="${Number(r.oldRate||0).toFixed(2)}" disabled></td><td><input value="MASTER*1" disabled title="Udaan master is Ahmedabad same packing"></td><td><input type="text" inputmode="decimal" data-udaan-i="${i}" data-udaan-f="extra" value="${esc(r.extra)}" placeholder="0 / +5% / +2% / +15"></td><td><input type="number" data-udaan-i="${i}" data-udaan-f="round" value="${esc(r.round)}"></td><td><input class="newRate ${v?.error?'cycle':''}" data-udaan-new="${i}" value="${v?.error?'SOURCE ERROR':Number(v.rate).toFixed(2)}" disabled title="Ahmedabad master ${Number(source||0).toFixed(2)}"></td><td><button class="btn light" type="button" data-udaan-delete="${i}">🗑️</button></td></tr>`}).join('');
  const refRow=$('packingRefRow');if(refRow){refRow.hidden=false;const status=$('packingRefStatus');if(status){status.textContent=`UDAAN MASTER = Ahmedabad / ${editor.source.name} / same packing. EXTRA COSTING: 0 = same rate, +5% = +5%, +2% = +2%.`;status.classList.remove('refError')}}
}
function refresh(){if(!editor)return;const values=calcRows(editor);values.forEach((v,i)=>{const el=document.querySelector(`[data-udaan-new="${i}"]`);if(el){el.value=v.error?'SOURCE ERROR':Number(v.rate).toFixed(2);el.classList.toggle('cycle',!!v.error)}})}

async function loadUdaan(){
  if(busy||selectedCity()!=='Udaan'||!selectedId())return;busy=true;
  const key=selectedKey(),id=selectedId();
  try{
    const [{data:products,error:pe},{data:cloud,error:ce},{data:targetRates,error:te}]=await Promise.all([
      supabase.from('products').select('id,code,name,city,active,sort_order').eq('active',true).order('sort_order'),
      supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle(),
      supabase.from('rates').select('id,packing,rate,narration,sort_order').eq('city','Udaan').eq('product_id',id).order('sort_order')
    ]);
    if(pe||ce||te||key!==selectedKey())return;
    const target=(products||[]).find(p=>p.id===id&&p.city==='Udaan');if(!target)return;
    const source=findAhmedabadSource(target,products||[]);
    if(!source){editor=null;toast('Ahmedabad matching product not found for '+target.name);return}
    const {data:sourceRates,error:se}=await supabase.from('rates').select('packing,rate,sort_order').eq('city','Ahmedabad').eq('product_id',source.id).order('sort_order');if(se||key!==selectedKey())return;
    const sourceMap=new Map((sourceRates||[]).map(r=>[normPacking(r.packing),Number(r.rate)]));
    const ensured=await ensureReference(target,source,cloud?.value||{},targetRates||[]);if(key!==selectedKey())return;
    const state=ensured.state;
    const existingByPacking=new Map((targetRates||[]).map(r=>[normPacking(r.packing),r]));
    const rowSource=(sourceRates||[]).map((src,i)=>{const current=existingByPacking.get(normPacking(src.packing));const setting=state.rows?.[src.packing]||{};return{id:current?.id||null,packing:src.packing,oldRate:Number(current?.rate||0),extra:setting.extra??0,round:setting.round??0,sort_order:current?.sort_order??src.sort_order??i+1}});
    editor={key,id,target,source,products:products||[],cloudValue:ensured.cloudValue,meta:ensured.meta,state,sourceMap,rows:rowSource,narration:targetRates?.[0]?.narration||''};
    render();refresh();
  }catch(error){console.error('Udaan editor load failed',error);toast('Udaan setup load failed: '+(error.message||error))}finally{busy=false}
}
function schedule(delay=450){clearTimeout(timer);timer=setTimeout(()=>void loadUdaan(),delay)}

async function saveUdaan(){
  if(!editor||editor.key!==selectedKey()||saving)return;saving=true;const btn=$('saveAll');if(btn)btn.disabled=true;
  try{
    if(masterLocked())throw new Error('MASTER LOCKED');const session=await requireAdmin();const values=calcRows(editor);for(const v of values)if(v.error)throw new Error(v.error);
    const {data:cloud,error:ce}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(ce)throw ce;
    const cloudValue=cloud?.value||{},meta=clone(cloudValue.meta||{}),state=clone(meta[editor.key]||editor.state||{});state.packingRateReference={city:'Ahmedabad',productId:editor.source.id};state.packingRateReferenceLocked=true;state.rows={};
    editor.rows.forEach(r=>{state.rows[r.packing]={master:'LOOSE OIL RATE',formula:'MASTER*1',extra:r.extra??0,round:r.round??0}});meta[editor.key]=state;await saveCloud({...cloudValue,meta,captured_at:new Date().toISOString()},session);
    const narration=$('narration')?.value??editor.narration??'';const payload=editor.rows.map((r,i)=>({city:'Udaan',product_id:editor.id,packing:r.packing,rate:values[i].rate,narration,sort_order:i+1}));
    const {data,error}=await supabase.from('rates').upsert(payload,{onConflict:'city,product_id,packing'}).select('city,product_id,packing');if(error)throw error;if(data?.length!==payload.length)throw new Error('Server did not confirm all Udaan rates.');
    toast('✅ UDAAN RATES SAVED — Ahmedabad master + Extra Costing');await loadUdaan();
  }catch(error){toast('Udaan rates not saved: '+(error.message||error))}finally{saving=false;if(btn)btn.disabled=false}
}
async function deleteRow(index){if(!editor)return;const row=editor.rows[index];if(!row)return;try{await requireAdmin();if(row.id){const{error}=await supabase.from('rates').delete().eq('id',row.id).eq('city','Udaan').eq('product_id',editor.id);if(error)throw error}editor.rows.splice(index,1);render();toast('Packing removed.')}catch(error){toast('Packing not removed: '+(error.message||error))}}

if($('rateBody')){
  $('rateBody').addEventListener('input',e=>{if(selectedCity()!=='Udaan'||!editor)return;const el=e.target.closest('[data-udaan-i]');if(!el)return;e.stopImmediatePropagation();const row=editor.rows[+el.dataset.udaanI];if(row){row[el.dataset.udaanF]=el.value;refresh()}},true);
  $('rateBody').addEventListener('change',e=>{if(selectedCity()!=='Udaan'||!editor)return;const el=e.target.closest('[data-udaan-i]');if(!el)return;e.stopImmediatePropagation();const row=editor.rows[+el.dataset.udaanI];if(row){row[el.dataset.udaanF]=el.value;refresh()}},true);
  document.addEventListener('click',e=>{
    if(e.target.closest('.productBtn')||e.target.closest('.city')){editor=null;schedule(650);return}
    if(selectedCity()!=='Udaan'||!editor)return;
    const del=e.target.closest('[data-udaan-delete]');if(del){e.preventDefault();e.stopImmediatePropagation();void deleteRow(+del.dataset.udaanDelete);return}
    if(e.target.closest('#saveAll')){e.preventDefault();e.stopImmediatePropagation();void saveUdaan();return}
    if(e.target.closest('#addPacking')){e.preventDefault();e.stopImmediatePropagation();toast('Udaan packing comes automatically from the matching Ahmedabad product.');}
  },true);
  const observer=new MutationObserver(()=>{if(selectedCity()==='Udaan'&&editor&&!document.querySelector('#rateBody [data-udaan-row]'))schedule(60)});observer.observe($('rateBody'),{childList:true,subtree:true});
  schedule(1000);setTimeout(()=>schedule(0),2200);
}