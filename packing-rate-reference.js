const productKey = product => product && product.city + '|' + product.id;
const packingKey = value => String(value ?? '').trim().toLocaleUpperCase('en-IN');

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

// Returns dependants in calculation order. The input can contain more than one
// changed product because a loose-rate update may first recalculate other products.
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

// In packing-reference mode the source product's published rate for the same
// packing becomes MASTER. The target keeps its own formula, extra and round-off.
export function calculatePackingReferencedRates({ meta, product, rates, sourceRates, calcFormula, applyExtraCost, roundPackingValue }) {
  const targetKey = productKey(product), settings = meta[targetKey]?.rows || {};
  const sourceByPacking = new Map();
  for (const row of sourceRates || []) {
    const key = packingKey(row.packing), value = Number(row.rate);
    if (!key || sourceByPacking.has(key) || !Number.isFinite(value)) throw new Error(product.name + ': invalid source packing data');
    sourceByPacking.set(key, value);
  }
  const seen = new Set();
  return (rates || []).map(row => {
    const key = packingKey(row.packing), setting = settings[row.packing];
    if (row.city !== product.city || row.product_id !== product.id || !key || seen.has(key)) throw new Error(product.name + ': invalid packing data');
    seen.add(key);
    if (!setting || typeof setting.formula !== 'string') throw new Error(product.name + ': saved formula missing for ' + row.packing);
    if (!sourceByPacking.has(key)) throw new Error(product.name + ': source has no matching rate for ' + row.packing);
    const master = sourceByPacking.get(key);
    const subtotal = calcFormula(setting.formula || 'MASTER*1', master);
    const value = roundPackingValue(applyExtraCost ? applyExtraCost(subtotal, setting.extra) : subtotal + Number(setting.extra || 0), setting.round || 0);
    if (!Number.isFinite(value)) throw new Error(product.name + ': invalid calculated rate');
    return { city: row.city, product_id: row.product_id, packing: row.packing, rate: value, narration: row.narration, sort_order: row.sort_order };
  });
}
