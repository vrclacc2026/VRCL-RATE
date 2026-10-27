const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.env.VRCL_TEST_SOURCE_ROOT || path.join(__dirname, '..'));
const load = (file, suffix) => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8').replace(/^export const /gm, 'const ').replace(/^export /gm, '') + suffix, context);
  return context.exports;
};
const reference = load('packing-rate-reference.js', '\nthis.exports={packingKey,createPackingSourceMap,packingSourceName,mergeReferencedPackings,packingReferenceKey,resolvePackingReference,canReferencePackingRates,packingRateDependants,calculatePackingReferencedRates};');
const calculator = load('rate-calculator.js', '\nthis.exports={calcFormula,applyExtraCost,roundPackingValue};');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const keyA = 'Ahmedabad|' + A, keyB = 'Udaan|' + B, keyC = 'Rajkot|' + C;
const products = [
  { id:A, city:'Ahmedabad', code:'palm', name:'Palm Ahmedabad', active:true },
  { id:B, city:'Udaan', code:'palm', name:'Palm Udaan', active:true },
  { id:C, city:'Rajkot', code:'palm', name:'Palm Rajkot', active:true }
];

test('Udaan linked recalculation applies the saved formula and EXTRA COSTING', () => {
  const meta = {
    [keyA]: { rows:{} },
    [keyB]: { packingRateReference:{city:'Ahmedabad',productId:A}, rows:{
      '15 KG': { master:'LOOSE OIL RATE', formula:'MASTER*9', extra:0, round:0 },
      '5 L': { master:'15 KG', formula:'MASTER*7', extra:'+5%', round:0 },
      '1 L': { master:'LOOSE OIL RATE', formula:'MASTER*4', extra:'+2%', round:0 }
    } }
  };
  const rates = [
    { city:'Udaan', product_id:B, packing:'15 KG', rate:0, narration:'Udaan terms', sort_order:1 },
    { city:'Udaan', product_id:B, packing:'5 L', rate:0, narration:'Udaan terms', sort_order:2 },
    { city:'Udaan', product_id:B, packing:'1 L', rate:0, narration:'Udaan terms', sort_order:3 }
  ];
  const sourceRates = [
    { city:'Ahmedabad', product_id:A, packing:'15 kg', rate:1000 },
    { city:'Ahmedabad', product_id:A, packing:'5 L', rate:500 },
    { city:'Ahmedabad', product_id:A, packing:'1 L', rate:100 }
  ];
  const result = reference.calculatePackingReferencedRates({meta,product:products[1],rates,sourceRates,...calculator});
  assert.deepEqual(JSON.parse(JSON.stringify(result.map(r=>r.rate))),[9000,66150,408]);
  assert.equal(result[0].narration,'Udaan terms');
});

test('Udaan linked recalculation honors formula for non-Palm products too', () => {
  const product={ id:B, city:'Udaan', code:'g-n-udaan', name:'GROUNDNUT OIL', active:true };
  const meta={[keyB]:{packingRateReference:{city:'Ahmedabad',productId:A},rows:{'15 KG':{formula:'+3.5%',extra:'+5%',round:0}}}};
  const result=reference.calculatePackingReferencedRates({meta,product,rates:[{city:'Udaan',product_id:B,packing:'15 KG',rate:0}],sourceRates:[{packing:'15 KG',rate:2000}],...calculator});
  assert.equal(result[0].rate,2173.5);
});

test('Rajkot can be the Udaan source without rewriting saved formula settings', () => {
  const meta={[keyB]:{packingRateReference:{city:'Rajkot',productId:C},rows:{'15 KG':{master:'AHMEDABAD SAME PACKING',formula:'+3.5%',extra:'+5%',round:0}}}};
  const before=JSON.parse(JSON.stringify(meta));
  const result=reference.calculatePackingReferencedRates({meta,product:products[1],rates:[{city:'Udaan',product_id:B,packing:'15 KG',rate:0}],sourceRates:[{city:'Rajkot',product_id:C,packing:'15 KG',rate:2000}],...calculator});
  assert.equal(result[0].rate,2173.5);
  assert.deepEqual(JSON.parse(JSON.stringify(meta)),before);
});

test('packing dependants are returned in source-to-target calculation order', () => {
  const meta = {
    [keyA]: {},
    [keyB]: { packingRateReference:{city:'Ahmedabad',productId:A} },
    [keyC]: { packingRateReference:{city:'Udaan',productId:B} }
  };
  assert.deepEqual(JSON.parse(JSON.stringify(reference.packingRateDependants(meta,keyA,products).map(p=>p.id))),[B,C]);
  assert.equal(reference.canReferencePackingRates(meta,keyA,keyC,products),false,'a reverse link would create a cycle');
});

test('missing same-packing source rate fails instead of publishing zero', () => {
  const meta = {[keyB]:{packingRateReference:{city:'Ahmedabad',productId:A},rows:{'15 KG':{formula:'MASTER*1',extra:0,round:0}}}};
  assert.throws(()=>reference.calculatePackingReferencedRates({
    meta,product:products[1],rates:[{city:'Udaan',product_id:B,packing:'15 KG',rate:0}],sourceRates:[{packing:'5 L',rate:500}],...calculator
  }),/source has no matching rate for 15 KG/);
});

