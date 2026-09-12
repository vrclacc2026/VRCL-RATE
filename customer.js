import{createClient}from'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import{SUPABASE_URL,SUPABASE_ANON_KEY}from'./supabase-config.js?v=20260912-rate-tools';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-customer-auth'}}),$=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CITIES=['Rajkot','Ahmedabad','Udaan'];
let profile=null,currentCity='',refreshBusy=false,nextRefreshAt=Date.now()+300000;
const colors={palm:'#6d43c1',visvita:'#b71c1c',sunflower:'#dc8a00',groundnut:'#ef6c00',cotton:'#1167c7',mustard:'#0b6b43',soya:'#d32f2f'};

try{if(window.parent!==window)window.parent.postMessage({type:'vrcl-runtime',page:'customer',ok:true,ts:Date.now()},location.origin)}catch{}
document.querySelectorAll('[data-eye]').forEach(button=>button.onclick=()=>{const input=$(button.dataset.eye);input.type=input.type==='password'?'text':'password';button.textContent=input.type==='password'?'👁':'🙈'});
function clock(){const date=new Date(),hour=date.getHours();$('hh').textContent=String(hour%12||12).padStart(2,'0');$('mm').textContent=String(date.getMinutes()).padStart(2,'0');$('ss').textContent=String(date.getSeconds()).padStart(2,'0');$('ampm').textContent=hour>=12?'PM':'AM';$('dateLine').textContent=date.toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}
clock();setInterval(clock,1000);

document.addEventListener('contextmenu',event=>{if(!event.target.closest('input,textarea'))event.preventDefault()});
document.addEventListener('dragstart',event=>{if(event.target.matches('img'))event.preventDefault()});
document.addEventListener('copy',event=>{if(!event.target.closest('input,textarea'))event.preventDefault()});
document.addEventListener('cut',event=>{if(!event.target.closest('input,textarea'))event.preventDefault()});
document.addEventListener('selectstart',event=>{if(!event.target.closest('input,textarea'))event.preventDefault()});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['c','s','p','u'].includes(String(event.key).toLowerCase())&&!event.target.closest('input,textarea'))event.preventDefault()});
function setPrivacyShield(active){document.body.classList.toggle('privacyShield',Boolean(active&&profile))}
window.addEventListener('blur',()=>setPrivacyShield(true));window.addEventListener('focus',()=>setPrivacyShield(false));document.addEventListener('visibilitychange',()=>setPrivacyShield(document.hidden));document.addEventListener('keyup',event=>{if(event.key==='PrintScreen'){setPrivacyShield(true);setTimeout(()=>setPrivacyShield(false),1400)}});

const box=document.querySelector('.loginBox'),login=$('login');
login.addEventListener('pointermove',event=>{if(login.classList.contains('hidden'))return;const rect=box.getBoundingClientRect(),x=(event.clientX-(rect.left+rect.width/2))/rect.width,y=(event.clientY-(rect.top+rect.height/2))/rect.height;box.style.transform=`rotateX(${-y*7}deg) rotateY(${x*9}deg)`;login.style.setProperty('--mx',`${event.clientX/innerWidth*100}%`);login.style.setProperty('--my',`${event.clientY/innerHeight*100}%`)});
login.addEventListener('pointerleave',()=>box.style.transform='');

