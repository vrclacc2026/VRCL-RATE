const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
async function app(){
  let now=Date.now();const nodes=new Map(),intervals=[];
  function node(){const classes=new Set();return {innerHTML:'',textContent:'',value:'',dataset:{},style:{setProperty(){}},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){on?classes.add(x):classes.delete(x)}},addEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:400,height:400}}}}
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},querySelector:()=>node(),querySelectorAll:()=>[],addEventListener(){},body:node(),hidden:false};
  const state={rate:1500,reads:0,signouts:0,sessionReads:0,fail:false,profile:{id:'customer',role:'wholesaler',active:true,display_name:'Test Customer',city:'Rajkot',allowed_cities:['Rajkot','Ahmedabad']}};
  class Query{
    constructor(table){this.table=table}
    select(){return this}eq(){return this}order(){return this}upsert(){return this}single(){return this}
    then(resolve,reject){
      let result={data:[],error:null};
      if(state.fail&&this.table==='profiles')result={data:null,error:{message:'Network unavailable'}};
      else if(this.table==='profiles')result.data=structuredClone(state.profile);
      else if(this.table==='products'){state.reads++;result.data=[{id:'palm',code:'palm',name:'Palm',city:'Rajkot'}]}
      else if(this.table==='rates')result.data=[{product_id:'palm',packing:'15 KG',rate:state.rate,updated_at:'2026-09-14T10:00:00Z'}];
      return Promise.resolve(result).then(resolve,reject);
    }
  }
  const supabase={auth:{async getSession(){state.sessionReads++;return {data:{session:{user:{id:'customer'}}}}},async signOut(){state.signouts++}},from:table=>new Query(table)};
  class Clock extends Date{static now(){return now}}
  const context=vm.createContext({document,window:{addEventListener(){}},Date:Clock,console:{error(){}},location:{origin:'http://localhost',reload(){throw Error('Unexpected page reload')}},createClient:()=>supabase,SUPABASE_URL:'test',SUPABASE_ANON_KEY:'test',setInterval(fn,ms){intervals.push({fn,ms})},setTimeout(){},innerWidth:1400,innerHeight:900});
  const source=fs.readFileSync(path.join(__dirname,'../customer.js'),'utf8').replace(/^import.*\n/gm,'');
  await vm.runInContext('(async()=>{'+source+';this.api={refreshRates,refreshClock};})()',context);
  return {state,document,api:context.api,advance(ms){now+=ms},intervals};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('customer refreshes at 3 minutes with no reload or logout and retains rates on a transient failure',async()=>{
  const a=await app();assert.equal(a.state.reads,1);
  a.advance(179000);a.api.refreshClock();await settle();assert.equal(a.state.reads,1);
  a.state.rate=1575;a.advance(1000);a.api.refreshClock();await settle();
  assert.equal(a.state.reads,2);assert.match(a.document.getElementById('grid').innerHTML,/1,575.00/);
  assert.equal(a.state.signouts,0);assert.equal(a.state.sessionReads,1);
  const before=a.document.getElementById('grid').innerHTML;
  a.state.fail=true;a.advance(180000);a.api.refreshClock();await settle();
  assert.equal(a.document.getElementById('grid').innerHTML,before);
  assert.match(a.document.getElementById('refreshStatus').textContent,/Retrying in 1 minute/);
  a.state.fail=false;a.state.rate=1600;a.advance(60000);a.api.refreshClock();await settle();
  assert.match(a.document.getElementById('grid').innerHTML,/1,600.00/);
  assert.equal(a.document.getElementById('live').classList.contains('stale'),false);
});
test('revoked access clears old rates while a temporary connection issue does not sign the user out',async()=>{
  const a=await app();a.state.profile.active=false;
  await a.api.refreshRates({permissions:true});
  assert.doesNotMatch(a.document.getElementById('grid').innerHTML,/1,500/);
  assert.match(a.document.getElementById('grid').innerHTML,/access is no longer active/);
  assert.equal(a.state.signouts,0);
});
