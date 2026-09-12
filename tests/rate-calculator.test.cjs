const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.env.VRCL_TEST_SOURCE_ROOT || path.join(__dirname, '..'));
const context = vm.createContext({});
const source = fs.readFileSync(path.join(root, 'rate-calculator.js'), 'utf8')
  .replace(/^export const /gm, 'const ')
  .replace(/^export /gm, '');
vm.runInContext(source + '\nthis.api={calcFormula,applyExtraCost,roundPackingValue,roundLooseValue};', context);
const { calcFormula, applyExtraCost, roundPackingValue, roundLooseValue } = context.api;

test('legacy formula arithmetic keeps its original values', () => {
  assert.equal(calcFormula('MASTER*1.365', 1000), 1365);
  assert.equal(calcFormula('/2', 1000), 500);
  assert.equal(calcFormula('(MASTER+20)*2', 1000), 2040);
  assert.equal(calcFormula('MASTER RATE + 10', 1000), 1010);
  assert.equal(calcFormula('not valid', 1000), 0);
});

test('formula accepts calculator-style percentages', () => {
  assert.equal(calcFormula('+5%', 1000), 1050);
  assert.equal(calcFormula('MASTER+5%', 1000), 1050);
  assert.equal(calcFormula('MASTER-5%', 1000), 950);
  assert.equal(calcFormula('MASTER*(1+5%)', 1000), 1050);
  assert.equal(calcFormula('MASTER*5%', 1000), 50);
});

test('extra costing supports all requested operators and keeps numeric extras additive', () => {
  assert.equal(applyExtraCost(1000, 15), 1015);
  assert.equal(applyExtraCost(1000, '+15'), 1015);
  assert.equal(applyExtraCost(1000, '-15'), 985);
  assert.equal(applyExtraCost(1000, '*1.05'), 1050);
  assert.equal(applyExtraCost(1000, '/2'), 500);
  assert.equal(applyExtraCost(1000, '+5%'), 1050);
  assert.equal(applyExtraCost(1000, '10*2'), 1020);
});

test('an exact half rounds upward for packing and loose previews', () => {
  assert.equal(roundPackingValue(100.5, 1), 101);
  assert.equal(roundPackingValue(100.25, 0.5), 100.5);
  assert.equal(roundPackingValue(100.24, 0.5), 100);
  assert.equal(roundLooseValue(1002.5, 5), 1005);
});
