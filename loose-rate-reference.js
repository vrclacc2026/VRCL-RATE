// References supply only the loose input. Each product keeps its own packing formulas.
export function looseReferenceKey(reference) {
  return reference && typeof reference.city === 'string' && typeof reference.productId === 'string'
    ? reference.city + '|' + reference.productId : '';
}

export function resolveLooseRate(meta, productKey, products) {
  const chain = [], seen = new Set();
  let current = productKey;
  while (current) {
    if (seen.has(current)) return { value: null, error: 'Loose rate reference cycle', chain };
    seen.add(current); chain.push(current);
    const state = meta[current];
    if (!state) return { value: null, error: 'Loose rate source settings are missing', chain };
    if (current !== productKey && products && !products.some(p => p.active !== false && p.city + '|' + p.id === current)) {
      return { value: null, error: 'Loose rate source product is unavailable', chain };
    }
    if (!state.looseReference) {
      const value = Number(state.looseRate || 0);
      return Number.isFinite(value) ? { value, error: null, chain } : { value: null, error: 'Loose rate source is invalid', chain };
    }
    current = looseReferenceKey(state.looseReference);
    if (!current) return { value: null, error: 'Choose a valid loose rate source', chain };
  }
  return { value: null, error: 'Choose a valid loose rate source', chain };
}

export function canReferenceLooseRate(meta, targetKey, sourceKey, products) {
  if (!sourceKey || targetKey === sourceKey) return false;
  const source = resolveLooseRate(meta, sourceKey, products);
  return !source.error && !source.chain.includes(targetKey);
}

export function looseRateDependants(meta, sourceKey, products) {
  return products.filter(product => {
    const targetKey = product.city + '|' + product.id;
    if (targetKey === sourceKey || product.active === false || !meta[targetKey]?.looseReference) return false;
    const seen = new Set();
    let current = targetKey;
    while (current && !seen.has(current)) {
      seen.add(current);
      current = looseReferenceKey(meta[current]?.looseReference);
      if (current === sourceKey) return true;
    }
    return false;
  });
}

// Both calculation callbacks are the unchanged functions from the existing admin page.
export function calculateReferencedRates({ meta, product, rates, products, calcFormula, applyExtraCost, roundPackingValue }) {
  const productKey = product.city + '|' + product.id;
  const loose = resolveLooseRate(meta, productKey, products);
  if (loose.error) throw new Error(product.name + ': ' + loose.error);
  const settings = meta[productKey]?.rows || {};
  const names = new Map();
  for (const [index, row] of rates.entries()) {
    if (row.city !== product.city || row.product_id !== product.id || names.has(row.packing)) throw new Error(product.name + ': invalid packing data');
    if (!settings[row.packing] || typeof settings[row.packing].formula !== 'string') throw new Error(product.name + ': saved formula missing for ' + row.packing);
    names.set(row.packing, index);
  }
  const cached = new Map();
  function evaluateRow(index, seen = new Set()) {
    if (seen.has(index)) throw new Error(product.name + ': packing master link cycle');
    if (cached.has(index)) return cached.get(index);
    const row = rates[index], setting = settings[row.packing];
    const chain = new Set(seen); chain.add(index);
    let master = loose.value;
    if (setting.master && setting.master !== 'LOOSE OIL RATE') {
      if (!names.has(setting.master)) throw new Error(product.name + ': packing master is missing for ' + row.packing);
      master = evaluateRow(names.get(setting.master), chain);
    }
    const subtotal = calcFormula(setting.formula || 'MASTER*1', master);
    const value = roundPackingValue(applyExtraCost ? applyExtraCost(subtotal, setting.extra) : subtotal + Number(setting.extra || 0), setting.round || 0);
    if (!Number.isFinite(value)) throw new Error(product.name + ': invalid calculated rate');
    cached.set(index, value);
    return value;
  }
  return rates.map((row, index) => ({
    city: row.city, product_id: row.product_id, packing: row.packing,
    rate: evaluateRow(index), narration: row.narration, sort_order: row.sort_order
  }));
}
