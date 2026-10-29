const EXPECTED_HASH = "bb789f8f7daae859c39745f72a8ebb4afaf7d577ae08863582c5b90ad137bb5d";
const SHEET_ID = "1T8xuvj1mRgx9rWRocYg3uhBWn0P3sTHSvv05-tcalkI";
const URL = Deno.env.get("SUPABASE_URL");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const headers = {"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json"};
const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function sha256(text) {
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async request => {
 try {
  if (!URL || !KEY || !EXPECTED_HASH) return reply({error:"Worker configuration missing"},503);
  const token=request.headers.get("x-sheet-worker-token")||"";
  if (token.length!==64 || await sha256(token)!==EXPECTED_HASH) return reply({error:"Unauthorized"},401);
  if (request.method==="GET") {
   const r=await fetch(URL+"/rest/v1/sheet_upload_jobs?select=id,city,product_name,rows,created_at,status&status=eq.pending&order=created_at.asc&limit=10",{headers});
   if(!r.ok)return reply({error:"Queue read failed"},502);
   return reply({sheetId:SHEET_ID,jobs:await r.json()});
  }
  if(request.method==="POST") {
   const body=await request.json();
   if(!/^[0-9a-f-]{36}$/.test(String(body.id||"")))return reply({error:"Invalid job ID"},400);
   const r=await fetch(URL+"/rest/v1/sheet_upload_jobs?id=eq."+encodeURIComponent(body.id)+"&status=eq.pending",{
    method:"PATCH",headers:{...headers,"Prefer":"return=representation"},
    body:JSON.stringify({status:"uploaded",uploaded_at:new Date().toISOString(),last_error:null})
   });
   if(!r.ok)return reply({error:"Acknowledgement failed"},502);
   const result=await r.json();
   return reply({uploaded:result.length===1});
  }
  return reply({error:"Method not allowed"},405);
 }catch(error){console.error("Sheet worker error",error);return reply({error:"Worker failed"},500)}
});