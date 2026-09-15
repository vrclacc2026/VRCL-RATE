import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});
const CLOUDKEY='admin_formula_state_v1',META='VISHWAS_RATE_ADMIN_META_V3';
let saving=false;

const $=id=>document.getElementById(id);
const city=()=>document.querySelector('#cityArea .city.active')?.dataset.city||'';
const productId=()=>document.querySelector('#productArea .productBtn.active')?.dataset.product||'';
const key=()=>productId()?city()+'|'+productId():'';
function clone(v){return JSON.parse(JSON.stringify(v??{}))}
function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.style.display='block';clearTimeout(window.__looseRefToast);window.__looseRefToast=setTimeout(()=>el.style.display='none',2200)}
function localMeta(){try{return JSON.parse(localStorage.getItem(META)||'{}')}catch{return{}}}
function state(){return localMeta()[key()]||{}}
function globalMasterLocked(){return localStorage.getItem('VRCL_MASTER_LOCK')==='1'}

function syncUi(){
  if(city()==='Udaan')return;
  const current=state(),locked=current.looseReferenceLocked===true,hasRef=!!current.looseReference;
  const button=$('looseRefLock');if(button){button.disabled=saving;button.textContent=locked?'🔒 REFERENCE LOCKED':'🔓 REFERENCE LOCK';button.classList.toggle('on',locked);button.setAttribute('aria-pressed',String(locked));button.title=locked?'Unlock to edit the loose rate reference':'Lock the loose rate reference'}
  const blocked=locked||globalMasterLocked()||saving;
  if($('looseRefMode'))$('looseRefMode').disabled=blocked;
  if($('looseRefCity'))$('looseRefCity').disabled=blocked;
  if($('looseRefProduct'))$('looseRefProduct').disabled=blocked;
  if($('looseRate'))$('looseRate').disabled=globalMasterLocked()||hasRef;
}

async function requireAdmin(){
  const{data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Admin session expired. Please login again.');
  const{data:profile,error}=await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();
  if(error||!profile||profile.role!=='admin'||!profile.active)throw new Error('Active admin login required.');
  return session;
}

async function toggleLooseReferenceLock(){
  if(saving||city()==='Udaan'||!key())return;
  saving=true;syncUi();
  try{
    const session=await requireAdmin();
    const{data,error}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(error)throw error;
    const value=data?.value||{},meta=clone(value.meta||{}),targetKey=key(),current=clone(meta[targetKey]||{});
    current.looseReferenceLocked=current.looseReferenceLocked!==true;
    meta[targetKey]=current;
    const next={...value,meta,captured_at:new Date().toISOString()};
    const saved=await supabase.from('admin_state').upsert({key:CLOUDKEY,value:next,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();
    if(saved.error)throw saved.error;if(saved.data?.key!==CLOUDKEY)throw new Error('Reference lock could not be saved.');
    localStorage.setItem(META,JSON.stringify(meta));
    localStorage.setItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1',JSON.stringify(next));
    localStorage.setItem('VRCL_ADMIN_STATE_UPDATED_AT',new Date().toISOString());
    toast(current.looseReferenceLocked?'🔒 LOOSE REFERENCE LOCKED':'🔓 LOOSE REFERENCE UNLOCKED');
    window.dispatchEvent(new CustomEvent('vrcl:admin-state-applied'));
  }catch(error){toast('Reference lock not saved: '+(error.message||error))}
  finally{saving=false;setTimeout(syncUi,0);setTimeout(syncUi,250)}
}

document.addEventListener('click',event=>{
  const button=event.target.closest('#looseRefLock');
  if(button&&city()!=='Udaan'){
    event.preventDefault();event.stopImmediatePropagation();void toggleLooseReferenceLock();return;
  }
  if(event.target.closest('.productBtn')||event.target.closest('.city'))setTimeout(syncUi,350);
},true);
window.addEventListener('vrcl:admin-state-applied',()=>setTimeout(syncUi,0));
setTimeout(syncUi,700);setTimeout(syncUi,1800);
