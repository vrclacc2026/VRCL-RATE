const CITY_SELECTOR = '.city.active';
const PRODUCT_SELECTOR = '#productArea .productBtn.active';
const SAVE_SELECTOR = '#saveAll';

function rateLabel(value) {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(value ?? '').trim();
}

function collectRows() {
  return [...document.querySelectorAll('#rateBody tr')].map(row => {
    const packing = row.querySelector('.packingField')?.value?.trim() || row.querySelector('td')?.textContent?.trim();
    const oldRate = row.querySelector('.oldRateField')?.value;
    const newRate = row.querySelector('.newRate')?.value;
    if (!packing || newRate == null) return null;
    return { packing, oldRate, newRate };
  }).filter(Boolean);
}

function collectPreview() {
  const city = document.querySelector(CITY_SELECTOR)?.dataset.city || 'Selected city';
  const product = document.querySelector(PRODUCT_SELECTOR)?.textContent?.trim() || 'Selected product';
  const changes = collectRows().map(row => {
    if (!String(row.newRate).trim() || /SOURCE ERROR|CYCLE|ERROR/i.test(row.newRate)) return null;
    const oldValue = Number(row.oldRate);
    const newValue = Number(String(row.newRate).replace(/,/g, ''));
    if (!Number.isFinite(newValue) || (Number.isFinite(oldValue) && Math.abs(oldValue - newValue) < 0.005)) return null;
    return { packing: row.packing, oldValue, newValue };
  }).filter(Boolean);
  return { city, product, changes };
}

function showTestPreview() {
  const city = document.querySelector(CITY_SELECTOR)?.dataset.city || 'Selected city';
  const product = document.querySelector(PRODUCT_SELECTOR)?.textContent?.trim() || 'Selected product';
  const rows = collectRows();
  if (!rows.length) {
    window.alert('Rate rows are still loading. Wait for them to finish, then open Test Preview.');
    return;
  }
  document.getElementById('rateTestPreviewModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rateTestPreviewModal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Test rate preview');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '20000', background: '#101827bb',
    display: 'grid', placeItems: 'center', padding: '16px'
  });
  const card = document.createElement('div');
  Object.assign(card.style, {
    width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto',
    background: '#fff', borderRadius: '16px', padding: '18px',
    boxShadow: '0 24px 72px #0006', fontFamily: 'Arial, sans-serif', color: '#101827'
  });
  const title = document.createElement('div');
  title.textContent = 'TEST PREVIEW — NOT LIVE';
  Object.assign(title.style, {fontSize:'16px',fontWeight:'900',color:'#a15c00',marginBottom:'6px'});
  const sub = document.createElement('div');
  sub.textContent = city + ' / ' + product;
  Object.assign(sub.style, {fontSize:'14px',fontWeight:'700',marginBottom:'12px'});
  const note = document.createElement('div');
  note.textContent = 'This preview is only on this screen. It does not change customer rates, rate history, or Google Sheet.';
  Object.assign(note.style, {fontSize:'12px',lineHeight:'1.45',background:'#fff8df',padding:'10px',borderRadius:'8px',marginBottom:'12px'});
  const table = document.createElement('table');
  Object.assign(table.style, {width:'100%',borderCollapse:'collapse',fontSize:'13px'});
  const head = document.createElement('thead');
  head.innerHTML = '<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">Packing</th><th style="text-align:right;padding:8px;border-bottom:1px solid #ddd">Preview rate</th></tr>';
  table.appendChild(head);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const packing = document.createElement('td');
    packing.textContent = row.packing;
    Object.assign(packing.style, {padding:'8px',borderBottom:'1px solid #eee'});
    const value = document.createElement('td');
    value.textContent = /SOURCE ERROR|CYCLE|ERROR/i.test(String(row.newRate)) ? String(row.newRate) : '₹ ' + rateLabel(row.newRate);
    value.style.textAlign = 'right';
    value.style.padding = '8px';
    value.style.borderBottom = '1px solid #eee';
    tr.append(packing, value);
    body.appendChild(tr);
  }
  table.appendChild(body);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close preview';
  Object.assign(close.style, {marginTop:'14px',padding:'10px 14px',border:0,borderRadius:'8px',background:'#087f70',color:'#fff',fontWeight:'800',cursor:'pointer'});
  close.addEventListener('click', () => overlay.remove());
  card.append(title, sub, note, table, close);
  overlay.appendChild(card);
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  close.focus();
}

document.addEventListener('click', event => {
  const testButton = event.target?.closest?.('#testPreview');
  if (!testButton) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  showTestPreview();
}, true);


export function prepareRateSave(rates, history, deletions = []) {
  const request = JSON.parse(JSON.stringify({ rates, history, deletions }));
  if (!request.rates.length || !request.history.length) throw new Error('No packing rates to save.');
  request.rates = request.rates.map(row => ({ ...row, rate: Math.round((Number(row.rate) + Number.EPSILON) * 100) / 100 }));
  return { ...request, publishId: crypto.randomUUID() };
}

export async function saveRatesAndVerify(client, request) {
  if (!request?.publishId) throw new Error('Missing save request.');
  const { data, error } = await client.rpc('publish_final_rates_v1', {
    p_publish_id: request.publishId, p_rates: request.rates,
    p_history: request.history, p_deletions: request.deletions
  });
  if (error) throw error;
  if (data?.publish_id !== request.publishId ||
      data?.rates_count !== request.rates.length ||
      data?.history_count !== request.history.length)
    throw new Error('Save acknowledgement incomplete. Reload and check history before retrying.');
  // Rate Check reads this same rates table. Verify every source and linked product
  // after commit, including deletions, before showing the green success message.
  const groups = new Map();
  for (const row of request.rates) {
    const key = row.city + '|' + row.product_id;
    if (!groups.has(key)) groups.set(key, { city: row.city, productId: row.product_id, expected: new Map() });
    groups.get(key).expected.set(row.packing, Number(row.rate));
  }
  for (const group of groups.values()) {
    const { data: saved, error: readError } = await client.from('rates')
      .select('packing,rate').eq('city', group.city).eq('product_id', group.productId);
    if (readError) throw new Error('Rates saved, but Rate Check verification could not read ' + group.city + ': ' + readError.message);
    const actual = new Map((saved || []).map(r => [r.packing, Number(r.rate)]));
    for (const [packing, expected] of group.expected) {
      if (!actual.has(packing) || Math.abs(actual.get(packing) - expected) > 0.001)
        throw new Error('Rates saved, but Rate Check mismatch: ' + group.city + ' / ' + packing + '. Reload and inspect before another save.');
    }
  }
  for (const removed of request.deletions || []) {
    const { data: saved, error: readError } = await client.from('rates')
      .select('id').eq('city', removed.city).eq('product_id', removed.product_id)
      .eq('packing', removed.packing).maybeSingle();
    if (readError || saved) throw new Error('Rates saved, but deleted packing still appears in Rate Check: ' + removed.city + ' / ' + removed.packing);
  }
  const notice = document.getElementById('publishNotice');
  if (notice) notice.textContent = 'SAVED & VERIFIED — Admin and Rate Check use the same saved rates. Google Sheet upload is separate.';
  return data;
}
