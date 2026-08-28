import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const area = document.getElementById('productArea');
if (area) {
  const card = area.closest('.card');
  const title = card?.querySelector('.title');
  const style = document.createElement('style');
  style.textContent = `
    .productManageBar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:-3px 0 10px}
    .productManageBar button{padding:7px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;font-size:9px;font-weight:950;cursor:pointer;box-shadow:0 3px 0 #d5dbe2}
    .productManageBar .pmAdd{background:#087f70;color:#fff;border-color:#087f70;box-shadow:0 3px 0 #045d52}
    .productManageBar .pmDelete{background:#fff1f0;color:#b42318;border-color:#f1b8b2;box-shadow:0 3px 0 #e7b0aa}
    .pmModal{position:fixed;inset:0;z-index:10050;background:#101827aa;display:grid;place-items:center;padding:18px}
    .pmBox{width:min(430px,100%);background:#fff;border-radius:15px;padding:17px;box-shadow:0 25px 70px #0005}
    .pmBox h3{margin:0 0 11px;font-size:16px}.pmGrid{display:grid;gap:9px}.pmGrid label{font-size:9px;font-weight:950}.pmGrid input{width:100%;margin-top:4px}.pmActions{display:flex;gap:7px;justify-content:flex-end;margin-top:12px}
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'productManageBar';
  bar.innerHTML = '<button class="pmAdd" id="pmAdd">＋ ADD PRODUCT</button><button id="pmEdit">✏️ EDIT PRODUCT</button><button class="pmDelete" id="pmDelete">🗑 DELETE PRODUCT</button>';
  title?.insertAdjacentElement('afterend', bar);

  function selectedId(){ return area.querySelector('.productBtn.active')?.dataset.product || ''; }
  function cleanCode(v){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,''); }
  async function requireAdmin(){
    const {data:{session}} = await supabase.auth.getSession();
    if(!session) return false;
    const {data:p} = await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();
    return !!(p && p.role === 'admin' && p.active);
  }
  function openEditor(mode, p={}){
    document.getElementById('pmModal')?.remove();
    const modal=document.createElement('div');
    modal.id='pmModal'; modal.className='pmModal';
    modal.innerHTML=`<div class="pmBox"><h3>${mode==='add'?'ADD PRODUCT':'EDIT PRODUCT'}</h3><div class="pmGrid"><label>PRODUCT NAME<input id="pmName" value="${String(p.name||'').replace(/"/g,'&quot;')}" placeholder="Example: Rice Bran"></label><label>PRODUCT CODE<input id="pmCode" value="${String(p.code||'').replace(/"/g,'&quot;')}" placeholder="Example: ricebran"></label><label>SORT ORDER<input id="pmSort" type="number" min="0" value="${Number(p.sort_order??0)}"></label></div><div class="pmActions"><button class="btn light" id="pmCancel">CANCEL</button><button class="btn green" id="pmSave">SAVE PRODUCT</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#pmCancel').onclick=()=>modal.remove();
    modal.querySelector('#pmSave').onclick=async()=>{
      if(!await requireAdmin()){alert('Admin access required.');return;}
      const name=modal.querySelector('#pmName').value.trim();
      const code=cleanCode(modal.querySelector('#pmCode').value);
      const sort_order=Number(modal.querySelector('#pmSort').value||0);
      if(!name||!code){alert('Product name and code required.');return;}
      const payload={name,code,sort_order,active:true};
      const q=mode==='add'?supabase.from('products').insert(payload):supabase.from('products').update(payload).eq('id',p.id);
      const {error}=await q;
      if(error){alert(error.message);return;}
      modal.remove(); location.reload();
    };
  }

  document.getElementById('pmAdd').onclick=async()=>{
    if(!await requireAdmin()){alert('Admin access required.');return;}
    const {data}=await supabase.from('products').select('sort_order').order('sort_order',{ascending:false}).limit(1);
    openEditor('add',{sort_order:(Number(data?.[0]?.sort_order)||0)+1});
  };
  document.getElementById('pmEdit').onclick=async()=>{
    if(!await requireAdmin()){alert('Admin access required.');return;}
    const id=selectedId(); if(!id){alert('Select a product first.');return;}
    const {data,error}=await supabase.from('products').select('id,code,name,sort_order').eq('id',id).single();
    if(error){alert(error.message);return;} openEditor('edit',data);
  };
  document.getElementById('pmDelete').onclick=async()=>{
    if(!await requireAdmin()){alert('Admin access required.');return;}
    const id=selectedId(); if(!id){alert('Select a product first.');return;}
    const btn=area.querySelector('.productBtn.active');
    if(!confirm(`Remove ${btn?.textContent||'this product'} from active products? Existing rates will be preserved.`))return;
    const {error}=await supabase.from('products').update({active:false}).eq('id',id);
    if(error){alert(error.message);return;} location.reload();
  };
}
