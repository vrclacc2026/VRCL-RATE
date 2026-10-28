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

function askToPublish(event) {
  const button = event.target?.closest?.(SAVE_SELECTOR);
  if (!button) return;
  const { city, product, changes } = collectPreview();
  const summary = changes.length
    ? changes.slice(0, 12).map(row => `• ${row.packing}: ₹${rateLabel(row.oldValue)} → ₹${rateLabel(row.newValue)}`).join('\n') +
      (changes.length > 12 ? `\n…plus ${changes.length - 12} more changes` : '')
    : 'No rate differences detected. Formula, packaging, or narration changes may still be saved.';
  const message = [
    'FINAL PUBLISH — this changes live customer rates and adds rate history.',
    '',
    `${city} / ${product}`,
    summary,
    '',
    'For a test, cancel here and use TEST PREVIEW.',
    'Continue and publish these rates to customers?'
  ].join('\n');
  if (!window.confirm(message)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const notice = document.getElementById('publishNotice');
    if (notice) notice.textContent = 'Test preview only — live rates, history, and Google Sheet were not changed.';
    return;
  }
  const notice = document.getElementById('publishNotice');
  if (notice) notice.textContent = 'Publishing final rates… wait for the confirmed save message.';
}

document.addEventListener('click', event => {
  const testButton = event.target?.closest?.('#testPreview');
  if (!testButton) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  showTestPreview();
}, true);
document.addEventListener('click', askToPublish, true);
