const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
async function setup(){
 const nodes=new Map(),events={},callbacks={},timers=[],renders=[];
 function node(){const classes=new Set();return{hidden:false,disabled:false,textContent:'',value:'standard',classList:{toggle(c,on){on?classes.add(c):classes.delete(c)},contains(c){return classes.has(c)}},append(){},replaceChildren(){},createTHead(){return{insertRow:node}},createTBody(){return{insertRow:node}},insertCell:node,getContext(){return{drawImage(){}}},toBlob(fn){fn({size:100})},remove(){},click(){}};}
 const state={rates:[{product_id:'p',city:'Ahmedabad',packing:'15 KG N TIN',rate:2234}],products:[{id:'p',name:'PALM OCTOBER',city:'Ahmedabad',sort_order:1}],error:null,role:'admin',reads:0,gate:null};
 const client={auth:{async getSession(){return{data:{session:{user:{id:'admin'}}}}},onAuthStateChange(fn){callbacks.auth=fn}},removeChannel(){},channel(){const ch={on(type,filter,fn){callbacks[filter.table]=fn;return ch},subscribe(){return ch}};return ch},from(table){const b={select(){return b},eq(){return b},order(){return b},limit(){return b},single(){return b},abortSignal(){return b},then(resolve,reject){return(async()=>{if(table==='profiles')return{data:{role:state.role,active:true}};state.reads++;if(state.gate)await state.gate;return{data:state[table],error:state.error}})().then(resolve,reject)}};return b}};
 const context=vm.createContext({createClient:()=>client,SUPABASE_URL:'',SUPABASE_ANON_KEY:'',AbortSignal,Image:class{decode(){return Promise.resolve()}},Date,Promise,Map,Set,console,URL:{createObjectURL(){return'blob:test'},revokeObjectURL(){}},document:{hidden:false,getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node,body:node(),addEventListener(k,fn){events[k]=fn}},window:{addEventListener(k,fn){events[k]=fn}},setInterval(fn,ms){timers.push({fn,ms})},setTimeout(fn,ms){timers.push({fn,ms});return timers.length},clearTimeout(){},renderPoster(c,a,m){renders.push(m);c.width=3072;c.height=2048}});
 const data=fs.readFileSync(path.join(__dirname,'../poster-data.js'),'utf8').replace(/^export /gm,'');vm.runInContext(data,context);
 const source=fs.readFileSync(path.join(__dirname,'../poster.js'),'utf8').replace(/^import .*;\n/gm,'');
 await vm.runInContext('(async()=>{'+source+'\nthis.api={refresh,lock};})()',context);
 return{state,nodes,events,callbacks,timers,renders,api:context.api};
}
test('initial saved data loads, realtime queues a refresh, and 15-second fallback exists',async()=>{
 const h=await setup();assert.equal(h.renders.at(-1).rows[0].values[0],'2234');assert.equal(h.nodes.get('download').disabled,false);
 assert.ok(h.timers.find(t=>t.ms===15000));h.state.rates[0].rate=2244;h.callbacks.rates();await h.timers.find(t=>t.ms===350).fn();await h.api.refresh();assert.equal(h.renders.at(-1).rows[0].values[0],'2244');
});
test('failed refresh disables export, keeps prior preview, and recovery loads fresh values',async()=>{
 const h=await setup();h.state.error=new Error('Network offline');assert.equal(await h.api.refresh(),false);assert.equal(h.nodes.get('download').disabled,true);assert.equal(h.renders.length,1);
 h.state.error=null;h.state.rates[0].rate=2254;assert.equal(await h.api.refresh(),true);assert.equal(h.nodes.get('download').disabled,false);assert.equal(h.renders.at(-1).rows[0].values[0],'2254');
});
test('download always reads the server again; a failed verification prevents export',async()=>{
 const h=await setup();const before=h.state.reads;await h.nodes.get('download').onclick();assert.ok(h.state.reads>before);
 h.state.error=new Error('API unavailable');await h.nodes.get('download').onclick();assert.equal(h.nodes.get('download').disabled,true);
});
test('revoked admin role hides the poster and blocks downloads',async()=>{
 const h=await setup();h.state.role='wholesaler';assert.equal(await h.api.refresh(),false);assert.equal(h.nodes.get('preview').hidden,true);assert.equal(h.nodes.get('login').hidden,false);assert.equal(h.nodes.get('download').disabled,true);
});
test('logout while data is in flight cannot reveal the poster afterward',async()=>{
 const h=await setup();let release;h.state.gate=new Promise(r=>release=r);const pending=h.api.refresh();await new Promise(r=>setImmediate(r));h.callbacks.auth('SIGNED_OUT');release();await pending;
 assert.equal(h.nodes.get('preview').hidden,true);assert.equal(h.renders.length,1);assert.equal(h.nodes.get('download').disabled,true);
});
test('product and packing changes propagate through refresh with no static product or column list',async()=>{
 const h=await setup();
 h.state.products.push({id:'sun',name:'SUNFLOWER NEW',city:'Ahmedabad',sort_order:2});
 h.state.rates.push({product_id:'sun',city:'Ahmedabad',packing:'20 Ltr Jar',rate:3000});
 h.callbacks.products();await h.api.refresh();
 assert.equal(h.renders.at(-1).rows.length,2);assert.ok(h.renders.at(-1).columns.includes('20 Ltr Jar'));
 h.state.products[1].name='SUNFLOWER RENAMED';h.state.rates[1].packing='20 Ltr New Jar';await h.api.refresh();
 assert.equal(h.renders.at(-1).rows[1].name,'SUNFLOWER RENAMED');assert.ok(!h.renders.at(-1).columns.includes('20 Ltr Jar'));
 h.state.products.pop();await h.api.refresh();assert.equal(h.renders.at(-1).rows.length,1);assert.ok(!h.renders.at(-1).columns.includes('20 Ltr New Jar'));
 h.state.products=[];await h.api.refresh();assert.equal(h.renders.at(-1).rows.length,0);assert.equal(h.renders.at(-1).columns.length,0);
});
