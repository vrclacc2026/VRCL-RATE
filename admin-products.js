import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js?v=20260912-rate-tools';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vrcl-admin-auth' }
});

const area = document.getElementById('productArea');
if (area && !document.querySelector('.productManageBar')) {
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
  bar.id = 'productManageBar';
  bar.className = 'productManageBar';
  bar.innerHTML = '<button class="pmAdd" id="pmAdd">＋ ADD PRODUCT</button><button id="pmEdit">✏️ EDIT PRODUCT</button><button class="pmDelete" id="pmDelete">🗑 DELETE PRODUCT</button>';
  title?.insertAdjacentElement('afterend', bar);

  function selectedId(){ return area.querySelector('.productBtn.active')?.dataset.product || ''; }
  function selectedCity(){ return document.querySelector('.city.active')?.dataset.city || 'Rajkot'; }
  function cleanCode(v){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,''); }
  function esc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function normalizePacking(v){ return String(v??'').trim().toLocaleUpperCase('en-IN'); }
  function readJson(key,fallback={}){ try{return JSON.parse(localStorage.getItem(key)||'')??fallback}catch{return fallback} }
  async function requireAdmin(){
    const {data:{session}} = await supabase.auth.getSession();
    if(!session) return false;
    const {data:p} = await supabase.from('profiles').select('role,active').eq('id',session.user.id).single();
    return !!(p && p.role === 'admin' && p.active);
  }

  // Safety net for the rate editor. The primary admin module owns the live `rows`
  // array and all SAVE ALL/input handlers. If another render step throws after the
  // rows were loaded, the tbody can stay empty even though Supabase data is intact.
  // In that one case, rebuild the same DOM controls from the saved rates + formula
  // metadata. Existing delegated input/change handlers continue updating the primary
  // editor state, so calculations and SAVE ALL remain handled by admin.html.
  async function recoverRateTable(){
    const body=document.getElementById('rateBody'),id=selectedId(),city=selectedCity();
    if(!body||!id)return;
    if(body.querySelector('[data-i]'))return;
    const marker=body.textContent.trim();
    if(marker && !/^(No packing yet|Select or add a product)/i.test(marker))return;
    const {data,error}=await supabase.from('rates').select('id,packing,rate,sort_order').eq('city',city).eq('product_id',id).order('sort_order');
    if(error||!data?.length)return;
    if(id!==selectedId()||city!==selectedCity()||body.querySelector('[data-i]'))return;

    const meta=readJson('VISHWAS_RATE_ADMIN_META_V3',{}),state=meta[city+'|'+id]||{},settings=state.rows||{};
    const rows=data.map((r,i)=>{const m=settings[r.packing]||{};return{id:r.id,packing:r.packing,oldRate:Number(r.rate)||0,master:m.master||'LOOSE OIL RATE',formula:m.formula||'MASTER*1',extra:m.extra??0,round:m.round??0,sort_order:r.sort_order??i};});
    const seen=new Set(rows.map(r=>normalizePacking(r.packing)));
    for(const [packing,m] of Object.entries(settings)){
      const key=normalizePacking(packing);if(!key||seen.has(key))continue;
      rows.push({id:null,packing,oldRate:0,master:m?.master||'LOOSE OIL RATE',formula:m?.formula||'MASTER*1',extra:m?.extra??0,round:m?.round??0,sort_order:rows.length+1});seen.add(key);
    }
    if(!rows.length)return;

    const locks=Object.assign({packing:false,master:false,old:true,formula:false,extra:false,round:false},readJson('VRCL_ADMIN_COLUMN_LOCKS',{}));
    const packingLinked=!!state.packingRateReference;
    body.innerHTML=rows.map((r,i)=>{
      const opts=rows.map((x,j)=>j!==i&&x.packing?`<option value="${esc(x.packing)}" ${r.master===x.packing?'selected':''}>${esc(x.packing)}</option>`:'').join('');
      const masterControl=packingLinked
        ? '<select class="sourceMaster" disabled title="Same packing from referenced product is MASTER"><option>REFERENCE / SAME PACKING</option></select>'
        : `<select data-i="${i}" data-f="master" ${locks.master?'disabled':''}><option value="LOOSE OIL RATE" ${r.master==='LOOSE OIL RATE'?'selected':''}>LOOSE OIL RATE</option>${opts}</select>`;
      const shownNew=Number(r.oldRate)||0;
      return `<tr><td><input class="packingField" data-i="${i}" data-f="packing" value="${esc(r.packing)}" ${locks.packing?'disabled':''}></td><td>${masterControl}</td><td><input class="oldRateField" value="${shownNew.toFixed(2)}" ${locks.old?'disabled':''} data-i="${i}" data-f="oldRate"></td><td><input data-i="${i}" data-f="formula" value="${esc(r.formula)}" placeholder="MASTER*1.365 or +5%" ${locks.formula?'disabled':''}></td><td><input type="text" inputmode="decimal" data-i="${i}" data-f="extra" value="${esc(r.extra)}" placeholder="+15 / *1.05 / +5%" ${locks.extra?'disabled':''}></td><td><input type="number" data-i="${i}" data-f="round" value="${esc(r.round)}" ${locks.round?'disabled':''}></td><td><input class="newRate" data-new="${i}" value="${shownNew.toFixed(2)}" disabled></td><td><button class="btn light" type="button" disabled title="Reload the page before deleting a recovered row">🗑️</button></td></tr>`;
    }).join('');
  }
  function scheduleRateRecovery(){ setTimeout(()=>void recoverRateTable(),350); setTimeout(()=>void recoverRateTable(),1200); }
  area.addEventListener('click',e=>{if(e.target.closest('[data-product]'))scheduleRateRecovery();});
  document.getElementById('cityArea')?.addEventListener('click',e=>{if(e.target.closest('[data-city]'))scheduleRateRecovery();});
  scheduleRateRecovery();

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
      const payload={name,code,sort_order,active:true,city:selectedCity()};
      const q=mode==='add'?supabase.from('products').insert(payload):supabase.from('products').update(payload).eq('id',p.id);
      const {error}=await q;
      if(error){alert(error.message);return;}
      modal.remove(); location.reload();
    };
  }

  document.getElementById('pmAdd').onclick=async()=>{
    if(!await requireAdmin()){alert('Admin access required.');return;}
    const {data}=await supabase.from('products').select('sort_order').eq('city',selectedCity()).order('sort_order',{ascending:false}).limit(1);
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