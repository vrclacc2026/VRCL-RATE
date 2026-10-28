// Read-only FINAL-rate CSV feed. The scoped token is stored only in the owner's Sheet.
const TOKEN_SHA256 = '22e5335f7d32e981c10846cdcde6038faa24d005d67489b4c642261917ce0fbc';
const HEADERS = ['Date (IST)','Time (IST)','City','Product','Loose / 10 KG (Rs)','Packing','Final rate (Rs)','Terms / narration','Publish ID','History ID','Status'];
function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let text = String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\u0000/g, '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function csvLine(values) { return values.map(csvCell).join(','); }
function istParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid publication timestamp');
  return [
    new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).format(date),
    new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)
  ];
}
function buildCsv(history, now) {
  const finals=history.filter(item=>item.snapshot?.publication_status==='final' && item.snapshot?.publication_version===1);
  const stamp = istParts(now).join(' ');
  const lines = [
    csvLine(['FEED OK',stamp,finals.length,'Confirmed final publications only','','','','','','','']),
    csvLine(HEADERS)
  ];
  let rows = 0;
  for (const item of finals) {
    const snapshot = item.snapshot;
    const [date,time] = istParts(item.changed_at);
    if (!Array.isArray(snapshot.rates) || !snapshot.rates.length) throw new Error('Incomplete final publication');
    for (const rate of snapshot.rates) {
      const value = Number(rate.rate);
      if (!Number.isFinite(value) || rate.rate == null) throw new Error('Invalid final rate');
      const loose = snapshot.loose_rate == null ? '' : Number(snapshot.loose_rate);
      lines.push(csvLine([date,time,item.city,snapshot.product_name || '',Number.isFinite(loose)?loose:'',
        rate.packing,value,snapshot.narration || '',snapshot.publish_id || '',item.id,'FINAL']));
      rows++;
    }
  }
  if (!rows) lines.push(csvLine(['','','','Waiting for the first confirmed FINAL publish','','','','','','','WAITING']));
  return lines.join('\r\n') + '\r\n';
}
async function isAuthorized(token) {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  let diff=0; for(let i=0;i<64;i++) diff |= hash.charCodeAt(i)^TOKEN_SHA256.charCodeAt(i);
  return diff===0;
}
Deno.serve(async req => {
  const common = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if (req.method !== 'GET') return new Response('Method not allowed',{status:405,headers:{...common,Allow:'GET'}});
  const url = new URL(req.url);
  if (!(await isAuthorized(url.searchParams.get('token') || ''))) return new Response('Unauthorized',{status:401,headers:common});
  const base=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!base || !key) return new Response('Feed configuration unavailable',{status:503,headers:common});
  try {
    const history=[];
    let cursor=null;
    for(let page=0;page<50;page++){
      const source=new URL('/rest/v1/rate_history',base);
      source.searchParams.set('select','id,city,changed_at,snapshot');
      source.searchParams.set('snapshot->>publication_status','eq.final');
      source.searchParams.set('snapshot->>publication_version','eq.1');
      source.searchParams.set('order','id.desc');
      source.searchParams.set('limit','500');
      if(cursor!==null)source.searchParams.set('id','lt.'+cursor);
      const response=await fetch(source,{headers:{apikey:key,Authorization:'Bearer '+key}});
      if(!response.ok)throw new Error('Source read failed');
      const batch=await response.json();
      if(!Array.isArray(batch))throw new Error('Invalid source response');
      history.push(...batch);
      if(batch.length<500){
        const csv=buildCsv(history,new Date().toISOString());
        if(csv.length>4000000) return new Response('Feed exceeds spreadsheet import size; archive partitioning is required.',{status:413,headers:common});
        return new Response(csv,{headers:{...common,'Content-Type':'text/csv; charset=utf-8'}});
      }
      cursor=batch[batch.length-1].id;
    }
    return new Response('Feed exceeds import capacity; archive partitioning is required.',{status:413,headers:common});
  } catch {
    return new Response('Final-rate feed temporarily unavailable. Existing saved rates were not changed.',{status:503,headers:common});
  }
});
