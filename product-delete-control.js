import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://rdmgzkxroydsuantzbwn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_hQTkAf0vHJsw618Y2wrCOw_R-c24HHQ';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'vrcl-admin-auth'}});

const area=document.getElementById('productArea');
const city=()=>document.querySelector('#cityArea .city.active')?.dataset.city||'Rajkot';
const selected=()=>area?.querySelector('.productBtn.active')||null;
const toast=message=>{const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.style.display='block';clearTimeout(window.__productDeleteToast);window.__productDeleteToast=setTimeout(()=>el.style.display='none',2400)};

async function requireAdmin(){
  const{data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error('Admin session expired. Please login again.');
  const{data,error}=await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();
  if(error||!data||data.role!=='admin'||!data.active)throw new Error('Active admin login required.');
}

async function removeSelectedProduct(){
  const button=selected();
  const id=button?.dataset.product||'';
  const productCity=city();
  const name=button?.querySelector('span')?.textContent?.trim()||button?.textContent?.trim()||'this product';
  if(!id)throw new Error('Select a product first.');
  if(!confirm(`Remove ${name} from ${productCity}? Existing rates/formulas will be preserved.`))return;
  await requireAdmin();
  const{data,error}=await supabase.from('products')
    .update({active:false,customer_visible:false})
    .eq('id',id)
    .eq('city',productCity)
    .select('id,active,customer_visible')
    .maybeSingle();
  if(error)throw error;
  if(!data||data.id!==id||data.active!==false)throw new Error('Product removal was not saved. Please try again.');

  sessionStorage.removeItem('VRCL_RESTORED_PRODUCT');
  sessionStorage.removeItem('VRCL_ADMIN_SELECTION_GUARD');
  try{
    const meta=JSON.parse(localStorage.getItem('VISHWAS_RATE_ADMIN_META_V3')||'{}');
    if(meta&&typeof meta==='object'){
      delete meta[productCity+'|'+id];
      localStorage.setItem('VISHWAS_RATE_ADMIN_META_V3',JSON.stringify(meta));
    }
  }catch{}
  toast('✅ PRODUCT REMOVED');
  setTimeout(()=>location.reload(),180);
}

document.addEventListener('click',event=>{
  const button=event.target.closest('#pmDelete');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void removeSelectedProduct().catch(error=>toast('Product not removed: '+(error.message||error)));
},true);
