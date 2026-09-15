import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { resolveLooseRate, canReferenceLooseRate } from './loose-rate-reference.js?v=20260915-loose-control-v2';

const SUPABASE_URL='https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});
const CLOUDKEY='admin_formula_state_v1',META='VISHWAS_RATE_ADMIN_META_V3';
const $=id=>document.getElementById(id);
let saving=false,products=[],cloudValue={},meta={},draft=null,timer=null;

const city=()=>document.querySelector('#cityArea .city.active')?.dataset.city||'';
const productId=()=>document.querySelector('#productArea .productBtn.active')?.dataset.product||'';
const key=()=>productId()?city()+'|'+productId():'';
function clone(v){return JSON.parse(JSON.stringify(v??{}))}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.style.display='block';clearTimeout(window.__looseRefToast);window.__looseRefToast=setTimeout(()=>el.style.display='none',2200)}
function currentState(){return meta[key()]||{}}
function candidates(sourceCity){const targetKey=key();return products.filter(p=>p.active!==false&&p.city===sourceCity&&canReferenceLooseRate(meta,targetKey,p.city+'|'+p.id,products))}
function saveLocal(next){meta=next.meta||meta;cloudValue=next;localStorage.setItem(META,JSON.stringify(meta));localStorage.setItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1',JSON.stringify(next));localStorage.setItem('VRCL_ADMIN_STATE_UPDATED_AT',new Date().toISOString())}

async function requireAdmin(){
  const{data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Admin session expired. Please login again.');
  const{data:profile,error}=await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();
  if(error||!profile||profile.role!=='admin'||!profile.active)throw new Error('Active admin login required.');
  return session;
}
async function persistState(mutator){
  const session=await requireAdmin();
  const{data,error}=await supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle();if(error)throw error;
  const value=data?.value||{},nextMeta=clone(value.meta||{}),targetKey=key(),state=clone(nextMeta[targetKey]||{});
  mutator(state,nextMeta);nextMeta[targetKey]=state;
  const next={...value,meta:nextMeta,captured_at:new Date().toISOString()};
  const saved=await supabase.from('admin_state').upsert({key:CLOUDKEY,value:next,updated_by:session.user.id,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();
  if(saved.error)throw saved.error;if(saved.data?.key!==CLOUDKEY)throw new Error('Reference settings could not be saved.');
  saveLocal(next);return state;
}

function render(){
  if(city()==='Udaan')return;
  const targetKey=key();if(!targetKey)return;
  const state=currentState(),locked=state.looseReferenceLocked===true,activeDraft=draft?.key===targetKey?draft:null,ref=activeDraft||state.looseReference;
  const lock=$('looseRefLock');if(lock){lock.disabled=saving;lock.textContent=locked?'🔒 REFERENCE LOCKED':'🔓 REFERENCE LOCK';lock.classList.toggle('on',locked);lock.setAttribute('aria-pressed',String(locked));lock.title=locked?'Unlock to edit loose reference':'Lock loose reference editing'}
  if($('looseRefMode')){$('looseRefMode').value=ref?'reference':'manual';$('looseRefMode').disabled=locked||saving}
  if($('looseRefCityField'))$('looseRefCityField').hidden=!ref;
  if($('looseRefProductField'))$('looseRefProductField').hidden=!ref;
  if($('looseRefOpen')){$('looseRefOpen').hidden=!state.looseReference||!!activeDraft;$('looseRefOpen').disabled=!state.looseReference}
  if(ref){
    const cities=['Rajkot','Ahmedabad','Udaan'];
    if($('looseRefCity')){$('looseRefCity').innerHTML=cities.map(c=>`<option value="${c}"${candidates(c).length?'':' disabled'}>${c}</option>`).join('');$('looseRefCity').value=ref.city||cities.find(c=>candidates(c).length)||'Rajkot';$('looseRefCity').disabled=locked||saving}
    const sourceCity=$('looseRefCity')?.value||ref.city;
    const list=candidates(sourceCity);
    if($('looseRefProduct')){$('looseRefProduct').innerHTML=(activeDraft?'<option value="">Select product…</option>':'')+list.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');if(!activeDraft&&state.looseReference)$('looseRefProduct').value=state.looseReference.productId||'';$('looseRefProduct').disabled=locked||saving}
  }
  const resolved=state.looseReference?resolveLooseRate(meta,targetKey,products):null;
  if($('looseRate')){if(state.looseReference&&!resolved?.error)$('looseRate').value=resolved.value;$('looseRate').disabled=!!state.looseReference}
  if($('looseRefStatus')){$('looseRefStatus').textContent=activeDraft?'Select source city and product.':state.looseReference?(resolved?.error||`${state.looseReference.city} / ${(products.find(p=>p.city===state.looseReference.city&&p.id===state.looseReference.productId)?.name)||'Source'} → Loose ₹ ${Number(resolved?.value||0).toFixed(2)}`):'';$('looseRefStatus').classList.toggle('refError',!!resolved?.error)}
}

async function loadContext(){
  if(city()==='Udaan')return;
  try{
    const [{data:p,error:pe},{data:c,error:ce}]=await Promise.all([
      supabase.from('products').select('id,code,name,city,active,sort_order').eq('active',true).order('sort_order'),
      supabase.from('admin_state').select('value').eq('key',CLOUDKEY).maybeSingle()
    ]);if(pe||ce)return;products=p||[];cloudValue=c?.value||{};meta=clone(cloudValue.meta||{});saveLocal({...cloudValue,meta});render();
  }catch{}
}
function schedule(delay=250){clearTimeout(timer);timer=setTimeout(()=>void loadContext(),delay)}

async function toggleLock(){
  if(saving||city()==='Udaan'||!key())return;saving=true;render();
  try{const state=await persistState(s=>{s.looseReferenceLocked=s.looseReferenceLocked!==true});draft=null;toast(state.looseReferenceLocked?'🔒 LOOSE REFERENCE LOCKED':'🔓 LOOSE REFERENCE UNLOCKED')}
  catch(error){toast('Reference lock not saved: '+(error.message||error))}
  finally{saving=false;render()}
}
async function setManual(){
  if(saving)return;saving=true;render();
  try{await persistState((s,nextMeta)=>{const before=resolveLooseRate(nextMeta,key(),products);if(!before.error)s.looseRate=String(before.value);delete s.looseReference});draft=null;toast('✅ MANUAL LOOSE RATE ENABLED');setTimeout(()=>location.reload(),180)}
  catch(error){toast('Reference not saved: '+(error.message||error))}
  finally{saving=false;render()}
}
async function saveReference(source){
  if(saving||!source)return;saving=true;render();
  try{await persistState(s=>{s.looseReference={city:source.city,productId:source.id}});draft=null;toast('✅ LOOSE REFERENCE SAVED');setTimeout(()=>location.reload(),180)}
  catch(error){toast('Reference not saved: '+(error.message||error))}
  finally{saving=false;render()}
}

document.addEventListener('click',event=>{
  if(city()==='Udaan')return;
  if(event.target.closest('#looseRefLock')){event.preventDefault();event.stopImmediatePropagation();void toggleLock();return}
  if(event.target.closest('#looseRefOpen')){event.preventDefault();event.stopImmediatePropagation();const ref=currentState().looseReference;if(!ref)return;document.querySelector(`#cityArea [data-city="${ref.city}"]`)?.click();setTimeout(()=>document.querySelector(`#productArea [data-product="${ref.productId}"]`)?.click(),500);return}
  if(event.target.closest('.productBtn')||event.target.closest('.city')){draft=null;schedule(500)}
},true);
document.addEventListener('change',event=>{
  if(city()==='Udaan')return;
  const target=event.target;
  if(target===$('looseRefMode')){event.preventDefault();event.stopImmediatePropagation();if(currentState().looseReferenceLocked===true){render();return}if(target.value==='manual'){void setManual();return}const preferred=products.some(p=>p.city==='Rajkot'&&canReferenceLooseRate(meta,key(),'Rajkot|'+p.id,products))?'Rajkot':['Ahmedabad','Udaan','Rajkot'].find(c=>candidates(c).length)||'Rajkot';draft={key:key(),city:preferred};render();return}
  if(target===$('looseRefCity')){event.preventDefault();event.stopImmediatePropagation();if(currentState().looseReferenceLocked===true)return;draft={key:key(),city:target.value};render();return}
  if(target===$('looseRefProduct')){event.preventDefault();event.stopImmediatePropagation();if(currentState().looseReferenceLocked===true)return;const source=candidates($('looseRefCity').value).find(p=>p.id===target.value);if(source)void saveReference(source)}
},true);
setTimeout(()=>{const b=$('looseRefLock');if(b)b.onclick=null;render()},0);
schedule(600);setTimeout(()=>schedule(0),1600);
