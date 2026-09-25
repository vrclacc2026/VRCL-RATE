// Rate history is exported from saved snapshots; no product formulas are recalculated.
export const HISTORY_PACKINGS = [
  '15 KG NEW TIN', '15 KG OLD TIN', '15 LTR NEW TIN', '15 LTR OLD TIN',
  '15 LTR TAP JAR', '15 LTR BUCKET', '5 LTR JAR', '2 LTR JAR',
  '1 LTR BOTTLE', '1 LTR POUCH', '500 ML BOTTLE', '500 ML POUCH'
];

export async function fetchRateHistory(supabase) {
  const records = [];
  let lastId = 0;
  while (true) {
    const { data, error } = await supabase.from('rate_history').select('*')
      .gte('changed_at', '2026-09-19T18:30:00Z')
      .gt('id', lastId).order('id', { ascending: true }).limit(500);
    if (error) throw error;
    const page = data || [];
    for (const record of page) {
      if (!Number.isSafeInteger(record.id) || record.id <= lastId)
        throw new Error('History pagination returned an invalid or repeated ID.');
      records.push(record);
      lastId = record.id;
    }
    if (page.length < 500) return records;
  }
}

function istParts(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return [`${parts.day}-${parts.month}-${parts.year}`, `${parts.hour}:${parts.minute}:${parts.second}`];
}

function csvCell(value) {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function buildHistoryCsv(records) {
  const rows = [['Date (IST)', 'Time (IST)', 'City', 'Product', 'Loose / 10 KG',
    ...HISTORY_PACKINGS, 'Saved by', 'History ID', 'Other packing rates']];
  for (const record of records) {
    const snapshot = record.snapshot || {};
    const included = new Map(), other = [];
    for (const rate of Array.isArray(snapshot.rates) ? snapshot.rates : []) {
      if (!HISTORY_PACKINGS.includes(rate.packing)) { other.push(rate); continue; }
      if (included.has(rate.packing) && included.get(rate.packing) !== rate.rate)
        throw new Error(`Conflicting rates for history ID ${record.id}, ${rate.packing}.`);
      included.set(rate.packing, rate.rate);
    }
    const [date, time] = istParts(record.changed_at);
    rows.push([date, time, record.city, snapshot.product_name || '',
      record.city === 'Udaan' ? '' : snapshot.loose_rate ?? '',
      ...HISTORY_PACKINGS.map(p => included.get(p) ?? ''),
      snapshot.changed_by_name || '', record.id, other.length ? JSON.stringify(other) : '']);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadHistoryFile({ content, type, name }) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor);
  anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
