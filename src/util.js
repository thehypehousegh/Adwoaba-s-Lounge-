export const ONE_SIZE = 'OS';
export const MIXED = 'mixed';
export const SEP = '|';

export const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank transfer', 'Card', 'Other'];
export const DELIVERY_STATUSES = ['Pending', 'Out for delivery', 'Delivered', 'Cancelled'];
export const COMMON_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43'];

export const DEFAULT_SIZE_ALERT = 0;
export const DEFAULT_TOTAL_ALERT = 2;

export const OPENING_DELIVERY_ID = 'opening-teemah';

export function money(n) {
  const v = Number(n) || 0;
  return 'GH₵ ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const moneyOr = (n, fallback = 'Not set') => (n === null || n === undefined ? fallback : money(n));

export function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ---------- Variants: a colour + size combination, stored as "Colour|Size" (or just "Size") ---------- */
export function makeVariant(colour, size) {
  const c = (colour || '').replace(/\|/g, '/').trim();
  const s = String(size ?? '').replace(/\|/g, '/').trim() || ONE_SIZE;
  return c ? `${c}${SEP}${s}` : s;
}
export function splitVariant(key) {
  const i = key.indexOf(SEP);
  return i < 0 ? { colour: '', size: key } : { colour: key.slice(0, i), size: key.slice(i + 1) };
}
export function sizeText(size, product) {
  if (size === MIXED) return product?.mixedNote ? `Mixed (${product.mixedNote})` : 'Mixed sizes';
  if (size === ONE_SIZE) return 'One size';
  return size;
}
/** "Black · 38", "38", "Brown" (one-size bag), "One size". */
export function variantLabel(key, product) {
  const { colour, size } = splitVariant(key);
  if (colour && size === ONE_SIZE) return colour;
  return [colour, sizeText(size, product)].filter(Boolean).join(' · ');
}
export const sizeLabel = variantLabel;

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
export function variantOrder(a, b) {
  const x = splitVariant(a);
  const y = splitVariant(b);
  return x.colour.localeCompare(y.colour) || sizeOrder(x.size, y.size);
}
export const sortedSizes = (p) => Object.keys(p?.sizes || {}).sort(variantOrder);
export const sortedVariants = sortedSizes;

export function coloursOf(p) {
  return Array.from(new Set(Object.keys(p?.sizes || {}).map((k) => splitVariant(k).colour))).sort();
}

export const totalStock = (p) => Object.values(p?.sizes || {}).reduce((a, b) => a + (Number(b) || 0), 0);

/* ---------- Prices ---------- */
export const variantPrice = (p, v) => p?.prices?.[v] ?? p?.price ?? null;
export const variantCost = (p, v) => p?.costs?.[v] ?? p?.cost ?? null;

/** Price a sale defaults to: the price on the oldest delivery still in stock, else the variant price. */
export function defaultSalePrice(p, v, lots) {
  const lot = (lots || []).find((l) => l.remaining > 0 && l.price != null);
  return lot ? lot.price : variantPrice(p, v);
}

/** Oldest-first allocation of qty across lots (each {id, remaining}). Mutates `remaining` on the copies given. */
export function allocateFIFO(lots, qty) {
  const out = [];
  let left = qty;
  for (const l of lots) {
    if (left <= 0) break;
    if (l.remaining <= 0) continue;
    const take = Math.min(l.remaining, left);
    out.push({ lotId: l.id, qty: take });
    l.remaining -= take;
    left -= take;
  }
  return out;
}

/* ---------- Alerts ---------- */
export function thresholds(p, settings) {
  return {
    size: p.sizeAlert ?? settings?.sizeAlert ?? DEFAULT_SIZE_ALERT,
    total: p.totalAlert ?? settings?.totalAlert ?? DEFAULT_TOTAL_ALERT,
  };
}

/** Shortage alerts for one product: per product total and per colour/size. */
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
    const { size } = splitVariant(k);
    if (size === MIXED || k === ONE_SIZE) continue;
    const q = Number(p.sizes[k]) || 0;
    const label = splitVariant(k).colour ? variantLabel(k, p) : `Size ${variantLabel(k, p)}`;
    if (q <= t.size) {
      out.push({ type: 'size', size: k, level: q <= 0 ? 'out' : 'low', text: q <= 0 ? `${label} sold out` : `${label}: ${q} left` });
    }
  }
  return out;
}

/* ---------- Dates (all stored as epoch milliseconds) ---------- */
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
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export function toInputDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromInputDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
/** A picked calendar day as a timestamp: now if it is today, else midday of that day. */
export function dayToTimestamp(inputDate) {
  const day = fromInputDate(inputDate);
  return day === startOfDay(Date.now()) ? Date.now() : day + 12 * 3600000;
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

export const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

/**
 * Multi-word search across product name, category and colours ("zara heels black").
 * Returns null when the product does not match, else { colours }: the colours named in the search
 * (a Set), or null when no word was a colour.
 */
export function searchProduct(p, categoryName, q) {
  const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { colours: null };
  const base = `${p.name} ${categoryName || ''}`.toLowerCase();
  const cols = coloursOf(p).filter(Boolean);
  let colours = null;
  for (const w of words) {
    if (base.includes(w)) continue;
    const hit = cols.filter((c) => c.toLowerCase().includes(w));
    if (!hit.length) return null;
    colours = colours ? new Set(hit.filter((c) => colours.has(c))) : new Set(hit);
    if (!colours.size) return null;
  }
  return { colours };
}
