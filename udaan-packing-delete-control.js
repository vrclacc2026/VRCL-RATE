import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});
const CLOUDKEY='admin_formula_state_v1',META='VISHWAS_RATE_ADMIN_META_V3';
let busy=false,cleanupTimers=[];

const $=id=>document.getElementById(id);
const selectedCity=()=>document.querySelector('#cityArea .city.active')?.dataset.city||'';
const selectedId=()=>document.querySelector('#productArea .productBtn.active')?.dataset.product||'';
const selectedKey=()=>selectedId()?selectedCity()+'|'+selectedId():'';
const norm=v=>String(v??'').trim().toLocaleUpperCase('en-IN');
const clone=v=>JSON.parse(JSON.stringify(v??{}));
function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.style.display='block';clearTimeout(window.__udaanDeleteToast);window.__udaanDeleteToast=setTimeout(()=>el.style.display='none',2400)}
function readMeta(){try{return JSON.parse(localStorage.getItem(META)||'{}')}catch{return{}}}
function excludedSet(meta=readMeta(),key=selectedKey()){
  const list=meta?.[key]?.excludedPackings;
  return new Set((Array.isArray(list)?list:[]).map(norm).filter(Boolean));
}
function writeLocal(value){try{localStorage.setItem(META,JSON.stringify(value.meta||{}));localStorage.setItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1',JSON.stringify(value));localStorage.setItem('VRCL_ADMIN_STATE_UPDATED_AT',new Date().toISOString())}catch{}}
async function requireAdmin(){
  const{data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Admin session expired.');
  const{data:p,error}=await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();
  if(error||!p||p.role!=='admin'||!p.active)throw new Error('Active admin login required.');
  return session;
}
async function saveState(mutator){
  const session=await requireAdmin();
  const{data,error}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(error)throw error;
  const value=data?.value||{},meta=clone(value.meta||{}),key=selectedKey(),state=clone(meta[key]||{});
  mutator(state);meta[key]=state;
  const next={...value,meta,captured_at:new Date().toISOString()};
  const saved=await supabase.from('admin_state').upsert({key:CLOUDKEY,value:next,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();
  if(saved.error)throw saved.error;if(saved.data?.key!==CLOUDKEY)throw new Error('Udaan packing settings were not saved.');
  writeLocal(next);return state;
}
function rowPacking(row){return row?.querySelector('.packingField')?.value?.trim()||row?.querySelector('td input')?.value?.trim()||''}
function hideExcludedRows(){
  if(selectedCity()!=='Udaan')return;
  const excluded=excludedSet();if(!excluded.size)return;
  document.querySelectorAll('#rateBody tr[data-udaan-row]').forEach(row=>{if(excluded.has(norm(rowPacking(row))))row.remove()});
}
function dependantsOf(packing,targetRow){
  const wanted=norm(packing),uses=[];
  document.querySelectorAll('#rateBody tr[data-udaan-row]').forEach(row=>{
    if(row===targetRow)return;
    const select=row.querySelector('[data-udaan-f="master"]');
    if(select&&norm(select.value)===wanted)uses.push(rowPacking(row)||'another packing');
  });
  return uses;
}
async function cleanupExcludedRates(){
  if(selectedCity()!=='Udaan'||!selectedId())return;
  const key=selectedKey(),id=selectedId();
  try{
    const session=await requireAdmin();
    const{data,error}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(error)throw error;
    if(key!==selectedKey())return;
    const value=data?.value||{},meta=clone(value.meta||{}),state=clone(meta[key]||{}),list=Array.isArray(state.excludedPackings)?state.excludedPackings:[];
    const excluded=new Set(list.map(norm).filter(Boolean));if(!excluded.size){writeLocal({...value,meta});return}
    const rows=state.rows&&typeof state.rows==='object'?clone(state.rows):{};
    Object.keys(rows).forEach(name=>{if(excluded.has(norm(name)))delete rows[name]});state.rows=rows;state.excludedPackings=[...new Set(list.map(x=>String(x).trim()).filter(Boolean))];meta[key]=state;
    const next={...value,meta,captured_at:new Date().toISOString()};
    const saved=await supabase.from('admin_state').upsert({key:CLOUDKEY,value:next,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();if(saved.error)throw saved.error;
    const names=state.excludedPackings;
    if(names.length){const del=await supabase.from('rates').delete().eq('city','Udaan').eq('product_id',id).in('packing',names);if(del.error)throw del.error}
    writeLocal(next);hideExcludedRows();
  }catch(error){console.error('Udaan excluded packing cleanup failed',error)}
}
function scheduleCleanup(){cleanupTimers.forEach(clearTimeout);cleanupTimers=[250,900,2200].map(ms=>setTimeout(()=>void cleanupExcludedRates(),ms))}
async function deletePacking(button){
  if(busy||selectedCity()!=='Udaan')return;
  const row=button.closest('tr[data-udaan-row]'),packing=rowPacking(row),id=selectedId(),key=selectedKey();
  if(!row||!packing||!id)return;
  const uses=dependantsOf(packing,row);if(uses.length){toast(`Cannot delete ${packing}. Used as MASTER by ${uses.join(', ')}.`);return}
  if(!confirm(`Delete ${packing} from this Udaan product? It will stay deleted even though Ahmedabad has the same packing.`))return;
  busy=true;button.disabled=true;
  try{
    await saveState(state=>{
      const list=Array.isArray(state.excludedPackings)?state.excludedPackings:[];
      if(!list.some(x=>norm(x)===norm(packing)))list.push(packing);
      state.excludedPackings=list;
      if(state.rows&&typeof state.rows==='object')delete state.rows[packing];
    });
    if(key!==selectedKey())return;
    const{error}=await supabase.from('rates').delete().eq('city','Udaan').eq('product_id',id).eq('packing',packing);if(error)throw error;
    row.remove();toast(`✅ ${packing} REMOVED FROM UDAAN`);scheduleCleanup();
  }catch(error){toast('Packing not removed: '+(error.message||error));button.disabled=false}
  finally{busy=false}
}
async function refreshCloud(){
  if(selectedCity()!=='Udaan')return;
  try{const{data,error}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(!error&&data?.value)writeLocal(data.value);hideExcludedRows()}catch{}
}

document.addEventListener('click',event=>{
  if(selectedCity()==='Udaan'){
    const del=event.target.closest('[data-udaan-delete]');
    if(del){event.preventDefault();event.stopImmediatePropagation();void deletePacking(del);return}
    if(event.target.closest('#saveAll')){scheduleCleanup();return}
  }
  if(event.target.closest('.productBtn')||event.target.closest('.city'))setTimeout(()=>void refreshCloud(),500);
},true);

const body=$('rateBody');
if(body){new MutationObserver(()=>hideExcludedRows()).observe(body,{childList:true,subtree:true});}
setTimeout(()=>void refreshCloud(),900);
setTimeout(hideExcludedRows,1600);
