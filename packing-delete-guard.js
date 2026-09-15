const toast=message=>{const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.style.display='block';clearTimeout(window.__packingGuardToast);window.__packingGuardToast=setTimeout(()=>el.style.display='none',2600)};

function rowInfo(button){
  const row=button.closest('tr');
  if(!row)return null;
  const packing=row.querySelector('[data-f="packing"],.packingField')?.value?.trim()||'';
  return{row,packing};
}

function findDependants(packing,row){
  if(!packing)return[];
  return[...document.querySelectorAll('#rateBody tr')].filter(other=>{
    if(other===row)return false;
    const master=other.querySelector('[data-f="master"],select[data-udaan-f="master"]')?.value?.trim()||'';
    return master===packing;
  }).map(other=>other.querySelector('[data-f="packing"],.packingField')?.value?.trim()||'another packing');
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-del],[data-fb-del],[data-udaan-delete]');
  if(!button)return;
  const info=rowInfo(button);if(!info)return;
  const deps=findDependants(info.packing,info.row);
  if(!deps.length)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  toast(`Cannot delete ${info.packing}: used as MASTER by ${deps.join(', ')}`);
},true);