test('Udaan Rajkot source uses the same Formula plus Extra calculation as its admin preview', () => {
  const meta={[keyB]:{packingRateReference:{city:'Rajkot',productId:C},rows:{
    '15 KG NEW TIN':{master:'AHMEDABAD SAME PACKING',formula:'+3.5%',extra:'+5%',round:0}
  }}};
  const result=reference.calculatePackingReferencedRates({
    meta,product:products[1],
    rates:[{city:'Udaan',product_id:B,packing:'15 KG NEW TIN',rate:2394,narration:'Terms',sort_order:1}],
    sourceRates:[{city:'Rajkot',product_id:C,packing:'15 KG NEW TIN',rate:2280,sort_order:1}],
    ...calculator
  });
  assert.equal(result[0].rate,2477.79);
});

for (const [sourceName,targetName] of [['15 KG N TIN','15 KG NEW TIN'],['15 KG S TIN','15 KG OLD TIN'],['15 KG NEW TIN','15KG N TIN'],['15 LTR OLD TIN','15 LTR S TIN']]) {
  test('different city labels keep reference: '+sourceName+' -> '+targetName,()=>{
    const meta = {[keyB]:{packingRateReference:{city:'Rajkot',productId:C},rows:{[targetName]:{formula:'+3.5%',extra:'+5%'}}}};
    const result=reference.calculatePackingReferencedRates({meta,product:products[1],rates:[{city:'Udaan',product_id:B,packing:targetName,rate:0}],sourceRates:[{packing:sourceName,rate:2280}],...calculator});
    assert.equal(result.length,1);assert.equal(result[0].packing,targetName);assert.equal(result[0].rate,2477.79);
  });
}
test('arbitrary source rename survives save and later reload using saved aliases',()=>{
  const meta = {
    [keyC]:{rows:{'Cotton premium tin':{packingAliases:['15 KG NEW TIN']}}},
    [keyA]:{packingRateReference:{city:'Rajkot',productId:C},rows:{'Ahmedabad tin':{sourcePacking:'15 KG NEW TIN',formula:'MASTER+10'}}}
  };
  const result=reference.calculatePackingReferencedRates({meta,product:products[0],rates:[{city:'Ahmedabad',product_id:A,packing:'Ahmedabad tin',rate:0}],sourceRates:[{packing:'Cotton premium tin',rate:2000}],...calculator});
  assert.equal(result[0].packing,'Ahmedabad tin');assert.equal(result[0].rate,2010);
});
test('first source rename is resolved before the renamed row is written',()=>{
  const result=reference.calculatePackingReferencedRates({meta:{[keyA]:{rows:{'15 KG NEW TIN':{formula:'MASTER+10'}}}},product:products[0],
    rates:[{city:'Ahmedabad',product_id:A,packing:'15 KG NEW TIN'}],
    sourceRates:[{packing:'Cotton premium tin',originalPacking:'15 KG NEW TIN',rate:2000}],...calculator});
  assert.equal(result[0].rate,2010);
});
test('new and old tin remain distinct; no guessing for different sizes',()=>{
  const map=reference.createPackingSourceMap([{packing:'15 KG N TIN',rate:2000},{packing:'15 KG S TIN',rate:1900}]);
  assert.equal(map.get(reference.packingKey('15 KG NEW TIN')).rate,2000);
  assert.equal(map.get(reference.packingKey('15 KG OLD TIN')).rate,1900);
  assert.equal(map.has(reference.packingKey('15 LTR NEW TIN')),false);
});
test('ambiguous packing aliases cannot silently publish the wrong rate',()=>{
  assert.throws(()=>reference.createPackingSourceMap([{packing:'15 KG NEW TIN',rate:2000},{packing:'15 KG N TIN',rate:1900}]),/Ambiguous/);
});
test('renamed source does not recreate an excluded Udaan tin',()=>{
  const result=reference.mergeReferencedPackings([], [{packing:'15 KG N TIN',rate:2000}], {}, {}, ['15 KG NEW TIN']);
  assert.equal(result.length,0);
});
test('Udaan preview retains formulas and local labels after source rename',()=>{
  const code=fs.readFileSync(path.join(root,'udaan-rate-system.js'),'utf8');
  const evaluateCode=code.slice(code.indexOf('function evaluateRows('),code.indexOf('\nfunction installModeStyle'));
  const ctx=vm.createContext({...calculator,norm:reference.packingKey,packingSourceName:reference.packingSourceName,AHD:'AHMEDABAD SAME PACKING'});
  vm.runInContext(evaluateCode+';this.run=evaluateRows;',ctx);
  const rates=[{packing:'15 KG NEW TIN',formula:'+3.5%',extra:'+5%'}],sourceRates=[{packing:'15 KG N TIN',rate:2280}];
  const rows=reference.mergeReferencedPackings(rates,sourceRates);
  const values=ctx.run({rows,source:{city:'Rajkot'},sourceMap:reference.createPackingSourceMap(sourceRates)});
  assert.equal(rows.length,1);assert.equal(values[0].rate,2477.79);
});
