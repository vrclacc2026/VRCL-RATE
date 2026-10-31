import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './supabase-config.js';
import {CITY,buildPoster} from './poster-data.js?v=20261030-2';
import {renderPoster} from './poster-render.js?v=20261030-2';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});
const $=id=>document.getElementById(id);
let active=false,channel=null,pending=null,queued=false,exporting=false,lastModel=null,refreshTimer,accessVersion=0;
const art=new Image();art.src='./assets/poster/ahmedabad-template.png';
const artReady=art.decode();artReady.catch(()=>{});
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function lock(){accessVersion++;active=false;lastModel=null;$('login').hidden=false;$('preview').hidden=true;$('rateDetails').hidden=true;$('download').disabled=true;$('refresh').disabled=true;if(channel){supabase.removeChannel(channel);channel=null;}}
async function requireAdmin(){
  const version=accessVersion;
  const {data:{session},error}=await supabase.auth.getSession();if(error)throw error;
  if(!session){lock();throw new Error('Please login with your admin account.');}
  const result=await supabase.from('profiles').select('role,active').eq('id',session.user.id).single().abortSignal(AbortSignal.timeout(15000));
  if(result.error)throw result.error;
  if(version!==accessVersion)throw new Error('Session changed. Please login again.');
  if(result.data?.role!=='admin'||!result.data.active){lock();throw new Error('Active admin account required.');}
  active=true;$('login').hidden=true;$('refresh').disabled=false;
}
function display(model){
  renderPoster($('poster'),art,model);lastModel=model;$('preview').hidden=false;$('rateDetails').hidden=false;
  const table=document.createElement('table'),head=table.createTHead().insertRow();
  for(const label of ['PRODUCT',...model.columns]){const cell=document.createElement('th');cell.textContent=label;head.append(cell);}
  const body=table.createTBody();for(const row of model.rows){const tr=body.insertRow();const name=document.createElement('th');name.scope='row';name.textContent=row.name;tr.append(name);for(const value of row.values)tr.insertCell().textContent=value;}
  $('rateTable').replaceChildren(table);
}
async function fetchSnapshot(){
  await requireAdmin();
  const version=accessVersion;
  const [ps,rs]=await Promise.all([
    supabase.from('products').select('id,code,name,city,sort_order,active').eq('city',CITY).eq('active',true).order('sort_order').limit(1000).abortSignal(AbortSignal.timeout(15000)),
    supabase.from('rates').select('product_id,city,packing,rate,sort_order,updated_at').eq('city',CITY).order('sort_order').limit(1000).abortSignal(AbortSignal.timeout(15000))
  ]);
  if(ps.error)throw ps.error;if(rs.error)throw rs.error;
  if(!active||version!==accessVersion)throw new Error('Session changed. Please login again.');
  if(ps.data.length>=1000||rs.data.length>=1000)throw new Error('Rate list is too large. Download paused to avoid missing rows.');
  const model=buildPoster(ps.data,rs.data);await artReady;
  if(!active||version!==accessVersion)throw new Error('Session changed. Please login again.');
  display(model);
  const stamp=model.latest?new Date(model.latest).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
  status('Rates verified · Last saved '+stamp+' IST · Auto refresh on');
  return model;
}
function refresh(){
  if(pending){queued=true;return pending;}
  $('download').disabled=true;
  pending=(async()=>{
    try{do{queued=false;await fetchSnapshot();}while(queued&&active);return true;}
    catch(error){status('Rates could not be verified. Download paused. '+(error.message||'Please retry.'),true);return false;}
    finally{pending=null;$('download').disabled=!active||!lastModel||$('status').classList.contains('error')||exporting;}
  })();return pending;
}
function schedule(){if(!active)return;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),350);}
function watch(){
  if(channel)return;
  channel=supabase.channel('ahmedabad-poster')
    .on('postgres_changes',{event:'*',schema:'public',table:'rates'},schedule)
    .on('postgres_changes',{event:'*',schema:'public',table:'products'},schedule)
    .subscribe();
}
$('refresh').onclick=()=>void refresh();
$('loginForm').onsubmit=async event=>{
  event.preventDefault();$('loginBtn').disabled=true;$('loginMsg').textContent='Signing in…';
  try{const {error}=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;
    if(await refresh()){$('password').value='';$('loginMsg').textContent='';watch();}else $('loginMsg').textContent=$('status').textContent;
  }catch(error){$('loginMsg').textContent=error.message||'Login failed. Please retry.';}finally{$('loginBtn').disabled=false;}
};
$('download').onclick=async()=>{
  if(exporting)return;exporting=true;$('download').disabled=true;$('download').textContent='Verifying rates…';
  try{
    if(!await refresh())return;
    // Freeze the verified canvas before a realtime refresh can redraw it.
    const copy=document.createElement('canvas');copy.width=$('poster').width;copy.height=$('poster').height;copy.getContext('2d').drawImage($('poster'),0,0);
    const blob=await new Promise((resolve,reject)=>copy.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed.')),'image/png'));
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
    const day=new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'}).replaceAll('/','-');
    a.download='Vishwas-Ahmedabad-'+day+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){status('Download failed. '+error.message,true);}finally{exporting=false;$('download').textContent='Download HD PNG';$('download').disabled=!active||$('status').classList.contains('error');}
};
window.addEventListener('online',schedule);window.addEventListener('focus',schedule);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
window.addEventListener('storage',event=>{if(event.key==='vrcl-admin-auth'&&!event.newValue)lock();else if(event.key?.startsWith('VISHWAS_RATE_ADMIN_META'))schedule();});
supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')lock();});
setInterval(()=>{if(active&&!document.hidden)void refresh();},15000);
if(await refresh())watch();
