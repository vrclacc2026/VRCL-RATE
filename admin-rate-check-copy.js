import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});
const companyName='VISHWAS REFOILS & CONSUMER LIMITED';

// The decorative card pseudo-element sits over the top-right corner where COPY lives.
// It must never receive pointer events. Keep the actual header/button above decoration.
const hitStyle=document.createElement('style');
hitStyle.id='vrclRateCheckCopyHitFix';
hitStyle.textContent=`
  .card::before,.card::after{pointer-events:none!important}
  .card .head{position:relative!important;z-index:3!important}
  .card .copy{position:relative!important;z-index:5!important;pointer-events:auto!important;cursor:pointer!important;user-select:none}
  .card .copy:disabled{cursor:wait!important;opacity:.75}
`;
document.head.appendChild(hitStyle);

function legacyCopy(text){
  const ta=document.createElement('textarea');
  ta.value=text;
  ta.setAttribute('readonly','');
  ta.style.position='fixed';
  ta.style.left='-9999px';
  ta.style.top='0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok=false;
  try{ok=document.execCommand('copy')}catch{}
  ta.remove();
  return ok;
}

async function copyText(text){
  if(navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(text);return true}catch{}
  }
  return legacyCopy(text);
}

async function buildText(button){
  const card=button.closest('.card');
  if(!card)return'';
  const productId=button.dataset.copy||'';
  const city=document.querySelector('.city.active')?.dataset.c||'Rajkot';
  const name=card.querySelector('.name')?.textContent?.trim()||'PRODUCT';
  let rows=[];
  let narration='Rates are subject to change. Confirm latest rate before order.';
  if(productId){
    const{data,error}=await supabase.from('rates').select('packing,rate,narration,sort_order').eq('city',city).eq('product_id',productId).order('sort_order');
    if(!error&&data?.length){rows=data;narration=data[0]?.narration?.trim()||narration}
  }
  if(!rows.length){
    rows=[...card.querySelectorAll('tbody tr')].map((tr,index)=>{const cells=tr.querySelectorAll('td');return{packing:cells[0]?.textContent?.trim()||'',rate:(cells[1]?.textContent||'').replace('₹','').trim(),sort_order:index+1}}).filter(r=>r.packing);
  }
  const date=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  return ['JAY SIYARAM',`*${companyName}*`,date,'',`*${name}*`,...rows.map(r=>`${r.packing}  ${r.rate}`),'','TERMS & CONDITIONS',narration].join('\n');
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-copy]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const old=button.textContent;
  button.disabled=true;
  try{
    const text=await buildText(button);
    const ok=!!text&&await copyText(text);
    button.textContent=ok?'COPIED ✓':'COPY FAILED';
  }catch(error){
    console.error('Rate check copy failed',error);
    button.textContent='COPY FAILED';
  }
  setTimeout(()=>{button.textContent=old;button.disabled=false},1200);
},true);
