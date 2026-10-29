// Owner-only Apps Script. Run prepareWorkerToken() once, then run install().
const WORKER_URL='https://rdmgzkxroydsuantzbwn.supabase.co/functions/v1/sheet-upload-worker';
const SPREADSHEET_ID='1T8xuvj1mRgx9rWRocYg3uhBWn0P3sTHSvv05-tcalkI';
const MASTER_SHEET='All History';
const RECEIPT_SHEET='_Upload Receipts';
const CITIES=['Rajkot','Ahmedabad','Udaan'];
const MAX_VIEW_ROWS=5000;
const HEADERS=[
  'Date (IST)','Time (IST)','City','Product','LOOSE / 10 KG (₹)',
  '15 KG NEW TIN','15 KG OLD TIN','15 LTR NEW TIN','15 LTR OLD TIN',
  '15 LTR TAP JAR','15 LTR BUCKET','5 LTR JAR','2 LTR JAR',
  '1 LTR BOTTLE','1 LTR POUCH','500 ML BOTTLE','500 ML POUCH',
  'Saved by','Record ID'
];
const PACKING_COLUMN={
  '15 KG N TIN':6,'15 KG NEW TIN':6,
  '15 KG S TIN':7,'15 KG OLD TIN':7,
  '15 LTR N TIN':8,'15 LTR NEW TIN':8,
  '15 LTR S TIN':9,'15 LTR OLD TIN':9,
  '15 LTR TAP JAR':10,'15 LTR BUCKET':11,
  '5 LTR JAR':12,'2 LTR JAR':13,'1 LTR BOTTLE':14,
  '1 LTR POUCH':15,'500 ML BOTTLE':16,'500 ML POUCH':17
};

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
  if(!PropertiesService.getScriptProperties().getProperty('WORKER_TOKEN')) {
    throw Error('Run prepareWorkerToken() first.');
  }
  setupWorkbook_();
  ScriptApp.getProjectTriggers()
    .filter(t=>t.getHandlerFunction()==='syncRateUploads')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncRateUploads').timeBased().everyMinutes(1).create();
  syncRateUploads();
}

