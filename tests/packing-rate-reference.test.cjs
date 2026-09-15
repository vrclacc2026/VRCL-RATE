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
const reference = load('packing-rate-reference.js', '\nthis.exports={packingReferenceKey,resolvePackingReference,canReferencePackingRates,packingRateDependants,calculatePackingReferencedRates};');
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

test('Udaan uses Ahmedabad same-packing rate as MASTER and applies only editable EXTRA COSTING', () => {
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
  assert.deepEqual(JSON.parse(JSON.stringify(result.map(r=>r.rate))),[1000,525,102]);
  assert.equal(result[0].narration,'Udaan terms');
});

test('the Udaan rule applies to non-Palm products too', () => {
  const product={ id:B, city:'Udaan', code:'g-n-udaan', name:'GROUNDNUT OIL', active:true };
  const meta={[keyB]:{packingRateReference:{city:'Ahmedabad',productId:A},rows:{'15 KG':{formula:'MASTER*99',extra:'+5%',round:0}}}};
  const result=reference.calculatePackingReferencedRates({meta,product,rates:[{city:'Udaan',product_id:B,packing:'15 KG',rate:0}],sourceRates:[{packing:'15 KG',rate:2000}],...calculator});
  assert.equal(result[0].rate,2100);
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