const CITY_SELECTOR = '.city.active';
const PRODUCT_SELECTOR = '#productArea .productBtn.active';
const SAVE_SELECTOR = '#saveAll';

function rateLabel(value) {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(value ?? '').trim();
}

function collectPreview() {
  const city = document.querySelector(CITY_SELECTOR)?.dataset.city || 'Selected city';
  const product = document.querySelector(PRODUCT_SELECTOR)?.textContent?.trim() || 'Selected product';
  const changes = [...document.querySelectorAll('#rateBody tr')].map(row => {
    const packing = row.querySelector('.packingField')?.value?.trim() || row.querySelector('td')?.textContent?.trim();
    const oldRate = row.querySelector('.oldRateField')?.value;
    const newRate = row.querySelector('.newRate')?.value;
    if (!packing || newRate == null || !String(newRate).trim() || /SOURCE ERROR|CYCLE|ERROR/i.test(newRate)) return null;
    const oldValue = Number(oldRate);
    const newValue = Number(String(newRate).replace(/,/g, ''));
    if (!Number.isFinite(newValue) || (Number.isFinite(oldValue) && Math.abs(oldValue - newValue) < 0.005)) return null;
    return { packing, oldValue, newValue };
  }).filter(Boolean);
  return { city, product, changes };
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
    'For a test, cancel here. The calculated rates shown in the editor are preview only.',
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

document.addEventListener('click', askToPublish, true);
document.addEventListener('DOMContentLoaded', () => {
  const notice = document.getElementById('publishNotice');
  if (notice) notice.textContent = 'Preview only while editing. Live rates change only after you confirm Publish Final.';
});
