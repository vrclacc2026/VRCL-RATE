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


const pendingPublications = new WeakSet();

export function confirmFinalPublication(rates, history, deletions = []) {
  // Copy the computed payload before asking, so later edits cannot change it.
  const request = JSON.parse(JSON.stringify({ rates, history, deletions }));
  if (!request.rates.length || !request.history.length) throw new Error('No rates to publish.');
  const sections = request.history.map(group => {
    const rows = request.rates.filter(r => r.city === group.city && r.product_id === group.product_id);
    const loose = group.snapshot?.loose_rate;
    return [
      group.city + ' / ' + (group.snapshot?.product_name || 'Product'),
      loose == null ? '' : 'Loose / 10 KG: ₹' + rateLabel(loose),
      ...rows.slice(0, 8).map(r => r.packing + ': ₹' + rateLabel(r.rate)),
      rows.length > 8 ? '...and ' + (rows.length - 8) + ' more packings' : ''
    ].filter(Boolean).join('\n');
  });
  const accepted = window.confirm([
    'PUBLISH FINAL',
    'These exact rates will be saved for customers and recorded as FINAL.',
    '',
    ...sections,
    '',
    request.history.length + ' product(s), ' + request.rates.length + ' packing rate(s).',
    'For testing, Cancel and use TEST PREVIEW. Publish these final rates?'
  ].join('\n\n'));
  if (!accepted) return null;
  const publication = { ...request, publishId: crypto.randomUUID() };
  pendingPublications.add(publication);
  return publication;
}

export async function publishFinalRates(client, publication) {
  if (!publication || !pendingPublications.has(publication)) {
    throw new Error('Confirm PUBLISH FINAL before saving rates.');
  }
  pendingPublications.delete(publication);
  const { data, error } = await client.rpc('publish_final_rates_v1', {
    p_publish_id: publication.publishId,
    p_rates: publication.rates,
    p_history: publication.history,
    p_deletions: publication.deletions
  });
  if (error) throw error;
  if (data?.publish_id !== publication.publishId ||
      data?.rates_count !== publication.rates.length ||
      data?.history_count !== publication.history.length) {
    throw new Error('Final publish acknowledgement is incomplete. Reload and check history before trying again.');
  }
  const notice = document.getElementById('publishNotice');
  if (notice) notice.textContent = 'FINAL SAVED — rates and history were saved together. Google Sheet updates through its automatic data link.';
  return data;
}
