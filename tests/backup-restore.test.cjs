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
    async execute(single) {
      if (this.payload) {
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
  const editor = vm.createContext({ ...shared, hydrateStateFromCloud: manager.backupTest.hydrateStateFromCloud });
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
  await a.editor.select('Rajkot', A);
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
