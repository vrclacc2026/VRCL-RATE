const companyName='VISHWAS REFOILS & CONSUMER LIMITED';

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

function buildText(button){
  const card=button.closest('.card');
  if(!card)return'';
  const name=card.querySelector('.name')?.textContent?.trim()||'PRODUCT';
  const rows=[...card.querySelectorAll('tbody tr')].map(tr=>{
    const cells=tr.querySelectorAll('td');
    const packing=cells[0]?.textContent?.trim()||'';
    const rate=(cells[1]?.textContent||'').replace('₹','').trim();
    return packing?`${packing}  ${rate}`:'';
  }).filter(Boolean);
  const date=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  return ['JAY SIYARAM',`*${companyName}*`,date,'',`*${name}*`,...rows,'','TERMS & CONDITIONS','Rates are subject to change. Confirm latest rate before order.'].join('\n');
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-copy]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const text=buildText(button);
  if(!text)return;
  const old=button.textContent;
  button.disabled=true;
  const ok=await copyText(text);
  button.textContent=ok?'COPIED ✓':'COPY FAILED';
  setTimeout(()=>{button.textContent=old;button.disabled=false},1200);
},true);