function permittedCities(value){const allowed=Array.isArray(value?.allowed_cities)?value.allowed_cities.filter(city=>CITIES.includes(city)):[];return allowed.length?CITIES.filter(city=>allowed.includes(city)):(CITIES.includes(value?.city)?[value.city]:[])}
function watermarks(name){$('wm').innerHTML=[[4,15],[34,12],[66,15],[11,43],[45,40],[78,45],[3,72],[35,69],[68,72]].map(([x,y])=>`<span style="left:${x}%;top:${y}%">${esc(name)}</span>`).join('')}
function updateCustomerIdentity(){
  if(!profile)return;
  $('pname').textContent=profile.display_name||profile.login_id||'Customer';
  $('pcity').textContent=currentCity||'';
  watermarks((profile.display_name||profile.login_id||'Customer')+' • '+(profile.login_id||'')+' • '+(currentCity||''));
}
function renderCityChooser(){
  const cities=permittedCities(profile);
  if(!cities.includes(currentCity))currentCity=cities.includes(profile?.city)?profile.city:cities[0]||'';
  $('cityChooser').innerHTML=cities.map(city=>`<button class="city ${city===currentCity?'active':''}" type="button" data-customer-city="${city}" aria-pressed="${city===currentCity}">${city.toUpperCase()}</button>`).join('');
  document.querySelectorAll('[data-customer-city]').forEach(button=>button.onclick=()=>selectCity(button.dataset.customerCity));
}
function rateCard(product,rates,index){
  const color=colors[product.code]||'#b71c1c',picture=product.ingredient_image_url?`<img src="${esc(product.ingredient_image_url)}" alt="${esc(product.name)} ingredient" loading="lazy" decoding="async">`:'<div class="noPhoto">INGREDIENT<br>PHOTO<br>NOT UPLOADED</div>';
  return `<article class="card" style="--pc:${color};--delay:${Math.min(index,12)*65}ms"><div class="cardGlow"></div><div class="cardHead"><div class="ingredient">${picture}</div><div><div class="rateName">${esc(product.name)}</div><div class="rateSub">LATEST PUBLISHED RATE</div></div></div><table><thead><tr><th>PACKING</th><th>RATE</th></tr></thead><tbody>${rates.map(rate=>`<tr><td>${esc(rate.packing)}</td><td>₹ ${Number(rate.rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`).join('')}</tbody></table><div class="terms"><strong>TERMS & CONDITIONS</strong>${esc(rates[0]?.narration||'Rates are subject to change. Confirm latest rate before order.')}</div></article>`
}
async function load(){
  if(!currentCity)throw new Error('No city permission is available.');
  $('grid').classList.add('citySwitching');
  const [{data:products,error:productError},{data:rates,error:rateError}]=await Promise.all([
    supabase.from('products').select('id,code,name,sort_order,ingredient_image_url,city').eq('city',currentCity).eq('active',true).order('sort_order'),
    supabase.from('rates').select('product_id,packing,rate,narration,sort_order,updated_at').eq('city',currentCity).order('sort_order')
  ]);
  if(productError)throw productError;if(rateError)throw rateError;
  const by={};(rates||[]).forEach(rate=>(by[rate.product_id]||(by[rate.product_id]=[])).push(rate));
  $('grid').innerHTML=(products||[]).map((product,index)=>rateCard(product,by[product.id]||[],index)).join('')||'<div class="noRates">No rates available for this city.</div>';
  requestAnimationFrame(()=>requestAnimationFrame(()=>$('grid').classList.remove('citySwitching')));
  const latest=(rates||[]).map(rate=>rate.updated_at).filter(Boolean).sort().at(-1);
  $('updated').textContent='LAST UPDATED: '+(latest?new Date(latest).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}):'—');
}
async function beat(){if(!profile||!currentCity)return;await supabase.from('user_activity').upsert({user_id:profile.id,city:currentCity,page:'customer',last_seen:new Date().toISOString()},{onConflict:'user_id'})}
async function refreshProfile(){
  if(!profile)return;
  const{data,error}=await supabase.from('profiles').select('id,display_name,login_id,role,city,allowed_cities,active').eq('id',profile.id).single();
  if(error||!data||!data.active||data.role!=='wholesaler')throw new Error('City permission is no longer active.');
  profile=data;renderCityChooser();updateCustomerIdentity();
}
async function refreshRates({permissions=false}={}){
  if(!profile||refreshBusy)return;
  refreshBusy=true;
  try{if(permissions)await refreshProfile();await load();await beat();nextRefreshAt=Date.now()+300000}
  catch(error){console.error('Rate refresh failed',error);$('grid').classList.remove('citySwitching');$('grid').innerHTML='<div class="noRates">Rates could not be refreshed. Please try again.</div>';nextRefreshAt=Date.now()+60000}
  finally{refreshBusy=false}
}
async function selectCity(next){
  if(refreshBusy||next===currentCity||!permittedCities(profile).includes(next))return;
  const previous=currentCity;currentCity=next;renderCityChooser();updateCustomerIdentity();refreshBusy=true;
  try{await load();await beat();nextRefreshAt=Date.now()+300000}
  catch(error){console.error('City switch failed',error);currentCity=previous;renderCityChooser();updateCustomerIdentity();$('grid').classList.remove('citySwitching')}
  finally{refreshBusy=false}
}
function refreshClock(){if(profile&&Date.now()>=nextRefreshAt)refreshRates({permissions:true})}
async function check(){
  const{data:{session}}=await supabase.auth.getSession();if(!session)return false;
  const{data:userProfile,error}=await supabase.from('profiles').select('id,display_name,login_id,role,city,allowed_cities,active').eq('id',session.user.id).single();
  if(error||!userProfile||!userProfile.active||userProfile.role!=='wholesaler'){$('loginMsg').textContent=userProfile?.role==='admin'?'Customer account required on this page.':'Login required.';return false}
  profile=userProfile;currentCity=permittedCities(profile).includes(profile.city)?profile.city:permittedCities(profile)[0]||'';
  $('login').classList.add('hidden');renderCityChooser();updateCustomerIdentity();await load();await beat();nextRefreshAt=Date.now()+300000;refreshClock();return true
}
$('loginBtn').onclick=async()=>{$('loginMsg').textContent='';const uid=$('uid').value.trim().toLowerCase();if(!uid||!$('pass').value){$('loginMsg').textContent='User ID and password required.';return}const{error}=await supabase.auth.signInWithPassword({email:uid+'@users.vrcl.in',password:$('pass').value});if(error){$('loginMsg').textContent='Invalid user ID or password.';return}if(!await check())$('loginMsg').textContent='Access denied.'};
$('pass').addEventListener('keydown',event=>{if(event.key==='Enter')$('loginBtn').click()});
$('power').onclick=async()=>{await supabase.auth.signOut({scope:'local'});location.reload()};
await check();refreshClock();setInterval(refreshClock,1000);setInterval(beat,60000);window.addEventListener('focus',()=>{beat();if(profile&&Date.now()>=nextRefreshAt)refreshRates({permissions:true})});
