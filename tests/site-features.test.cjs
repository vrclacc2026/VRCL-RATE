const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.env.VRCL_TEST_SOURCE_ROOT || path.join(__dirname, '..'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all changed browser modules have valid module syntax', () => {
  for (const file of ['admin.html','users.html','customer-check.html']) {
    const match = read(file).match(/<script type="module">([\s\S]*?)<\/script>/);
    assert.ok(match, file + ' must contain a module script');
    new vm.SourceTextModule(match[1]);
  }
  new vm.SourceTextModule(read('customer.js'));
  new vm.SourceTextModule(read('rate-calculator.js'));
});

test('admin exposes percentage and operator costing without changing stored field names', () => {
  const admin = read('admin.html');
  assert.match(admin, /import\{calcFormula,applyExtraCost,roundPackingValue,roundLooseValue\}/);
  assert.match(admin, /data-f="formula"[^>]+\+5%/);
  assert.match(admin, /type="text" inputmode="decimal" data-i="\$\{i\}" data-f="extra"/);
  assert.match(admin, /class="packingField"/);
  assert.match(admin, /class="oldRateField"/);
});

test('customer permission is selectable per city and enforced in database policies', () => {
  const users = read('users.html'), customer = read('customer.js');
  const migration = read('supabase/migrations/20260912134702_add_multi_city_customer_permissions.sql');
  assert.match(users, /CITY PERMISSION — ONE OR MORE/);
  assert.match(users, /allowed_cities:cities/);
  assert.match(customer, /allowed_cities/);
  assert.match(customer, /eq\('city',currentCity\)/);
  assert.match(migration, /products\.city = any\(p\.allowed_cities\)/);
  assert.match(migration, /rates\.city = any\(p\.allowed_cities\)/);
  assert.match(migration, /profiles_wholesaler_city_permission/);
});

test('rate check copies a WhatsApp-bold product title and both panels respect reduced motion', () => {
  const check = read('customer-check.html'), css = read('customer.css');
  assert.match(check, /date,'',`\*\$\{p\.name\}\*`/);
  assert.match(check, /@keyframes checkCardEnter/);
  assert.match(check, /prefers-reduced-motion/);
  assert.match(css, /@keyframes rateCardEnter/);
  assert.match(css, /\.marketMotion/);
  assert.match(css, /prefers-reduced-motion/);
});

test('older full backups keep single-city permissions during restore', () => {
  const migration = read('supabase/migrations/20260912134702_add_multi_city_customer_permissions.sql');
  assert.match(migration, /else array\[x\.city\]::text\[\]/);
  assert.match(migration, /allowed_cities = excluded\.allowed_cities/);
});
