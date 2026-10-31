const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../poster-data.js'),'utf8').replace(/^export /gm,'')+'\nthis.api={packingKey,buildPoster,formatRate};',context);
const {packingKey,buildPoster,formatRate}=context.api;
const product=(id,name,sort_order=1,city='Ahmedabad')=>({id,name,sort_order,city});
const rate=(product_id,packing,value,city='Ahmedabad',sort_order=0)=>({product_id,packing,rate:value,city,sort_order});
const cell=(model,id,packing)=>model.rows.find(r=>r.id===id).values[model.columns.indexOf(packing)];
test('October and November use exact product IDs with separate N/S Tin and no cross-city fallback',()=>{
 const ps=[product('oct','SOYA OCTOBER'),product('nov','SOYA NOVEMBER',2)];
 const model=buildPoster(ps,[rate('oct','15 KG N TIN',2270),rate('oct','15 KG S TIN',2220),rate('oct','1 LTR BOTTLE',141.90),rate('nov','15 KG N TIN',2285),rate('nov','15 KG S TIN',2235),rate('nov','15 KG N TIN',9999,'Rajkot')]);
 assert.equal(cell(model,'oct','15 KG N TIN'),'2270');assert.equal(cell(model,'oct','15 KG S TIN'),'2220');
 assert.equal(cell(model,'nov','15 KG N TIN'),'2285');assert.equal(cell(model,'nov','15 KG S TIN'),'2235');
 assert.equal(cell(model,'oct','1 LTR BOTTLE'),'141.90');assert.equal(cell(model,'nov','1 LTR BOTTLE'),'—');
});
test('all active AHD products are included, even new families and products without saved packing',()=>{
 const ps=[product('c','COTTONSEED'),product('p','PALM OCTOBER'),product('new','NEW OIL + SPECIAL'),product('r','RAJKOT',1,'Rajkot'),{...product('off','HIDDEN'),active:false}];
 const model=buildPoster(ps,[rate('p','15 KG N TIN',100)]);
 assert.equal(model.rows.map(r=>r.id).join(','),'p,c,new');
 assert.equal(model.rows[2].name,'NEW OIL + SPECIAL');assert.equal(cell(model,'new','15 KG N TIN'),'—');
});
test('packings come only from the snapshot, retain saved labels, order and separate Jar/Bucket rates',()=>{
 const model=buildPoster([product('gn','GROUNDNUT')],[rate('gn','15 Ltr Tap Jar',2678,'Ahmedabad',2),rate('gn','15 Ltr Bucket',2679,'Ahmedabad',1),rate('gn','15 KG N Tin',2900,'Ahmedabad',0)]);
 assert.equal(model.columns.join('|'),'15 KG N Tin|15 Ltr Bucket|15 Ltr Tap Jar');
 assert.equal(cell(model,'gn','15 Ltr Tap Jar'),'2678.00');assert.equal(cell(model,'gn','15 Ltr Bucket'),'2679.00');
 assert.ok(!model.columns.includes('15 KG S TIN'));
});
test('adding, renaming and deleting a packing regenerates columns without stale headers',()=>{
 const ps=[product('p','PALM')],rs=[rate('p','15 Kg N Tin',2000),rate('p','15 Kg S Tin',1950)];
 assert.equal(buildPoster(ps,rs).columns.length,2);
 rs.push(rate('p','3 Ltr Jar',450));assert.equal(cell(buildPoster(ps,rs),'p','3 Ltr Jar'),'450.00');
 rs[2].packing='3 Ltr Special Jar';let m=buildPoster(ps,rs);assert.ok(!m.columns.includes('3 Ltr Jar'));assert.ok(m.columns.includes('3 Ltr Special Jar'));
 rs.splice(1,1);m=buildPoster(ps,rs);assert.ok(!m.columns.includes('15 Kg S Tin'));assert.equal(cell(m,'p','15 Kg N Tin'),'2000');
});
test('product removal or deactivation drops its rates and unique packings; empty AHD clears the table',()=>{
 const ps=[product('p','PALM'),product('s','SUNFLOWER')],rs=[rate('p','15 Kg N Tin',2000),rate('s','20 Ltr Jar',3000)];
 ps[1].active=false;let m=buildPoster(ps,rs);assert.equal(m.rows.length,1);assert.equal(m.columns.join(','),'15 Kg N Tin');
 m=buildPoster([],rs);assert.equal(m.rows.length,0);assert.equal(m.columns.length,0);
});
test('shared packing stays while another AHD product uses it, and product rename preserves exact saved name',()=>{
 const ps=[product('p','PALM'),product('s','SOYA')],rs=[rate('p','1 Ltr Bottle',100),rate('s','1 Ltr Bottle',110)];
 ps[1].name='SOYA + NOVEMBER :';rs.shift();const m=buildPoster(ps,rs);
 assert.equal(m.rows.find(r=>r.id==='s').name,'SOYA + NOVEMBER :');assert.equal(m.columns.length,1);assert.equal(cell(m,'p','1 Ltr Bottle'),'—');
});
test('S Tin saved values never derive from N Tin, KG and LTR remain separate',()=>{
 const m=buildPoster([product('p','PALM')],[rate('p','15 Ltr N Tin',2044),rate('p','15 Ltr S Tin',2144),rate('p','15 Kg S Tin',2244)]);
 assert.equal(cell(m,'p','15 Ltr S Tin'),'2144');assert.equal(cell(m,'p','15 Kg S Tin'),'2244');
});
test('paisa precision, zero, invalid saved values and conflicting duplicate packing fail safely',()=>{
 assert.equal(formatRate(72.05,'500 ML BOTTLE'),'72.05');assert.equal(formatRate(0,'15 KG N TIN'),'0');
 assert.equal(formatRate(2234.01,'15 KG N TIN'),'2234.01');assert.throws(()=>formatRate('','5 LTR JAR'));assert.throws(()=>formatRate(NaN,'5 LTR JAR'));
 const ps=[product('p','PALM')];assert.throws(()=>buildPoster(ps,[rate('p','15 KG N TIN',null)]),/missing/);
 assert.throws(()=>buildPoster(ps,[rate('p','15 KG N TIN',1),rate('p','15 KG N TIN',2)]),/Conflicting/);
});
