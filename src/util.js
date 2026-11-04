export const ONE_SIZE = 'OS';
export const MIXED = 'mixed';

export const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank transfer', 'Card', 'Other'];
export const DELIVERY_STATUSES = ['Pending', 'Out for delivery', 'Delivered', 'Cancelled'];
export const COMMON_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43'];

export const DEFAULT_SIZE_ALERT = 0;
export const DEFAULT_TOTAL_ALERT = 2;

export function money(n) {
  const v = Number(n) || 0;
  return 'GH₵ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function sizeOrder(a, b) {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  const ia = Number.isNaN(na);
  const ib = Number.isNaN(nb);
  if (ia && ib) return a.localeCompare(b);
  if (ia) return 1;
  if (ib) return -1;
  return na - nb || a.localeCompare(b);
}

export const sortedSizes = (p) => Object.keys(p?.sizes || {}).sort(sizeOrder);

export function sizeLabel(key, product) {
  if (key === MIXED) return product?.mixedNote ? `Mixed (${product.mixedNote})` : 'Mixed sizes';
  if (key === ONE_SIZE) return 'One size';
  return key;
}

export const totalStock = (p) =>
  Object.values(p?.sizes || {}).reduce((a, b) => a + (Number(b) || 0), 0);

export function thresholds(p, settings) {
  return {
    size: p.sizeAlert ?? settings?.sizeAlert ?? DEFAULT_SIZE_ALERT,
    total: p.totalAlert ?? settings?.totalAlert ?? DEFAULT_TOTAL_ALERT,
  };
}

/** Shortage alerts for one product: per product total and per size. */
export function productAlerts(p, settings) {
  const t = thresholds(p, settings);
  const out = [];
  const total = totalStock(p);
  if (total <= t.total) {
    out.push({
      type: 'total',
      level: total <= 0 ? 'out' : 'low',
      text: total <= 0 ? 'Out of stock' : `Only ${total} left in total`,
    });
  }
  for (const k of sortedSizes(p)) {
    if (k === MIXED || k === ONE_SIZE) continue;
    const q = Number(p.sizes[k]) || 0;
    if (q <= t.size) {
      out.push({
        type: 'size',
        size: k,
        level: q <= 0 ? 'out' : 'low',
        text: q <= 0 ? `Size ${sizeLabel(k, p)} sold out` : `Size ${sizeLabel(k, p)}: ${q} left`,
      });
    }
  }
  return out;
}

/* Dates (all stored as epoch milliseconds) */
export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export const endOfDay = (ms) => startOfDay(ms) + 86400000 - 1;
export const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDay = (ms) =>
  new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export function toInputDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromInputDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function toCSV(rows) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(',')
    )
    .join('\n');
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function matches(text, q) {
  return (text || '').toLowerCase().includes((q || '').trim().toLowerCase());
}
