const productKey = product => product && product.city + '|' + product.id;
export const packingKey = value => String(value ?? '').trim().toLocaleUpperCase('en-IN')
  .replace(/(\d)\s*(KG|LTR|LITRE|LITER|L)\b/g, '$1 $2')
  .replace(/\b(NEW|N)\s+TIN\b/g, 'N TIN').replace(/\b(OLD|S)\s+TIN\b/g, 'S TIN')
  .replace(/\s+/g, ' ');

// Names are display labels. Retain rename aliases so references survive a rename.
export function createPackingSourceMap(rates, settings = {}) {
  const result = new Map();
  for (const row of rates || []) {
    if (!packingKey(row.packing) || !Number.isFinite(Number(row.rate))) throw new Error('Invalid source packing data');
    const aliases = [row.packing, row.originalPacking, ...(settings[row.packing]?.packingAliases || [])].filter(Boolean);
    for (const name of aliases) {
      const key = packingKey(name);
      if (result.has(key) && result.get(key) !== row) throw new Error('Ambiguous source packing: ' + name);
      result.set(key, row);
    }
  }
  return result;
}
export function packingSourceName(row, setting = {}) {
  return setting.sourcePacking || row.originalPacking || row.packing;
}
export function mergeReferencedPackings(rates, sourceRates, settings = {}, sourceSettings = {}, excluded = []) {
  const sourceMap = createPackingSourceMap(sourceRates, sourceSettings);
  const used = new Set((rates || []).map(row => sourceMap.get(packingKey(packingSourceName(row, settings[row.packing])))).filter(Boolean));
  const omitted = new Set(excluded.map(packingKey));
  for (const name of omitted) { const row = sourceMap.get(name); if (row) used.add(row); }
  return [...(rates || []), ...(sourceRates || []).filter(row => !used.has(row) && !omitted.has(packingKey(row.packing)))];
}

export function packingReferenceKey(reference) {
  return reference && typeof reference.city === 'string' && typeof reference.productId === 'string'
    ? reference.city + '|' + reference.productId : '';
}

export function resolvePackingReference(meta, targetKey, products) {
  const reference = meta[targetKey]?.packingRateReference;
  if (!reference) return { source: null, sourceKey: '', error: null, chain: [targetKey] };
  const sourceKey = packingReferenceKey(reference);
  if (!sourceKey) return { source: null, sourceKey: '', error: 'Choose a valid packing rate source', chain: [targetKey] };
  const byKey = new Map((products || []).filter(p => p.active !== false).map(p => [productKey(p), p]));
  const source = byKey.get(sourceKey);
  if (!source) return { source: null, sourceKey, error: 'Packing rate source product is unavailable', chain: [targetKey, sourceKey] };

  const chain = [targetKey], seen = new Set(chain);
  let current = sourceKey;
  while (current) {
    if (seen.has(current)) return { source, sourceKey, error: 'Packing rate reference cycle', chain };
    seen.add(current); chain.push(current);
    const next = packingReferenceKey(meta[current]?.packingRateReference);
    if (!next) break;
    if (!byKey.has(next)) return { source, sourceKey, error: 'Packing rate source product is unavailable', chain: [...chain, next] };
    current = next;
  }
  return { source, sourceKey, error: null, chain };
}

export function canReferencePackingRates(meta, targetKey, sourceKey, products) {
  if (!sourceKey || targetKey === sourceKey) return false;
  const source = (products || []).find(p => p.active !== false && productKey(p) === sourceKey);
  if (!source) return false;
  const resolution = resolvePackingReference(meta, sourceKey, products);
  return !resolution.error && !resolution.chain.includes(targetKey);
}

export function packingRateDependants(meta, changedKeys, products) {
  const reached = new Set(Array.isArray(changedKeys) ? changedKeys : [changedKeys]);
  const result = [], pending = (products || []).filter(p => p.active !== false && !reached.has(productKey(p)));
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const product = pending[index], targetKey = productKey(product);
      const sourceKey = packingReferenceKey(meta[targetKey]?.packingRateReference);
      if (!sourceKey || !reached.has(sourceKey)) continue;
      result.push(product); reached.add(targetKey); pending.splice(index, 1); changed = true;
    }
  }
  return result;
}

