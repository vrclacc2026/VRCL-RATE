export const CITY = 'Ahmedabad';

export function packingKey(value) {
  return String(value ?? '').toUpperCase().replace(/(\d)([A-Z])/g,'$1 $2')
    .replace(/NEW/g,'N').replace(/OLD/g,'S').replace(/LITRES?|LITERS?|LTRS?\b/g,'LTR')
    .replace(/\bL\b/g,'LTR').replace(/KGS?\b/g,'KG').replace(/POUCHES/g,'POUCH')
    .replace(/[.\-_]/g,' ').replace(/\s+/g,' ').trim();
}
function family(p) {
  const name=p.name.toUpperCase();
  if (/PALM/.test(name)) return 0;
  if (/VIS[HV]*ITA/.test(name)) return /PLUS/.test(name)?3:1;
  if (/SOYA|SOYBEAN/.test(name)) return 2;
  if (/GROUNDNUT/.test(name)) return 4;
  if (/COTTON/.test(name)) return 5;
  return 6;
}
export function formatRate(value, packing) {
  if(value === null || value === undefined) return '—';
  const number=Number(value);
  if(!Number.isFinite(number) || String(value).trim()==='') throw new Error('Invalid saved rate');
  return number.toFixed(/TIN$/.test(packing) && Number.isInteger(number)?0:2);
}
// Rebuild from the latest Ahmedabad snapshot; no fixed products or packing columns.
export function buildPoster(products,rates) {
  const selected=products.filter(p=>p.city===CITY && p.active!==false)
    .sort((a,b)=>family(a)-family(b) || (a.sort_order??0)-(b.sort_order??0) || a.name.localeCompare(b.name));
  const ids=new Set(selected.map(p=>p.id)), by=new Map(), packings=new Map();
  const saved=rates.filter(r=>r.city===CITY && ids.has(r.product_id));
  for(const r of saved) {
    // Keep names exactly as saved: jar/bucket and N/S Tin are separate packings.
    const key=String(r.packing??'').trim();
    if(!key)throw new Error('Saved packing name is missing.');
    const order=Number.isFinite(Number(r.sort_order))?Number(r.sort_order):Number.MAX_SAFE_INTEGER;
    packings.set(key,Math.min(packings.get(key)??Infinity,order));
    formatRate(r.rate,packingKey(key));
    if(r.rate===null || r.rate===undefined)throw new Error('Saved rate is missing for '+key);
    const row=by.get(r.product_id)||new Map();
    if(row.has(key) && Number(row.get(key))!==Number(r.rate))throw new Error('Conflicting saved rates: '+key+'. Please check Rate Admin.');
    row.set(key,r.rate);by.set(r.product_id,row);
  }
  const columns=[...packings.keys()].sort((a,b)=>packings.get(a)-packings.get(b));
  const rows=selected.map(p=>({
    id:p.id,name:p.name,values:columns.map(c=>formatRate(by.get(p.id)?.get(c),packingKey(c)))
  }));
  return {columns,rows,latest:saved.map(r=>r.updated_at).filter(Boolean).sort().at(-1)};
}
