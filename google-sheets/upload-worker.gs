// Owner-only Apps Script. Configure Script Properties WORKER_TOKEN, then run install().
const WORKER_URL='https://rdmgzkxroydsuantzbwn.supabase.co/functions/v1/sheet-upload-worker';
const SPREADSHEET_ID='1T8xuvj1mRgx9rWRocYg3uhBWn0P3sTHSvv05-tcalkI';
const CITIES=['Rajkot','Ahmedabad','Udaan'];
function prepareWorkerToken() {
  const properties=PropertiesService.getScriptProperties();
  let token=properties.getProperty('WORKER_TOKEN');
  if(!token) {
    token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
    properties.setProperty('WORKER_TOKEN',token);
  }
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token);
  const hash=digest.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  console.log('WORKER_TOKEN_SHA256: '+hash);
  return hash;
}
function install() {
  if(!PropertiesService.getScriptProperties().getProperty('WORKER_TOKEN')) throw Error('Set WORKER_TOKEN in Script Properties first.');
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncRateUploads').forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('syncRateUploads').timeBased().everyMinutes(1).create();
  syncRateUploads();
}
function api(method,body) {
  const token=PropertiesService.getScriptProperties().getProperty('WORKER_TOKEN');
  if(!token)throw Error('WORKER_TOKEN is missing');
  const response=UrlFetchApp.fetch(WORKER_URL,{method,headers:{'x-sheet-worker-token':token},
    contentType:'application/json',payload:body?JSON.stringify(body):undefined,muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error('Sheet worker HTTP '+response.getResponseCode());
  return JSON.parse(response.getContentText());
}
function safeCell(value) {
  const text=String(value==null?'':value);
  return /^[=+\-@]/.test(text)?"'"+text:text;
}
function syncRateUploads() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return;
  try {
    const doc=SpreadsheetApp.openById(SPREADSHEET_ID);
    const receipt=doc.getSheetByName('_Upload Receipts')||doc.insertSheet('_Upload Receipts');
    if(receipt.getLastRow()===0)receipt.appendRow(['Upload ID','Uploaded at IST']);
    receipt.hideSheet();
    const known=new Set(receipt.getLastRow()>1?receipt.getRange(2,1,receipt.getLastRow()-1,1).getValues().flat().map(String):[]);
    const jobs=api('get').jobs||[];
    for(const job of jobs){
      if(!CITIES.includes(job.city))throw Error('Invalid city');
      if(!known.has(job.id)){
        const sheet=doc.getSheetByName(job.city);
        if(!sheet)throw Error('Missing tab '+job.city);
        const last=sheet.getLastRow(),existing=last>4?new Set(sheet.getRange(5,10,last-4,1).getValues().flat().map(String)):new Set();
        const additions=[];
        (job.rows||[]).forEach((r,i)=>{
          const rowKey=job.id+':'+i;
          if(existing.has(rowKey))return;
          const stamp=new Date(job.created_at),date=Utilities.formatDate(stamp,'Asia/Kolkata','dd/MM/yyyy'),
            time=Utilities.formatDate(stamp,'Asia/Kolkata','HH:mm:ss');
          additions.push([date,time,job.city,safeCell(job.product_name),'',safeCell(r.packing),
            Number(r.rate),safeCell(r.narration),job.id,rowKey,
            Utilities.formatDate(new Date(r.saved_at||job.created_at),'Asia/Kolkata','dd/MM/yyyy HH:mm:ss')]);
        });
        if(additions.length)sheet.getRange(Math.max(5,last+1),1,additions.length,11).setValues(additions);
        SpreadsheetApp.flush();
        receipt.appendRow([job.id,Utilities.formatDate(new Date(),'Asia/Kolkata','dd/MM/yyyy HH:mm:ss')]);
        SpreadsheetApp.flush();
        known.add(job.id);
      }
      api('post',{id:job.id});
    }
  } finally {lock.releaseLock()}
}
