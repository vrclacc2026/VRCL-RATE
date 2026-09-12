const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(process.env.VRCL_TEST_SOURCE_ROOT || path.join(__dirname, '..'));
const META = 'VISHWAS_RATE_ADMIN_META_V3';
const FOCUS = 'VRCL_RESTORED_PRODUCT';
const CLOUD = 'admin_formula_state_v1';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const keyA = 'Rajkot|' + A;
const keyB = 'Ahmedabad|' + B;
const clone = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function fixture() {
  return {
    signedIn: true, rpcCalls: 0, cloudWrites: 0,
    profiles: [{ id: 'admin-test', role: 'admin', active: true }],
    products: [
      { id: A, code: 'groundnut', name: 'Groundnut', city: 'Rajkot', active: true, sort_order: 1 },
      { id: B, code: 'cotton', name: 'Cotton', city: 'Ahmedabad', active: true, sort_order: 2 }
    ],
    rates: [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', city: 'Rajkot', product_id: A, packing: '15 KG', rate: 1500, narration: 'Terms A', sort_order: 1 },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', city: 'Ahmedabad', product_id: B, packing: '1 L', rate: 120, narration: 'Terms B', sort_order: 1 },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', city: 'Ahmedabad', product_id: B, packing: '5 L', rate: 600, narration: 'Terms B', sort_order: 2 }
    ],
    admin_state: [], rate_history: [], user_activity: [], header_assets: []
  };
}
function metadata() {
  return {
    [keyA]: { looseRate: '1000', masterFormula: 'MASTER/10', masterRound: 5, rows: { '15 KG': { master: 'LOOSE OIL RATE', formula: 'MASTER*1.5', extra: 0, round: 1 } } },
    [keyB]: { looseRate: '1200', masterFormula: 'MASTER/10', masterRound: 2, rows: {
      '1 L': { master: 'LOOSE OIL RATE', formula: 'MASTER/10', extra: 0, round: 1 },
      '5 L': { master: '1 L', formula: 'MASTER*5', extra: 2, round: 5 }
    } }
  };
}
function app({ db = fixture(), local = storage(), session = storage() } = {}) {
  const elements = new Map();
  const window = new EventTarget();
  const node = () => Object.assign(new EventTarget(), {
    value: '', innerHTML: '', textContent: '', style: {}, dataset: {}, disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, appendChild() {}, append() {}, click() {}, remove() {},
    querySelector() { return null; }
  });
  const document = Object.assign(new EventTarget(), {
    getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector === '#productArea .productBtn.active') return { dataset: { product: editor.editorTest.selection().product_id } };
      if (selector.includes('.city.active')) return { dataset: { city: editor.editorTest.selection().city } };
      return null;
    },
    createElement: node, body: node(), head: node()
  });
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.sorts = []; }
    select() { return this; }
    eq(column, value) { this.filters.push(row => row[column] === value); return this; }
    gte() { return this; }
    order(column) { this.sorts.push(column); return this; }
    limit() { return this; }
    upsert(payload) { this.payload = clone(payload); return this; }
    insert(payload) { this.payload = clone(payload); this.insertOnly = true; return this; }
    async execute(single) {
      if (this.payload) {
        if (this.table === 'rates') {
          if (db.failRates) return { data: null, error: new Error('Rate storage unavailable') };
          const values = Array.isArray(this.payload) ? this.payload : [this.payload];
          const next = clone(db.rates);
          for (const row of values) {
            const index = next.findIndex(old => old.city === row.city && old.product_id === row.product_id && old.packing === row.packing);
            if (index >= 0) Object.assign(next[index], row); else next.push({id: webcrypto.randomUUID(), ...row});
          }
          db.rates = next; db.rateWrites = (db.rateWrites || 0) + 1;
          return { data: clone(values), error: null };
        }
        if (this.table === 'rate_history') {
          const values = Array.isArray(this.payload) ? this.payload : [this.payload];
          db.rate_history.push(...values.map(row => ({...row, changed_at:new Date().toISOString()})));
          return {data:clone(values),error:null};
        }
        if (db.failCloud) return { data: null, error: new Error('Formula storage unavailable') };
        if (db.beforeCloudWrite) await db.beforeCloudWrite();
        db.cloudWrites++;
        const index = db[this.table].findIndex(row => row.key === this.payload.key);
        if (index < 0) db[this.table].push(this.payload); else db[this.table][index] = this.payload;
        return { data: clone(this.payload), error: null };
      }
      let result = db[this.table].filter(row => this.filters.every(fn => fn(row)));
      for (const column of this.sorts.toReversed()) result = [...result].sort((a, b) => a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0);
      return { data: clone(single ? result[0] || null : result), error: null };
    }
    single() { return this.execute(true); }
    maybeSingle() { return this.execute(true); }
    then(resolve, reject) { return this.execute(false).then(resolve, reject); }
  }
  const supabase = {
    auth: { async getSession() { return { data: { session: db.signedIn ? { user: { id: 'admin-test' } } : null } }; } },
    from: table => new Query(table),
    async rpc(name, args) {
      db.rpcCalls++;
      if (name === 'restore_vrcl_full_backup') {
        for (const key of ['products', 'rates', 'admin_state']) db[key] = clone(args.payload.data[key] || []);
        return { data: { ok: true, products: db.products.length, rates: db.rates.length }, error: null };
      }
      assert.equal(name, 'restore_vrcl_product_backup');
      const { product_payload: product, rates_payload: rates } = clone(args);
      const retained = db.rates.filter(r => r.product_id !== product.id);
      const allIds = [...retained, ...rates].map(r => r.id);
      assert.equal(new Set(allIds).size, allIds.length, 'restored rates cannot reuse another product\'s primary keys');
      db.products = [...db.products.filter(p => p.id !== product.id), product];
      db.rates = [...db.rates.filter(r => r.product_id !== product.id), ...rates];
      return { data: { ok: true, product_id: product.id, rates: rates.length }, error: null };
    }
  };
  const shared = {
    window, document, localStorage: local, sessionStorage: session, console, Event,
    crypto: webcrypto, createClient: () => supabase, SUPABASE_URL: 'test', SUPABASE_ANON_KEY: 'test',
    location: { pathname: '/test.html', reload() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    fetch: async () => ({ ok: true, text: async () => '' })
  };
  const manager = vm.createContext({ ...shared });
  const backupSource = fs.readFileSync(path.join(root, 'backup-manager.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(backupSource + `
    this.backupTest = { makeProductBackup, restoreProductBackup, restoreFullBackup, buildFullBackup, hydrateStateFromCloud, syncStateToCloud };
    downloadJson = value => { this.downloadedBackup = value; };
  `, manager);
  const referenceModule = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,'loose-rate-reference.js'),'utf8').replace(/^export /gm,''),referenceModule);
  const calculatorModule = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,'rate-calculator.js'),'utf8').replace(/^export const /gm,'const ').replace(/^export /gm,'')+
    '\nthis.calculatorTest={calcFormula,applyExtraCost,roundPackingValue,roundLooseValue};',calculatorModule);
  const calculator = calculatorModule.calculatorTest;
  const editor = vm.createContext({ ...shared, hydrateStateFromCloud: manager.backupTest.hydrateStateFromCloud, syncStateToCloud:manager.backupTest.syncStateToCloud,
    resolveLooseRate:referenceModule.resolveLooseRate,canReferenceLooseRate:referenceModule.canReferenceLooseRate,
    looseRateDependants:referenceModule.looseRateDependants,calculateReferencedRates:referenceModule.calculateReferencedRates,
    calcFormula:calculator.calcFormula,applyExtraCost:calculator.applyExtraCost,
    roundPackingValue:calculator.roundPackingValue,roundLooseValue:calculator.roundLooseValue });
  const adminSource = fs.readFileSync(path.join(root, 'admin.html'), 'utf8')
    .match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/^import.*\n/gm, '').replace(/;await check\(\);\s*$/, ';');
  vm.runInContext(adminSource + `
    this.editorTest = {
      check,
      async select(nextCity, id) { city=nextCity; productId=id; await loadProducts(); },
      selection: () => ({city,product_id:productId}),
      rows: () => JSON.parse(JSON.stringify(rows)),
      editRow(i, field, value) { sync({dataset:{i, f:field},value}); },
      addRow() { $('addPacking').onclick(); }
    };
  `, editor);
  return { db, local, session, window, document, manager, backup: manager.backupTest, editor: editor.editorTest };
}

test('backup captures unsaved packaging and formulas; restore and reload show the original product', async () => {
  const a = app();
  a.local.setItem(META, JSON.stringify(metadata()));
  // Load storage into the editor exactly as cloud/restore does in the page.
  a.window.dispatchEvent(new Event('vrcl:admin-state-applied'));
  await a.editor.select('Ahmedabad', B);
  a.editor.editRow(0, 'formula', 'MASTER/8');
  a.editor.editRow(0, 'extra', '7');
  a.editor.editRow(0, 'round', '2');
  a.editor.addRow();
  a.editor.editRow(2, 'packing', '15 L');
  a.editor.editRow(2, 'master', '5 L');
  a.editor.editRow(2, 'formula', 'MASTER*3');
  a.editor.editRow(2, 'extra', '9');
  a.editor.editRow(2, 'round', '10');
  a.document.getElementById('narration').value = 'Restored terms';
  const beforeBackupRates = clone(a.db.rates);
  await a.backup.makeProductBackup();
  const snapshot = clone(a.manager.downloadedBackup);
  assert.deepEqual(a.db.rates, beforeBackupRates, 'taking a backup does not publish editor changes');
  assert.deepEqual(snapshot.rates.map(r => r.packing), ['1 L', '5 L', '15 L']);
  assert.equal(snapshot.formula_state.meta[keyB].rows['1 L'].formula, 'MASTER/8');
  assert.equal(snapshot.formula_state.meta[keyB].rows['15 L'].master, '5 L');

  a.db.rates = a.db.rates.filter(r => r.product_id !== B);
  await a.editor.select('Ahmedabad', B);
  const otherMeta = clone(JSON.parse(a.local.getItem(META))[keyA]);
  const result = await a.backup.restoreProductBackup(snapshot);
  assert.equal(result.rates, 3);
  assert.equal(result.formulas_included, true);
  assert.deepEqual(JSON.parse(a.local.getItem(META))[keyA], otherMeta);
  assert.deepEqual(a.db.admin_state[0].value.meta[keyB], snapshot.formula_state.meta[keyB]);

  const reload = app({ db: a.db, local: a.local, session: a.session });
  assert.equal(await reload.editor.check(), true);
  assert.deepEqual(clone(reload.editor.selection()), { city: 'Ahmedabad', product_id: B });
  const restoredRows = clone(reload.editor.rows());
  assert.deepEqual(restoredRows.map(r => r.packing), ['1 L', '5 L', '15 L']);
  assert.equal(restoredRows[0].formula, 'MASTER/8');
  assert.equal(restoredRows[0].extra, '7');
  assert.equal(restoredRows[2].round, '10');
  assert.equal(restoredRows[2].master, '5 L');
  assert.equal(reload.document.getElementById('looseRate').value, '1200');
  assert.equal(reload.document.getElementById('pvFormula').value, 'MASTER/10');
  assert.equal(reload.document.getElementById('pvRound').value, 2);
  assert.match(reload.document.getElementById('rateBody').innerHTML, /data-f="formula" value="MASTER\/8"/);
  assert.equal(reload.document.getElementById('narration').value, 'Restored terms');
});

test('an admin logging in on a fresh browser loads cloud formulas before rendering packaging', async () => {
  const a = app();
  a.db.admin_state = [{ key: CLOUD, value: { meta: metadata(), locks: { formula: true }, master_lock: true }, updated_at: '2026-09-11T09:00:00Z' }];
  a.db.signedIn = false;
  await a.backup.hydrateStateFromCloud();
  a.db.signedIn = true;
  assert.equal(await a.editor.check(), true);
  assert.equal(a.editor.rows()[0].formula, 'MASTER*1.5');
  assert.equal(a.document.getElementById('looseRate').value, '1000');
  assert.equal(a.local.getItem('VRCL_MASTER_LOCK'), '1');
  assert.equal(a.db.cloudWrites, 0, 'login must not overwrite cloud formulas with empty browser state');
});

test('saved cloud formulas replace an old browser cache that contains a loose rate but no packing formulas', async () => {
  const a = app();
  const cached = metadata();
  cached[keyA].rows = {};
  a.local.setItem(META, JSON.stringify(cached));
  a.db.admin_state = [{ key: CLOUD, value: { meta: metadata(), locks: {}, master_lock: false }, updated_at: '2026-09-11T12:37:05Z' }];
  assert.equal(await a.editor.check(), true);
  assert.equal(a.editor.rows()[0].formula, 'MASTER*1.5');
  assert.equal(a.editor.rows()[0].master, 'LOOSE OIL RATE');
  assert.equal(a.db.cloudWrites, 0);
});

test('a browser clock ahead of the server cannot hide restored formulas', async () => {
  const a = app();
  const cached = metadata();
  cached[keyA].rows['15 KG'].formula = 'MASTER*1';
  a.local.setItem(META, JSON.stringify(cached));
  a.local.setItem('VRCL_ADMIN_STATE_UPDATED_AT', '2099-01-01T00:00:00Z');
  a.db.admin_state = [{ key: CLOUD, value: { meta: metadata(), locks: {}, master_lock: false }, updated_at: '2026-09-11T12:37:05Z' }];
  assert.equal(await a.editor.check(), true);
  assert.equal(a.editor.rows()[0].formula, 'MASTER*1.5');
  assert.equal(a.db.cloudWrites, 0);
  assert.equal(JSON.parse(a.local.getItem('VRCL_ADMIN_FORMULA_RECOVERY_V1')).meta[keyA].rows['15 KG'].formula, 'MASTER*1');
});

test('an unsynced edit to another product is retained while restored server formulas are loaded', async () => {
  const a = app();
  const previous = metadata();
  previous[keyA].rows = {};
  const synced = { meta: previous, locks: {}, master_lock: false };
  a.local.setItem('VRCL_ADMIN_SYNCED_FORMULA_STATE_V1', JSON.stringify(synced));
  const local = clone(previous);
  local[keyB].looseRate = '1250';
  a.local.setItem(META, JSON.stringify(local));
  a.local.setItem('VRCL_ADMIN_STATE_UPDATED_AT', '2026-09-11T12:40:00Z');
  a.db.admin_state = [{ key: CLOUD, value: { meta: metadata(), locks: {}, master_lock: false }, updated_at: '2026-09-11T12:37:05Z' }];
  assert.equal(await a.editor.check(), true);
  assert.equal(a.editor.rows()[0].formula, 'MASTER*1.5');
  assert.equal(JSON.parse(a.local.getItem(META))[keyB].looseRate, '1250');
  await a.backup.syncStateToCloud();
  assert.equal(a.db.admin_state[0].value.meta[keyA].rows['15 KG'].formula, 'MASTER*1.5');
  assert.equal(a.db.admin_state[0].value.meta[keyB].looseRate, '1250');
});

test('a confirmed local formula edit survives reload before the next cloud save', async () => {
  const a = app();
  a.db.admin_state = [{ key: CLOUD, value: { meta: metadata(), locks: {}, master_lock: false }, updated_at: '2026-09-11T12:37:05Z' }];
  assert.equal(await a.editor.check(), true);
  const local = JSON.parse(a.local.getItem(META));
  local[keyA].rows['15 KG'].formula = 'MASTER*1.75';
  a.local.setItem(META, JSON.stringify(local));
  const reload = app({ db: a.db, local: a.local, session: a.session });
  assert.equal(await reload.editor.check(), true);
  assert.equal(reload.editor.rows()[0].formula, 'MASTER*1.75');
});

test('complete older V1 product backups remain compatible and cannot replace another product formula', async () => {
  const a = app();
  a.local.setItem(META, JSON.stringify(metadata()));
  const old = { format: 'VRCL_PRODUCT_BACKUP_V1', product: clone(a.db.products[1]), rates: clone(a.db.rates.filter(r => r.product_id === B)), formula_state: { meta: metadata(), locks: {}, master_lock: false } };
  old.formula_state.meta[keyA].looseRate = '1';
  const result = await a.backup.restoreProductBackup(old);
  assert.equal(result.formulas_included, true);
  assert.equal(a.db.rates.filter(r => r.product_id === B).length, 2);
  assert.equal(JSON.parse(a.local.getItem(META))[keyA].looseRate, '1000');
});

test('incomplete or mixed-product backups are rejected before any restore write', async () => {
  const a = app();
  const before = clone(a.db.rates);
  const backup = { format: 'VRCL_PRODUCT_BACKUP_V1', product: clone(a.db.products[1]), formula_state: { meta: metadata() } };
  await assert.rejects(a.backup.restoreProductBackup(backup), /missing packaging/);
  backup.rates = [];
  await assert.rejects(a.backup.restoreProductBackup(backup), /no saved packaging/);
  backup.rates = [clone(a.db.rates[0])];
  await assert.rejects(a.backup.restoreProductBackup(backup), /invalid packaging/);
  assert.equal(a.db.rpcCalls, 0);
  assert.deepEqual(a.db.rates, before);
});

test('formula persistence failure is reported, rather than a successful restore', async () => {
  const a = app();
  a.db.failCloud = true;
  const backup = { format: 'VRCL_PRODUCT_BACKUP_V1', product: clone(a.db.products[1]), rates: clone(a.db.rates.filter(r => r.product_id === B)), formula_state: { meta: metadata() } };
  await assert.rejects(a.backup.restoreProductBackup(backup), /Formula storage unavailable/);
  assert.equal(a.session.getItem(FOCUS), null);
});

test('full backup and full restore retain cloud formula settings on a fresh dashboard', async () => {
  const a = app();
  a.db.admin_state = [{ key: CLOUD, value: { meta: metadata(), locks: { packing: true }, master_lock: false }, updated_at: '2026-09-11T09:00:00Z' }];
  const backup = clone(await a.backup.buildFullBackup());
  assert.equal(backup.local_admin_state.meta[keyB].rows['5 L'].formula, 'MASTER*5');
  a.local.removeItem(META);
  a.db.rates = [];
  await a.backup.restoreFullBackup(backup);
  assert.equal(a.db.rates.length, 3);
  assert.equal(JSON.parse(a.local.getItem(META))[keyB].rows['5 L'].formula, 'MASTER*5');
});

test('a queued older cloud save finishes before restored formulas are saved', async () => {
  const a = app();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  a.db.beforeCloudWrite = async () => { delete a.db.beforeCloudWrite; entered(); await blocked; };
  const oldSave = a.backup.syncStateToCloud({ meta: {}, locks: {}, master_lock: false });
  await started;
  const restoring = a.backup.restoreProductBackup({ format: 'VRCL_PRODUCT_BACKUP_V1', product: clone(a.db.products[1]), rates: clone(a.db.rates.filter(r => r.product_id === B)), formula_state: { meta: metadata() } });
  release();
  await Promise.all([oldSave, restoring]);
  assert.equal(a.db.admin_state[0].value.meta[keyB].rows['5 L'].formula, 'MASTER*5');
  assert.equal(a.db.cloudWrites, 2);
  await settle();
});

test('a backup restores into the selected product and keeps its name, city and source data', async () => {
  const a = app();
  a.db.products[0].name = 'Palm - SPOT';
  Object.assign(a.db.products[1], { name: 'Palm - September', code: 'palm-september', customer_visible: false, ingredient_image_url: 'september.webp', header_image_url: 'september-header.webp' });
  a.local.setItem(META, JSON.stringify(metadata()));
  a.window.dispatchEvent(new Event('vrcl:admin-state-applied'));
  const targetBefore = clone(a.db.products[1]);
  const sourceBefore = clone(a.db.products[0]);
  const sourceRates = clone(a.db.rates.filter(r => r.product_id === A));
  const sourceFormula = clone(metadata()[keyA]);
  const backup = { format: 'VRCL_PRODUCT_BACKUP_V1', product: sourceBefore, rates: sourceRates, formula_state: { meta: metadata() } };
  const fileBefore = clone(backup);
  await a.editor.select('Ahmedabad', B);
  const result = await a.backup.restoreProductBackup(backup);
  assert.equal(result.product_id, B);
  assert.equal(result.product_name, 'Palm - September');
  assert.equal(result.formulas_included, true);
  assert.deepEqual(a.db.products.find(p => p.id === B), targetBefore);
  assert.deepEqual(a.db.products.find(p => p.id === A), sourceBefore);
  assert.deepEqual(a.db.rates.filter(r => r.product_id === A), sourceRates);
  const copied = a.db.rates.filter(r => r.product_id === B);
  assert.equal(copied.length, sourceRates.length);
  assert.equal(copied[0].city, 'Ahmedabad');
  assert.equal(copied[0].packing, sourceRates[0].packing);
  assert.equal(copied[0].rate, sourceRates[0].rate);
  assert.equal(copied[0].narration, sourceRates[0].narration);
  assert.notEqual(copied[0].id, sourceRates[0].id);
  assert.deepEqual(a.db.admin_state[0].value.meta[keyB], sourceFormula);
  assert.deepEqual(JSON.parse(a.local.getItem(META))[keyA], sourceFormula);
  assert.deepEqual(backup, fileBefore);
  const reload = app({ db: a.db, local: a.local, session: a.session });
  assert.equal(await reload.editor.check(), true);
  assert.equal(reload.editor.selection().product_id, B);
  assert.equal(reload.editor.rows()[0].formula, 'MASTER*1.5');
  assert.equal(reload.document.getElementById('looseRate').value, '1000');
});

test('restoring a product after renaming it keeps the current name and code', async () => {
  const a = app();
  const backup = { format: 'VRCL_PRODUCT_BACKUP_V1', product: clone(a.db.products[0]), rates: clone(a.db.rates.filter(r => r.product_id === A)), formula_state: { meta: metadata() } };
  a.db.products[0].name = 'Palm - September';
  a.db.products[0].code = 'palm-september';
  await a.editor.select('Rajkot', A);
  const result = await a.backup.restoreProductBackup(backup);
  assert.equal(result.product_name, 'Palm - September');
  assert.equal(a.db.products.find(p => p.id === A).code, 'palm-september');
  assert.equal(a.db.rates.find(r => r.product_id === A).id, backup.rates[0].id);
  assert.equal(a.db.admin_state[0].value.meta[keyA].rows['15 KG'].formula, 'MASTER*1.5');
});

test('the confirmation identifies the frozen destination and cancellation does not restore anything', async () => {
  const a = app();
  const backup = { format: 'VRCL_PRODUCT_BACKUP_V1', product: clone(a.db.products[0]), rates: clone(a.db.rates.filter(r => r.product_id === A)), formula_state: { meta: metadata() } };
  await a.editor.select('Ahmedabad', B);
  const target = clone(a.editor.selection());
  await a.editor.select('Rajkot', A);
  let prompt;
  a.manager.confirm = message => { prompt = message; return false; };
  const before = clone(a.db.rates);
  const result = await a.backup.restoreProductBackup(backup, target, { confirmRestore: true });
  assert.equal(result, null);
  assert.match(prompt, /"Groundnut" backup into "Cotton" \(Ahmedabad\)/);
  assert.equal(a.db.rpcCalls, 0);
  assert.equal(a.db.cloudWrites, 0);
  assert.deepEqual(a.db.rates, before);
});

test('a removed destination never falls back to overwriting the backup source product', async () => {
  const a = app();
  const backup = { format: 'VRCL_PRODUCT_BACKUP_V1', product: clone(a.db.products[0]), rates: clone(a.db.rates.filter(r => r.product_id === A)), formula_state: { meta: metadata() } };
  await a.editor.select('Ahmedabad', B);
  const target = clone(a.editor.selection());
  a.db.products[1].active = false;
  await assert.rejects(a.backup.restoreProductBackup(backup, target), /no longer available/);
  assert.equal(a.db.rpcCalls, 0);
});

async function referenceApp(state = metadata(), db = fixture()) {
  db.admin_state = [{ key:CLOUD, value:{meta:clone(state),locks:{},master_lock:false}, updated_at:'2026-09-12T08:00:00Z' }];
  const a=app({db});
  assert.equal(await a.editor.check(),true);
  return a;
}
async function linkTo(a, city, productId, sourceCity, sourceId) {
  await a.editor.select(city,productId);
  a.document.getElementById('looseRefMode').value='reference';
  await a.document.getElementById('looseRefMode').onchange();
  a.document.getElementById('looseRefCity').value=sourceCity;
  await a.document.getElementById('looseRefCity').onchange();
  a.document.getElementById('looseRefProduct').value=sourceId;
  await a.document.getElementById('looseRefProduct').onchange();
}

test('reference selection waits for an explicit product and preserves both products formulas', async () => {
  const a=await referenceApp();
  await a.editor.select('Ahmedabad',B);
  const before=clone(a.db.admin_state[0].value.meta);
  a.document.getElementById('looseRefMode').value='reference';
  await a.document.getElementById('looseRefMode').onchange();
  assert.equal(a.db.cloudWrites,0);
  assert.equal(a.db.admin_state[0].value.meta[keyB].looseReference,undefined);
  await a.document.getElementById('saveAll').onclick();
  assert.equal(a.db.rateWrites||0,0,'an incomplete source selection cannot publish rates');
  a.document.getElementById('looseRefProduct').value=A;
  await a.document.getElementById('looseRefProduct').onchange();
  assert.deepEqual(a.db.admin_state[0].value.meta[keyB].looseReference,{city:'Rajkot',productId:A});
  assert.deepEqual(a.db.admin_state[0].value.meta[keyA],before[keyA]);
  assert.deepEqual(a.db.admin_state[0].value.meta[keyB].rows,before[keyB].rows);
  assert.equal(Number(a.document.getElementById('looseRate').value),1000);
  assert.equal(a.document.getElementById('looseRate').disabled,true);
  assert.equal(a.db.rateWrites||0,0,'configuring a reference does not publish customer prices');
});

test('the reference lock persists while source rates keep flowing through unchanged formulas', async () => {
  const a=await referenceApp();
  await linkTo(a,'Ahmedabad',B,'Rajkot',A);
  await a.document.getElementById('looseRefLock').onclick();
  assert.equal(a.db.admin_state[0].value.meta[keyB].looseReferenceLocked,true);
  assert.equal(a.document.getElementById('looseRefMode').disabled,true);
  const reload=app({db:a.db,local:a.local});
  assert.equal(await reload.editor.check(),true);
  await reload.editor.select('Ahmedabad',B);
  assert.equal(reload.document.getElementById('looseRefLock').textContent,'🔒 REFERENCE LOCKED');
  reload.document.getElementById('looseRefMode').value='manual';
  await reload.document.getElementById('looseRefMode').onchange();
  assert.deepEqual(JSON.parse(reload.local.getItem(META))[keyB].looseReference,{city:'Rajkot',productId:A});
  await reload.editor.select('Rajkot',A);
  reload.document.getElementById('looseRate').oninput({target:{value:'1100'}});
  reload.db.products[0].name='Renamed source';
  await reload.editor.select('Ahmedabad',B);
  assert.equal(Number(reload.document.getElementById('looseRate').value),1100);
  assert.match(reload.document.getElementById('looseRefStatus').textContent,/Renamed source/);
  assert.equal(reload.document.getElementById('looseRefMode').disabled,true);
  assert.deepEqual(clone(reload.editor.rows().map(r=>r.formula)),['MASTER/10','MASTER*5']);
});

test('unlocking and removing a reference keeps the resolved loose value as a manual rate', async () => {
  const a=await referenceApp();
  await linkTo(a,'Ahmedabad',B,'Rajkot',A);
  await a.document.getElementById('looseRefLock').onclick();
  await a.document.getElementById('looseRefLock').onclick();
  a.document.getElementById('looseRefMode').value='manual';
  await a.document.getElementById('looseRefMode').onchange();
  const value=a.db.admin_state[0].value.meta[keyB];
  assert.equal(value.looseReference,undefined);
  assert.equal(value.looseRate,'1000');
  assert.deepEqual(value.rows,metadata()[keyB].rows);
  assert.equal(a.document.getElementById('looseRate').disabled,false);
});

test('failed reference saves roll back the reference without losing formulas or the old manual rate', async () => {
  const a=await referenceApp();
  await linkTo(a,'Ahmedabad',B,'Rajkot',A);
  const before=clone(a.db.admin_state[0].value.meta[keyB]);
  a.db.failCloud=true;
  a.document.getElementById('looseRefMode').value='manual';
  await a.document.getElementById('looseRefMode').onchange();
  assert.deepEqual(JSON.parse(a.local.getItem(META))[keyB],before);
  assert.match(a.document.getElementById('toast').textContent,/Reference not saved/);
});

test('SAVE ALL atomically recalculates same-city and cross-city dependants with their own formulas', async () => {
  const C='33333333-3333-4333-8333-333333333333',keyC='Rajkot|'+C,db=fixture(),state=metadata();
  db.products.push({id:C,code:'visvita',name:'VISVITA',city:'Rajkot',active:true,sort_order:3});
  db.rates.push({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',city:'Rajkot',product_id:C,packing:'15 KG',rate:1800,narration:'Visvita own terms',sort_order:1});
  state[keyC]={looseRate:'1300',looseReference:{city:'Rajkot',productId:A},looseReferenceLocked:true,rows:{'15 KG':{master:'LOOSE OIL RATE',formula:'MASTER*1.5',extra:15,round:1}}};
  state[keyB].looseReference={city:'Rajkot',productId:C};
  const a=await referenceApp(state,db);
  const before=clone(db.rates);
  a.document.getElementById('looseRate').oninput({target:{value:'1100'}});
  await a.document.getElementById('saveAll').onclick();
  assert.equal(a.db.rateWrites,1,'all product rate rows use one atomic upsert');
  assert.equal(a.db.rates.find(r=>r.product_id===A).rate,1650);
  assert.equal(a.db.rates.find(r=>r.product_id===C).rate,1665,'Visvita retains its own extra costing');
  assert.equal(a.db.rates.find(r=>r.product_id===B&&r.packing==='1 L').rate,110);
  assert.equal(a.db.rates.find(r=>r.product_id===B&&r.packing==='5 L').rate,550);
  for(const original of before){const saved=a.db.rates.find(r=>r.id===original.id);assert.equal(saved.narration,original.narration);assert.equal(saved.packing,original.packing)}
  for(const key of [keyA,keyB,keyC])assert.deepEqual(a.db.admin_state[0].value.meta[key].rows,state[key].rows);
  assert.equal(a.db.admin_state[0].value.meta[keyC].looseReferenceLocked,true);
  assert.equal(a.db.rate_history.length,3);
  assert.match(a.document.getElementById('toast').textContent,/2 LINKED PRODUCTS/);
});

test('a missing formula in a dependant stops publication before any source or linked rate is written', async () => {
  const state=metadata();state[keyB].looseReference={city:'Rajkot',productId:A};delete state[keyB].rows['5 L'];
  const a=await referenceApp(state),before=clone(a.db.rates);
  a.document.getElementById('looseRate').oninput({target:{value:'1100'}});
  await a.document.getElementById('saveAll').onclick();
  assert.equal(a.db.rateWrites||0,0);
  assert.deepEqual(a.db.rates,before);
  assert.match(a.document.getElementById('toast').textContent,/saved formula missing for 5 L/);
});

test('a database rate error leaves every source and linked published rate unchanged', async () => {
  const state=metadata();state[keyB].looseReference={city:'Rajkot',productId:A};
  const a=await referenceApp(state),before=clone(a.db.rates);a.db.failRates=true;
  a.document.getElementById('looseRate').oninput({target:{value:'1100'}});
  await a.document.getElementById('saveAll').onclick();
  assert.deepEqual(a.db.rates,before);
  assert.match(a.document.getElementById('toast').textContent,/Rates not saved/);
});

test('missing sources and reference cycles show a source error and cannot publish zero prices', async () => {
  for(const source of [{city:'Rajkot',productId:A},{city:'Ahmedabad',productId:B}]){
    const state=metadata(),db=fixture();state[keyB].looseReference=source;
    if(source.productId===A)db.products[0].active=false;
    const a=await referenceApp(state,db);await a.editor.select('Ahmedabad',B);
    assert.equal(a.document.getElementById('pvDiff').textContent,'SOURCE ERROR');
    assert.match(a.document.getElementById('rateBody').innerHTML,/SOURCE ERROR/);
    await a.document.getElementById('saveAll').onclick();
    assert.equal(a.db.rateWrites||0,0);
  }
});

test('full backup and restore retain loose reference configuration and its lock', async () => {
  const a=await referenceApp();await linkTo(a,'Ahmedabad',B,'Rajkot',A);await a.document.getElementById('looseRefLock').onclick();
  const snapshot=clone(await a.backup.buildFullBackup());
  assert.deepEqual(snapshot.local_admin_state.meta[keyB].looseReference,{city:'Rajkot',productId:A});
  assert.equal(snapshot.local_admin_state.meta[keyB].looseReferenceLocked,true);
  await a.backup.restoreFullBackup(snapshot);
  assert.deepEqual(a.db.admin_state[0].value.meta[keyB],snapshot.local_admin_state.meta[keyB]);
});