function api(method,body) {
  const token=PropertiesService.getScriptProperties().getProperty('WORKER_TOKEN');
  if(!token) throw Error('WORKER_TOKEN is missing');
  const response=UrlFetchApp.fetch(WORKER_URL,{
    method:method,
    headers:{'x-sheet-worker-token':token},
    contentType:'application/json',
    payload:body?JSON.stringify(body):undefined,
    muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200) {
    throw Error('Sheet worker HTTP '+response.getResponseCode()+': '+response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function safeCell(value) {
  const text=String(value==null?'':value);
  return /^[=+\-@]/.test(text)?"'"+text:text;
}

function setupWorkbook_() {
  const doc=SpreadsheetApp.openById(SPREADSHEET_ID);
  const master=doc.getSheetByName(MASTER_SHEET);
  if(!master) throw Error('Missing tab '+MASTER_SHEET);

  if(master.getMaxColumns()>=20 &&
     String(master.getRange(4,20).getDisplayValue()).toLowerCase().includes('repeated')) {
    master.deleteColumn(20);
  }
  if(master.getMaxColumns()<19) master.insertColumnsAfter(master.getMaxColumns(),19-master.getMaxColumns());
  ensureRows_(master,MAX_VIEW_ROWS);
  master.getRange(4,1,1,19).setValues([HEADERS]);
  master.hideColumns(19);
  styleSheet_(master,'Vishwas Rate History',true);

  CITIES.forEach(city=>{
    const sheet=doc.getSheetByName(city)||doc.insertSheet(city);
    if(sheet.getMaxColumns()<18) sheet.insertColumnsAfter(sheet.getMaxColumns(),18-sheet.getMaxColumns());
    ensureRows_(sheet,MAX_VIEW_ROWS);
    sheet.getRange('A5').clearContent();
    sheet.getRange(5,1,Math.min(MAX_VIEW_ROWS-4,sheet.getMaxRows()-4),18).clearContent();
    sheet.getRange(4,1,1,18).setValues([HEADERS.slice(0,18)]);
    sheet.getRange('A5').setFormula(
      '=IFERROR(FILTER(\''+MASTER_SHEET+'\'!A5:R'+MAX_VIEW_ROWS+
      ',\''+MASTER_SHEET+'\'!C5:C'+MAX_VIEW_ROWS+'="'+city+'"),"")'
    );
    styleSheet_(sheet,city+' Rate History',false);
  });

  const receipt=doc.getSheetByName(RECEIPT_SHEET)||doc.insertSheet(RECEIPT_SHEET);
  if(receipt.getLastRow()===0) receipt.appendRow(['Upload ID','Uploaded at IST']);
  receipt.hideSheet();
  SpreadsheetApp.flush();
}

function ensureRows_(sheet,count) {
  if(sheet.getMaxRows()<count) sheet.insertRowsAfter(sheet.getMaxRows(),count-sheet.getMaxRows());
}

function styleSheet_(sheet,title,isMaster) {
  try { sheet.getRange(1,1,3,18).breakApart(); } catch(e) {}
  sheet.getRange(1,1,3,18).clearContent();
  sheet.getRange(1,1,2,18).merge();
  sheet.getRange(1,1).setValue(title)
    .setBackground('#F7CC9E').setFontFamily('Arial').setFontSize(18)
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1,34);
  sheet.setFrozenRows(4);
  sheet.setHiddenGridlines(true);

  const body=sheet.getRange(4,1,MAX_VIEW_ROWS-3,18);
  body.setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle')
    .setBorder(true,true,true,true,true,true,'#D1D8E0',SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(4,1,1,18).setBackground('#D6E3ED').setFontWeight('bold')
    .setFontColor('#082E50').setHorizontalAlignment('center').setWrap(true);
  sheet.setRowHeight(4,42);
  sheet.getRange(5,5,MAX_VIEW_ROWS-4,13).setNumberFormat('₹#,##0.00');

  const widths=[95,85,105,260,125,115,115,115,115,115,115,105,95,110,105,115,105,110];
  widths.forEach((width,i)=>sheet.setColumnWidth(i+1,width));

  const colours=[
    ['=REGEXMATCH(UPPER($D5),"PALM")','#F4CCCC'],
    ['=REGEXMATCH(UPPER($D5),"VISHVITA")','#FFF2CC'],
    ['=REGEXMATCH(UPPER($D5),"SOYA|SOYAB")','#D1E8F7'],
    ['=REGEXMATCH(UPPER($D5),"COTTON")','#D9EAD3'],
    ['=REGEXMATCH(UPPER($D5),"GROUNDNUT")','#FCE5CD'],
    ['=REGEXMATCH(UPPER($D5),"SUNFLOWER")','#EAD7F7'],
    ['=REGEXMATCH(UPPER($D5),"MUSTARD|CORN")','#D4ECEB']
  ];
  const dataRange=sheet.getRange(5,1,MAX_VIEW_ROWS-4,18);
  const rules=colours.map(([formula,colour])=>
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula).setBackground(colour).setRanges([dataRange]).build()
  );
  sheet.setConditionalFormatRules(rules);
  // Record ID is already hidden during setup; do not repeat the column action here.
}

function refreshCityFormulas_(doc) {
  CITIES.forEach(city=>{
    const sheet=doc.getSheetByName(city);
    if(!sheet) return;
    sheet.getRange('A5').setFormula(
      '=IFERROR(FILTER(\''+MASTER_SHEET+'\'!A5:R'+MAX_VIEW_ROWS+
      ',\''+MASTER_SHEET+'\'!C5:C'+MAX_VIEW_ROWS+'="'+city+'"),"")'
    );
  });
}

function makeMasterRow_(job) {
  const result=new Array(19).fill('');
  const stamp=new Date(job.created_at);
  const rows=Array.isArray(job.rows)?job.rows:[];
  result[0]=Utilities.formatDate(stamp,'Asia/Kolkata','dd/MM/yyyy');
  result[1]=Utilities.formatDate(stamp,'Asia/Kolkata','HH:mm:ss');
  result[2]=job.city;
  result[3]=safeCell(job.product_name);
  if(rows.length && rows[0].loose_rate!==null && rows[0].loose_rate!==undefined) {
    result[4]=Number(rows[0].loose_rate);
  }
  rows.forEach(r=>{
    const column=PACKING_COLUMN[String(r.packing||'').trim().toUpperCase()];
    if(column) result[column-1]=Number(r.rate);
  });
  result[17]=safeCell(rows[0]&&rows[0].saved_by?rows[0].saved_by:'VRCL Admin');
  result[18]=job.id;
  return result;
}

function syncRateUploads() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000)) return;
  try {
    const doc=SpreadsheetApp.openById(SPREADSHEET_ID);
    const master=doc.getSheetByName(MASTER_SHEET);
    if(!master) throw Error('Missing tab '+MASTER_SHEET);
    const receipt=doc.getSheetByName(RECEIPT_SHEET)||doc.insertSheet(RECEIPT_SHEET);
    if(receipt.getLastRow()===0) receipt.appendRow(['Upload ID','Uploaded at IST']);
    receipt.hideSheet();

    const known=new Set(
      receipt.getLastRow()>1
        ?receipt.getRange(2,1,receipt.getLastRow()-1,1).getValues().flat().map(String)
        :[]
    );
    const jobs=api('get').jobs||[];

    for(const job of jobs) {
      if(!CITIES.includes(job.city)) throw Error('Invalid city in upload job');
      if(!known.has(job.id)) {
        const last=master.getLastRow();
        const existing=last>4
          ?new Set(master.getRange(5,19,last-4,1).getDisplayValues().flat().map(String))
          :new Set();
        if(!existing.has(job.id)) {
          master.insertRowBefore(5);
          master.getRange(5,1,1,19).setValues([makeMasterRow_(job)]);
          master.getRange(5,5,1,13).setNumberFormat('₹#,##0.00');
          master.getRange(5,1,1,18)
            .setBorder(true,true,true,true,true,true,'#D1D8E0',SpreadsheetApp.BorderStyle.SOLID);
          refreshCityFormulas_(doc);
        }
        SpreadsheetApp.flush();
        receipt.appendRow([
          job.id,
          Utilities.formatDate(new Date(),'Asia/Kolkata','dd/MM/yyyy HH:mm:ss')
        ]);
        SpreadsheetApp.flush();
        known.add(job.id);
      }
      api('post',{id:job.id});
    }
  } finally {
    lock.releaseLock();
  }
}