// Udaan normally mirrors Ahmedabad packings, but an admin may explicitly delete
// individual Udaan packings. Those exclusions are persisted in admin_state and must
// be respected here so Ahmedabad recalculation can never recreate them.
export function calculatePackingReferencedRates({ meta, product, rates, sourceRates, calcFormula, applyExtraCost, roundPackingValue }) {
  const targetKey = productKey(product), settings = meta[targetKey]?.rows || {}, udaan = product?.city === 'Udaan';
  const excluded = new Set((Array.isArray(meta[targetKey]?.excludedPackings) ? meta[targetKey].excludedPackings : []).map(packingKey));
  const sourceSettings = meta[packingReferenceKey(meta[targetKey]?.packingRateReference)]?.rows || {};
  const sourceByPacking = createPackingSourceMap(sourceRates, sourceSettings);
  const targetRows = udaan
    ? mergeReferencedPackings(rates, sourceRates, settings, sourceSettings, [...excluded]).map((row, index) =>
        row.city === product.city && row.product_id === product.id ? row : ({
          city: product.city, product_id: product.id, packing: row.packing, rate: 0,
          narration: rates?.[0]?.narration || '', sort_order: row.sort_order ?? index + 1
        }))
    : (rates || []);

  const names = new Map();
  for (const [index,row] of targetRows.entries()) {
    const key = packingKey(row.packing);
    if (row.city !== product.city || row.product_id !== product.id || !key || names.has(row.packing)) throw new Error(product.name + ': invalid packing data');
    names.set(row.packing,index);
  }

  const cache = new Map();
  function evaluate(index, seen = new Set()) {
    if (cache.has(index)) return cache.get(index);
    if (seen.has(index)) throw new Error(product.name + ': packing master link cycle');
    const row = targetRows[index], setting = settings[row.packing] || {};
    const chain = new Set(seen); chain.add(index);
    let master,formula;
    const masterName = setting.master;
    const usesSamePackingSource = udaan && (!masterName || masterName === 'AHMEDABAD SAME PACKING');
    if (usesSamePackingSource) {
      const key = packingKey(packingSourceName(row, setting));
      if (!sourceByPacking.has(key)) throw new Error(product.name + ': source has no matching rate for ' + row.packing);
      master = Number(sourceByPacking.get(key).rate);
    } else if (masterName && masterName !== 'LOOSE OIL RATE') {
      if (!names.has(masterName)) throw new Error(product.name + ': packing master is missing for ' + row.packing);
      master = evaluate(names.get(masterName), chain);
    } else {
      const key = packingKey(packingSourceName(row, setting));
      if (!sourceByPacking.has(key)) throw new Error(product.name + ': source has no matching rate for ' + row.packing);
      master = Number(sourceByPacking.get(key).rate);
    }
    formula = typeof setting.formula === 'string' ? setting.formula : 'MASTER*1';
    if (!udaan && typeof setting.formula !== 'string') throw new Error(product.name + ': saved formula missing for ' + row.packing);
    const effectiveFormula = udaan && /^\\s*\\d+(?:\\.\\d+)?%\\s*$/.test(formula) ? 'MASTER+' + formula : formula;
    const subtotal = calcFormula(effectiveFormula || 'MASTER*1', master);
    const calculated = applyExtraCost ? applyExtraCost(subtotal, setting.extra) : subtotal + Number(setting.extra || 0);
    const value = roundPackingValue(calculated, setting.round ?? 0);
    if (!Number.isFinite(value) || value <= 0 || master <= 0 || (master > 1 && value < 1)) throw new Error(product.name + ': invalid calculated rate for ' + row.packing);
    cache.set(index,value); return value;
  }

  return targetRows.map((row,index)=>({
    city:row.city,
    product_id:row.product_id,
    packing:row.packing,
    rate:evaluate(index),
    narration:row.narration,
    sort_order:row.sort_order
  }));
}
