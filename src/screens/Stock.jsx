import React, { useEffect, useMemo, useState } from 'react';
import {
  applyStockCount,
  createProduct,
  deleteProduct,
  itemCost,
  removeStock,
  loadSeed,
  saveCategory,
  setVariantPrices,
  subscribeMovements,
  updateProduct,
  useStore,
} from '../store.jsx';
import { seed, seedTotal } from '../seed.js';
import { CategoryChips, Empty, Field, Header, Icon, Loading, Modal, Page, SearchBox, Stat, useNav } from '../ui.jsx';
import {
  DEFAULT_SIZE_ALERT,
  DEFAULT_TOTAL_ALERT,
  MIXED,
  ONE_SIZE,
  OPENING_DELIVERY_ID,
  coloursOf,
  defaultSalePrice,
  endOfDay,
  fmtDate,
  fromInputDate,
  fmtTime,
  matches,
  money,
  moneyOr,
  num,
  productAlerts,
  searchProduct,
  sizeText,
  sortedVariants,
  splitVariant,
  sum,
  thresholds,
  totalStock,
  variantCost,
  variantLabel,
  variantOrder,
  variantPrice,
} from '../util.js';

/* ---------- Stock list ----------
 * Search covers all stock. Supplier / date filters narrow it to the pieces still
 * in stock from deliveries by that supplier or bought in that period.
 */
export function StockList({ pushed, focusSearch }) {
  const s = useStore();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [colour, setColour] = useState('');
  const [supplier, setSupplier] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  if (s.loading) return (<><Header title="Stock" back={!!pushed} /><Loading /></>);

  const lotFilter = !!(supplier || from || to);
  const fromMs = from ? fromInputDate(from) : -Infinity;
  const toMs = to ? endOfDay(fromInputDate(to)) : Infinity;
  const allColours = Array.from(new Set(s.products.flatMap((p) => coloursOf(p)).filter(Boolean))).sort();

  const rows = [];
  for (const p of s.products) {
    if (cat && p.categoryId !== cat) continue;
    const hit = searchProduct(p, s.catName[p.categoryId], q);
    if (!hit) continue;
    if (lowOnly && !productAlerts(p, s.settings).length) continue;
    let shown = {};
    for (const v of sortedVariants(p)) {
      const c = splitVariant(v).colour;
      if (colour && c.toLowerCase() !== colour.toLowerCase()) continue;
      if (hit.colours && !hit.colours.has(c)) continue;
      if (lotFilter) {
        const qn = s.lotsFor(p.id, v)
          .filter((l) => (!supplier || l.supplier === supplier) && l.date >= fromMs && l.date <= toMs)
          .reduce((a, l) => a + Math.max(0, l.remaining), 0);
        if (qn > 0) shown[v] = qn;
      } else {
        shown[v] = Number(p.sizes[v]) || 0;
      }
    }
    const filtered = colour || hit.colours || lotFilter;
    if (filtered && !Object.keys(shown).length) continue;
    rows.push({ p, shown: filtered ? shown : null });
  }
  const units = rows.reduce((a, r) => a + (r.shown ? Object.values(r.shown).reduce((x, y) => x + y, 0) : totalStock(r.p)), 0);
  const activeFilters = [colour, supplier, from && `from ${fmtDate(fromInputDate(from))}`, to && `to ${fmtDate(fromInputDate(to))}`].filter(Boolean);

  return (
    <>
      <Header title={focusSearch ? 'Search products' : 'Stock'} back={!!pushed} right={<button className="icon-btn" onClick={() => nav.push('productForm')} aria-label="Add product"><Icon name="plus" /></button>} />
      <Page>
        {s.products.length === 0 && !s.settings.seeded && <SeedCard />}
        <div className="row-actions">
          <button className="btn primary" onClick={() => nav.push('productForm')}><Icon name="plus" size={18} /> New product</button>
          <button className="btn" onClick={() => nav.push('receive')}>Receive stock</button>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search, e.g. zara heels black" autoFocus={!!focusSearch} />
        <CategoryChips value={cat} onChange={setCat} />
        <div className="chips">
          <button className={`chip ${showFilters || activeFilters.length ? 'on' : ''}`} onClick={() => setShowFilters(!showFilters)}>
            Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </button>
          <button className={`chip ${lowOnly ? 'on' : ''}`} onClick={() => setLowOnly(!lowOnly)}>Low stock only</button>
        </div>
        {showFilters && (
          <div className="card">
            {allColours.length > 0 && (
              <Field label="Colour">
                <select value={colour} onChange={(e) => setColour(e.target.value)}>
                  <option value="">All colours</option>
                  {allColours.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            )}
            <Field label="Supplier" hint="Only pieces still in stock from this supplier's deliveries">
              <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">All suppliers</option>
                {s.suppliers.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <div className="two">
              <Field label="Bought from"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Bought to"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            {activeFilters.length > 0 && <button className="btn" onClick={() => { setColour(''); setSupplier(''); setFrom(''); setTo(''); }}>Clear filters</button>}
          </div>
        )}
        <p className="muted small">
          {rows.length} products · {units} in stock{activeFilters.length ? ` · ${activeFilters.join(', ')}` : ''}
        </p>
        <div className="list">
          {rows.map((r) => <ProductRow key={r.p.id} p={r.p} shown={r.shown} />)}
          {!rows.length && <Empty>No products</Empty>}
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => nav.push('count', { categoryId: cat })}>Take stock</button>
          <button className="btn" onClick={() => nav.push('deliveries')}>Deliveries</button>
          <button className="btn" onClick={() => nav.push('history')}>Stock history</button>
        </div>
      </Page>
    </>
  );
}

function SeedCard() {
  const [done, setDone] = useState(false);
  return (
    <div className="card seed">
      <strong>Load the 26 October stocktake?</strong>
      <p className="muted small">
        Adds {seed.products.length} heel designs ({seedTotal} pairs) bought from {seed.supplier} on 24 October, in the categories Bridal,
        Corporate, Zara, Mei and Other heels, plus empty Handbags and Perfumes categories. Prices are left blank for you to fill in.
      </p>
      <button className="btn primary" disabled={done} onClick={() => { loadSeed(); setDone(true); }}>{done ? 'Loaded' : 'Load stocktake'}</button>
    </div>
  );
}

function priceRange(p) {
  const vs = sortedVariants(p);
  const ps = (vs.length ? vs.map((v) => variantPrice(p, v)) : [p.price]).filter((x) => x != null);
  if (!ps.length) return 'No price';
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  return lo === hi ? money(lo) : `${money(lo)} to ${money(hi)}`;
}

function ProductRow({ p, shown }) {
  const s = useStore();
  const nav = useNav();
  const alerts = productAlerts(p, s.settings);
  const t = thresholds(p, s.settings);
  const qtys = shown || p.sizes || {};
  const total = shown ? Object.values(shown).reduce((a, b) => a + b, 0) : totalStock(p);
  return (
    <button className="row" onClick={() => nav.push('product', { id: p.id })}>
      <div className="row-main">
        <div className="row-title">
          {p.name}
          {alerts.length > 0 && <span className={`pill ${total <= 0 ? 'out' : 'low'}`}>{total <= 0 ? 'Out' : 'Low'}</span>}
        </div>
        <div className="row-sub">{s.catName[p.categoryId] || 'No category'} · {priceRange(p)}</div>
        <div className="sizes">
          {Object.keys(qtys).sort(variantOrder).map((k) => {
            const qn = Number(qtys[k]) || 0;
            const low = splitVariant(k).size !== MIXED && k !== ONE_SIZE && qn <= t.size;
            return (
              <span key={k} className={`size ${qn <= 0 ? 'zero' : low ? 'low' : ''}`}>
                {variantLabel(k, p)} <b>×{qn}</b>
              </span>
            );
          })}
        </div>
      </div>
      <div className="row-end big">{total}</div>
    </button>
  );
}

/** Stock grouped by colour, each size showing quantity and selling price. */
export function VariantGrid({ p, onPick, selected, showPrice = true }) {
  const s = useStore();
  const groups = {};
  for (const v of sortedVariants(p)) {
    const { colour } = splitVariant(v);
    (groups[colour] = groups[colour] || []).push(v);
  }
  const colours = Object.keys(groups);
  if (!colours.length) return <Empty>No stock recorded yet. Use Receive stock.</Empty>;
  return colours.map((c) => (
    <div key={c || '-'} className="variant-group">
      {c && <div className="colour-hdr">{c}</div>}
      <div className="size-grid">
        {groups[c].map((v) => {
          const q = Number(p.sizes[v]) || 0;
          const price = defaultSalePrice(p, v, s.lotsFor(p.id, v));
          const Tag = onPick ? 'button' : 'div';
          return (
            <Tag key={v} className={`size-cell ${onPick ? 'pick' : ''} ${selected === v ? 'on' : ''} ${q <= 0 ? 'zero' : ''}`} onClick={onPick ? () => onPick(v) : undefined}>
              <div className="size-cell-label">{splitVariant(v).size === ONE_SIZE ? (c ? 'One size' : 'One size') : sizeText(splitVariant(v).size, p)}</div>
              <div className="size-cell-qty">{q}</div>
              {showPrice && <div className="size-cell-price">{price != null ? money(price) : 'No price'}</div>}
            </Tag>
          );
        })}
      </div>
    </div>
  ));
}

/* ---------- Product detail ---------- */
export function ProductDetail({ id, tab: initialTab = 'stock' }) {
  const s = useStore();
  const nav = useNav();
  const [tab, setTab] = useState(initialTab);
  const [menu, setMenu] = useState(false);
  const [moves, setMoves] = useState(null);
  useEffect(() => subscribeMovements((all) => setMoves(all.slice(0, 300)), { productId: id }), [id]);

  const p = s.productById[id];
  if (s.loading) return (<><Header title="Product" /><Loading /></>);
  if (!p) return (<><Header title="Product" /><Empty>This product was deleted.</Empty></>);

  const alerts = productAlerts(p, s.settings);
  const t = thresholds(p, s.settings);
  const sales = s.sales.filter((sale) => sale.items.some((it) => it.productId === id));
  const lines = sales.flatMap((sale) => sale.items.filter((it) => it.productId === id).map((it) => ({ sale, it })));
  const soldQty = sum(lines, (l) => l.it.qty);
  const soldValue = sum(lines, (l) => (l.it.price == null ? 0 : l.it.qty * l.it.price));
  let profit = 0;
  let unknown = 0;
  for (const { it } of lines) {
    if (it.price == null) continue;
    const c = itemCost(it, s);
    unknown += c.unknownQty;
    profit += (it.qty - c.unknownQty) * it.price - c.cost;
  }
  const lots = s.lots.filter((l) => l.productId === id).sort((a, b) => b.date - a.date);

  const updateOptions = [
    ['inbox', 'Add stock', 'New delivery: colours, sizes, quantities, prices, supplier', () => nav.push('receive', { productId: id })],
    ['x', 'Remove stock', 'Damaged, returned to supplier, gift or personal use', () => nav.push('remove', { productId: id })],
    ['clipboard', 'Correct count', 'Type what you counted; also cost and selling prices', () => nav.push('count', { productId: id })],
    ['tag', 'Change prices', 'Cost and selling price per colour and size', () => nav.push('prices', { id })],
    ['edit', 'Edit details', 'Name, category, alert levels', () => nav.push('productForm', { id })],
  ];

  return (
    <>
      <Header title={p.name} right={<button className="icon-btn" onClick={() => nav.push('productForm', { id })} aria-label="Edit"><Icon name="edit" /></button>} />
      <Page>
        <div className="stats">
          <Stat label="In stock" value={totalStock(p)} sub={s.catName[p.categoryId] || 'No category'} />
          <Stat label="Sold" value={soldQty} sub={money(soldValue)} />
        </div>

        <div className="tiles three">
          <button className="tile primary" onClick={() => setMenu(true)}><span className="tile-icon"><Icon name="box" size={24} /></span><span className="tile-label">Update stock</span></button>
          <button className="tile primary" onClick={() => nav.push('newSale', { productId: id, pushed: true })}><span className="tile-icon"><Icon name="plus" size={24} /></span><span className="tile-label">Sell</span></button>
          <button className="tile" onClick={() => setTab('sales')}><span className="tile-icon"><Icon name="receipt" size={24} /></span><span className="tile-label">Stock sales</span></button>
        </div>

        {alerts.length > 0 && (
          <div className="card alert-list">
            {alerts.map((a, i) => <div key={i} className={`alert-line ${a.level}`}>{a.text}</div>)}
          </div>
        )}

        <div className="tabs">
          {[['stock', 'Stock'], ['sales', `Sales (${sales.length})`], ['deliveries', `Deliveries (${lots.length})`], ['history', 'History']].map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'stock' && (
          <>
            <VariantGrid p={p} />
            <div className="card">
              <div className="kv"><span>Selling price</span><b>{priceRange(p)}</b></div>
              <div className="kv"><span>Alert when a size is at or below</span><b>{t.size}{p.sizeAlert == null ? ' (default)' : ''}</b></div>
              <div className="kv"><span>Alert when total is at or below</span><b>{t.total}{p.totalAlert == null ? ' (default)' : ''}</b></div>
            </div>
          </>
        )}

        {tab === 'sales' && (
          <>
            <div className="card">
              <div className="kv"><span>Pieces sold</span><b>{soldQty}</b></div>
              <div className="kv"><span>Sales value</span><b>{money(soldValue)}</b></div>
              <div className="kv"><span>Gross profit</span><b>{money(profit)}</b></div>
              {unknown > 0 && <p className="warn-text small">{unknown} sold have no cost price, so they are left out of profit.</p>}
            </div>
            <div className="list">
              {lines.map(({ sale, it }, i) => (
                <button key={sale.id + i} className="row" onClick={() => nav.push('sale', { id: sale.id })}>
                  <div className="row-main">
                    <div className="row-title">{variantLabel(it.size, p)} × {it.qty}</div>
                    <div className="row-sub">{fmtDate(sale.date)} · {sale.customerName || 'Walk-in'} · {sale.paymentMethod}</div>
                  </div>
                  <div className="row-end">{it.price == null ? <span className="pill out">No price</span> : money(it.qty * it.price)}</div>
                </button>
              ))}
              {!lines.length && <Empty>Not sold yet</Empty>}
            </div>
          </>
        )}

        {tab === 'deliveries' && (
          <div className="list">
            {lots.map((l) => (
              <button key={l.id} className="row" onClick={() => l.deliveryId && nav.push('delivery', { id: l.deliveryId })}>
                <div className="row-main">
                  <div className="row-title">{variantLabel(l.variant, p)} · {l.qty} in, {l.remaining} left</div>
                  <div className="row-sub">{fmtDate(l.date)} · {l.supplier || 'No supplier'}</div>
                  <div className="row-sub">Cost {moneyOr(l.unitCost, 'not set')}{l.spreadShare ? ` (incl. ${money(l.spreadShare)} other costs)` : ''} · Sells {moneyOr(l.price, 'at usual price')}</div>
                </div>
              </button>
            ))}
            {!lots.length && <Empty>No deliveries recorded</Empty>}
          </div>
        )}

        {tab === 'history' && (!moves ? <Loading /> : <HistoryView moves={moves} showProduct={false} />)}

        <button className="btn danger block" onClick={() => {
          if (confirm(`Delete "${p.name}"? Past sales stay in your records.`)) { deleteProduct(id); nav.pop(); }
        }}>Delete product</button>

        {menu && (
          <Modal title="Update stock" onClose={() => setMenu(false)}>
            <div className="list">
              {updateOptions.map(([icon, label, sub, go]) => (
                <button key={label} className="row menu" onClick={() => { setMenu(false); go(); }}>
                  <Icon name={icon} />
                  <div className="row-main"><div className="row-title">{label}</div><div className="row-sub">{sub}</div></div>
                </button>
              ))}
            </div>
          </Modal>
        )}
      </Page>
    </>
  );
}

/* ---------- Remove stock (damaged, returned...) ---------- */
const REMOVE_REASONS = ['Damaged', 'Returned to supplier', 'Gift / personal use', 'Lost', 'Other'];
export function RemoveStock({ productId }) {
  const s = useStore();
  const nav = useNav();
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('Damaged');
  const [note, setNote] = useState('');
  const p = s.productById?.[productId];
  if (s.loading || !p) return (<><Header title="Remove stock" /><Loading /></>);
  const total = sum(Object.values(qty), (x) => x);
  function save() {
    const changes = Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => v > 0));
    if (!Object.keys(changes).length) return alert('Enter how many to remove.');
    const over = Object.entries(changes).filter(([v, q]) => q > (Number(p.sizes[v]) || 0));
    if (over.length && !confirm('That is more than the app has in stock for some sizes. Remove anyway?')) return;
    removeStock(p, changes, reason, note.trim(), s.lotsFor);
    nav.pop();
  }
  return (
    <>
      <Header title="Remove stock" />
      <Page>
        <p className="muted small">{p.name}. Removed pieces come out of the oldest delivery first and are recorded in stock history.</p>
        <Field label="Reason">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{REMOVE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        <div className="card">
          {sortedVariants(p).map((v) => (
            <div className="qty-row" key={v}>
              <span>{variantLabel(v, p)} <small className="muted">(have {Number(p.sizes[v]) || 0})</small></span>
              <input inputMode="numeric" type="number" min="0" placeholder="0" value={qty[v] ?? ''} onChange={(e) => setQty({ ...qty, [v]: e.target.value })} />
              <span />
            </div>
          ))}
        </div>
        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. heel broken" /></Field>
        <button className="btn primary block sticky-btn" onClick={save}>Remove {total || ''} piece{total === 1 ? '' : 's'}</button>
      </Page>
    </>
  );
}

/* ---------- Product form (name, category, defaults). Stock is added with Receive stock. ---------- */
export function ProductForm({ id, categoryId: initialCat }) {
  const s = useStore();
  const nav = useNav();
  const existing = id ? s.productById[id] : null;
  const [name, setName] = useState(existing?.name || '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId || initialCat || '');
  const [price, setPrice] = useState(existing?.price ?? '');
  const [cost, setCost] = useState(existing?.cost ?? '');
  const [sizeAlert, setSizeAlert] = useState(existing?.sizeAlert ?? '');
  const [totalAlert, setTotalAlert] = useState(existing?.totalAlert ?? '');
  const [mixedNote, setMixedNote] = useState(existing?.mixedNote || '');

  if (s.loading) return (<><Header title="Product" /><Loading /></>);
  const cat = categoryId || s.categories[0]?.id || '';
  const hasMixed = Object.keys(existing?.sizes || {}).some((k) => splitVariant(k).size === MIXED);

  function pickCategory(v) {
    if (v !== '__new') return setCategoryId(v);
    const n = prompt('New category name, e.g. Hermes');
    if (n && n.trim()) setCategoryId(saveCategory({ name: n.trim(), order: s.categories.length + 1 }));
  }

  function save() {
    if (!name.trim()) return alert('Enter a product name.');
    const fields = {
      name: name.trim(),
      categoryId: cat,
      price: num(price),
      cost: num(cost),
      sizeAlert: num(sizeAlert),
      totalAlert: num(totalAlert),
      mixedNote: mixedNote.trim(),
    };
    if (existing) {
      updateProduct(id, fields);
      nav.pop();
    } else {
      const newId = createProduct(fields);
      nav.replace('receive', { productId: newId, isNew: true });
    }
  }

  return (
    <>
      <Header title={existing ? 'Edit product' : 'New product'} />
      <Page>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hermes slippers" /></Field>
        <Field label="Category">
          <select value={cat} onChange={(e) => pickCategory(e.target.value)}>
            {s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">+ New category…</option>
          </select>
        </Field>
        <p className="muted small">
          Colours, sizes, quantities and prices are entered when you receive stock. The prices below are optional defaults, used
          where a colour or size has no price of its own.
        </p>
        <div className="two">
          <Field label="Default selling price (GH₵)"><input inputMode="decimal" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Default cost price (GH₵)"><input inputMode="decimal" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" /></Field>
        </div>

        <h3 className="section">Shortage alerts</h3>
        <div className="two">
          <Field label="Alert when a size is at or below" hint={`Blank = default (${s.settings.sizeAlert ?? DEFAULT_SIZE_ALERT})`}>
            <input inputMode="numeric" type="number" value={sizeAlert} onChange={(e) => setSizeAlert(e.target.value)} />
          </Field>
          <Field label="Alert when total is at or below" hint={`Blank = default (${s.settings.totalAlert ?? DEFAULT_TOTAL_ALERT})`}>
            <input inputMode="numeric" type="number" value={totalAlert} onChange={(e) => setTotalAlert(e.target.value)} />
          </Field>
        </div>
        {hasMixed && (
          <Field label="Mixed sizes note" hint="Shown next to the mixed-size count, e.g. 37-42">
            <input value={mixedNote} onChange={(e) => setMixedNote(e.target.value)} />
          </Field>
        )}
        <button className="btn primary block" onClick={save}>{existing ? 'Save' : 'Save and add stock'}</button>
        {existing && <p className="muted small">To change quantities use Receive stock or Correct count. To change prices per colour or size use Edit prices.</p>}
      </Page>
    </>
  );
}

/* ---------- Edit prices per colour/size ---------- */
export function PriceEditor({ id }) {
  const s = useStore();
  const nav = useNav();
  const p = s.productById?.[id];
  const [rows, setRows] = useState(() =>
    p ? Object.fromEntries(sortedVariants(p).map((v) => [v, { price: variantPrice(p, v) ?? '', cost: variantCost(p, v) ?? '' }])) : {}
  );
  const [all, setAll] = useState({ price: '', cost: '' });
  if (s.loading || !p) return (<><Header title="Edit prices" /><Loading /></>);

  function save() {
    const prices = {};
    const costs = {};
    for (const [v, r] of Object.entries(rows)) {
      const np = num(r.price);
      const nc = num(r.cost);
      if (np !== (variantPrice(p, v) ?? null)) prices[v] = np;
      if (nc !== (variantCost(p, v) ?? null)) costs[v] = nc;
    }
    if (!Object.keys(prices).length && !Object.keys(costs).length) return nav.pop();
    setVariantPrices(p, { prices, costs }, s.lotsFor);
    nav.pop();
  }

  return (
    <>
      <Header title="Edit prices" />
      <Page>
        <p className="muted small">
          {p.name}. A new selling price also applies to pieces already in stock. The cost price here is the usual cost, used where a
          delivery has no cost recorded. To change what a delivery cost, edit the delivery.
        </p>
        <div className="card">
          <div className="row-title">Set all at once</div>
          <div className="qty-row three">
            <input inputMode="decimal" type="number" placeholder="Cost" value={all.cost} onChange={(e) => setAll({ ...all, cost: e.target.value })} />
            <input inputMode="decimal" type="number" placeholder="Selling" value={all.price} onChange={(e) => setAll({ ...all, price: e.target.value })} />
            <button className="btn" onClick={() => setRows(Object.fromEntries(Object.entries(rows).map(([v, r]) => [v, { cost: all.cost !== '' ? all.cost : r.cost, price: all.price !== '' ? all.price : r.price }])))}>Apply</button>
          </div>
        </div>
        <div className="price-table">
          <div className="price-row head"><span>Colour / size</span><span>Cost</span><span>Selling</span></div>
          {Object.entries(rows).map(([v, r]) => (
            <div className="price-row" key={v}>
              <span>{variantLabel(v, p)}</span>
              <input inputMode="decimal" type="number" step="0.01" value={r.cost} onChange={(e) => setRows({ ...rows, [v]: { ...r, cost: e.target.value } })} />
              <input inputMode="decimal" type="number" step="0.01" value={r.price} onChange={(e) => setRows({ ...rows, [v]: { ...r, price: e.target.value } })} />
            </div>
          ))}
        </div>
        <button className="btn primary block sticky-btn" onClick={save}>Save prices</button>
      </Page>
    </>
  );
}

/* ---------- Take stock (count, with optional cost and selling prices) ---------- */
export function StockCount({ categoryId = '', productId }) {
  const s = useStore();
  const nav = useNav();
  const [cat, setCat] = useState(categoryId);
  const [counts, setCounts] = useState({}); // { productId: { variant: '3' } }
  const [prices, setPrices] = useState({}); // { productId: { variant: { cost, price } } }
  const [open, setOpen] = useState(productId ? { [productId]: true } : {});
  const [note, setNote] = useState('');

  const list = useMemo(() => {
    if (!s.products) return [];
    if (productId) return s.products.filter((p) => p.id === productId);
    return s.products.filter((p) => !cat || p.categoryId === cat);
  }, [s.products, cat, productId]);

  if (s.loading) return (<><Header title="Take stock" /><Loading /></>);

  const entries = Array.from(new Set([...Object.keys(counts), ...Object.keys(prices)]))
    .map((pid) => {
      const product = s.productById[pid];
      if (!product) return null;
      const c = Object.fromEntries(Object.entries(counts[pid] || {}).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
      const pr = {};
      const co = {};
      for (const [v, x] of Object.entries(prices[pid] || {})) {
        if (x.price !== undefined) pr[v] = num(x.price);
        if (x.cost !== undefined) co[v] = num(x.cost);
      }
      return { product, counts: c, prices: pr, costs: co };
    })
    .filter(Boolean);

  const countChanges = entries.reduce((a, e) => a + Object.entries(e.counts).filter(([k, v]) => v !== (Number(e.product.sizes?.[k]) || 0)).length, 0);
  const priceChanges = entries.reduce(
    (a, e) =>
      a +
      Object.entries(e.prices).filter(([v, x]) => x !== (variantPrice(e.product, v) ?? null)).length +
      Object.entries(e.costs).filter(([v, x]) => x !== (variantCost(e.product, v) ?? null)).length,
    0
  );
  const changes = countChanges + priceChanges;

  function save() {
    if (!changes) return alert('Nothing differs from what the app has.');
    if (!confirm(`Save ${countChanges} count change${countChanges === 1 ? '' : 's'} and ${priceChanges} price change${priceChanges === 1 ? '' : 's'}?`)) return;
    applyStockCount(entries, note.trim(), s.lotsFor);
    nav.pop();
  }

  const setPrice = (pid, v, field, value) =>
    setPrices({ ...prices, [pid]: { ...(prices[pid] || {}), [v]: { ...(prices[pid]?.[v] || {}), [field]: value } } });

  return (
    <>
      <Header title={productId ? 'Correct count' : 'Take stock'} />
      <Page>
        <p className="muted small">
          Type the number you counted. Leave a box empty if it matches. Tap "Prices" on a product to also enter cost and selling price.
          New colours or sizes are added with Receive stock.
        </p>
        {!productId && <CategoryChips value={cat} onChange={setCat} />}
        {list.map((p) => (
          <div className="card" key={p.id}>
            <div className="card-hdr">
              <div className="row-title">{p.name}</div>
              <button className={`chip ${open[p.id] ? 'on' : ''}`} onClick={() => setOpen({ ...open, [p.id]: !open[p.id] })}>Prices</button>
            </div>
            {sortedVariants(p).map((k) => {
              const v = counts[p.id]?.[k] ?? '';
              const cur = Number(p.sizes[k]) || 0;
              const diff = v === '' ? 0 : Number(v) - cur;
              const pr = prices[p.id]?.[k] || {};
              return (
                <div key={k} className="count-block">
                  <div className="qty-row">
                    <span>{variantLabel(k, p)} <small className="muted">(app says {cur})</small></span>
                    <input inputMode="numeric" type="number" min="0" placeholder={String(cur)} value={v}
                      onChange={(e) => setCounts({ ...counts, [p.id]: { ...(counts[p.id] || {}), [k]: e.target.value } })} />
                    <span className={`diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>{diff ? (diff > 0 ? '+' : '') + diff : ''}</span>
                  </div>
                  {open[p.id] && (
                    <div className="two small-inputs">
                      <input inputMode="decimal" type="number" step="0.01" placeholder={`Cost ${variantCost(p, k) ?? ''}`} value={pr.cost ?? (variantCost(p, k) ?? '')} onChange={(e) => setPrice(p.id, k, 'cost', e.target.value)} />
                      <input inputMode="decimal" type="number" step="0.01" placeholder={`Selling ${variantPrice(p, k) ?? ''}`} value={pr.price ?? (variantPrice(p, k) ?? '')} onChange={(e) => setPrice(p.id, k, 'price', e.target.value)} />
                    </div>
                  )}
                </div>
              );
            })}
            {!sortedVariants(p).length && <p className="muted small">No stock recorded.</p>}
          </div>
        ))}
        {!list.length && <Empty>No products in this category</Empty>}
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Month-end count" /></Field>
        <button className="btn primary block sticky-btn" onClick={save}>Save ({changes} change{changes === 1 ? '' : 's'})</button>
      </Page>
    </>
  );
}

/* ---------- Stock history ---------- */
const MOVE_TYPES = {
  sale: { label: 'Sale', tone: 'out' },
  received: { label: 'Stock received', tone: 'ok' },
  count: { label: 'Quantity update', tone: 'low' },
  removed: { label: 'Removed', tone: 'muted' },
  cancelled: { label: 'Sale cancelled', tone: 'info' },
};
export function movementType(m) {
  if (m.reason === 'Sold') return 'sale';
  if (m.reason === 'Received' || m.reason === 'Opening stock') return 'received';
  if (m.reason === 'Stock count') return 'count';
  if (m.reason === 'Sale cancelled') return 'cancelled';
  return 'removed';
}
const TYPE_FILTERS = [
  ['', 'All'],
  ['sale', 'Sales'],
  ['received', 'Stock received'],
  ['count', 'Quantity updates'],
  ['removed', 'Removed'],
  ['cancelled', 'Cancelled sales'],
];

export function StockHistory() {
  const s = useStore();
  const [moves, setMoves] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => subscribeMovements(setMoves), []);
  const list = (moves || []).filter((m) => searchProduct({ name: m.productName, sizes: { [m.size]: 1 } }, s.catName?.[s.productById?.[m.productId]?.categoryId], q));
  return (
    <>
      <Header title="Stock history" />
      <Page>
        <SearchBox value={q} onChange={setQ} placeholder="Search product or colour" />
        {!moves ? <Loading /> : <HistoryView moves={list} showProduct />}
      </Page>
    </>
  );
}

/** History with type filters. Used on the Stock history screen and on each product. */
export function HistoryView({ moves, showProduct }) {
  const [type, setType] = useState('');
  const counts = {};
  moves.forEach((m) => (counts[movementType(m)] = (counts[movementType(m)] || 0) + 1));
  const list = moves.filter((m) => !type || movementType(m) === type).slice(0, 300);
  return (
    <>
      <div className="chips">
        {TYPE_FILTERS.filter(([k]) => !k || counts[k]).map(([k, l]) => (
          <button key={k} className={`chip ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>{l}{k ? ` (${counts[k]})` : ''}</button>
        ))}
      </div>
      <MovementList moves={list} showProduct={showProduct} />
    </>
  );
}

function describe(m, s) {
  const t = movementType(m);
  const n = Math.abs(m.change);
  const sale = m.saleId ? s.sales.find((x) => x.id === m.saleId) : null;
  const customer = m.customerName || sale?.customerName || '';
  const delivery = m.deliveryId ? s.deliveries.find((d) => d.id === m.deliveryId) : null;
  const supplier = m.supplier || delivery?.supplier || (m.note?.startsWith('From ') ? m.note.slice(5) : '');
  switch (t) {
    case 'sale':
      return `Sold ${n} to ${customer || 'walk-in customer'}${m.price != null ? ` at ${money(m.price)} each` : ''}`;
    case 'received':
      if (m.reason === 'Opening stock') return `Opening stock: ${n} pieces (${m.note || 'stocktake'})`;
      return `${n} received${supplier ? ` from ${supplier}` : ''}${m.boughtOn ? `, bought ${fmtDate(m.boughtOn)}` : ''}${m.unitCost != null ? ` at ${money(m.unitCost)} each` : ''}`;
    case 'count':
      return m.before != null ? `Counted ${m.after}, app had ${m.before}` : `Count corrected by ${m.change > 0 ? '+' : ''}${m.change}`;
    case 'cancelled':
      return `Sale${customer ? ` to ${customer}` : ''}${m.saleDate ? ` on ${fmtDate(m.saleDate)}` : ''} cancelled, ${n} back in stock`;
    default:
      return `${n} removed: ${m.reason}`;
  }
}

function MovementList({ moves, showProduct }) {
  const s = useStore();
  const nav = useNav();
  if (!moves.length) return <Empty>No stock changes yet</Empty>;
  return (
    <div className="list">
      {moves.map((m) => {
        const t = movementType(m);
        const p = s.productById[m.productId];
        const target = t === 'sale' && s.sales.some((x) => x.id === m.saleId)
          ? () => nav.push('sale', { id: m.saleId })
          : m.deliveryId && s.deliveries.some((d) => d.id === m.deliveryId)
          ? () => nav.push('delivery', { id: m.deliveryId })
          : t === 'received' && m.reason === 'Opening stock'
          ? () => nav.push('delivery', { id: OPENING_DELIVERY_ID })
          : null;
        const Tag = target ? 'button' : 'div';
        return (
          <Tag className={`row ${target ? '' : 'static'}`} key={m.id} onClick={target || undefined}>
            <div className="row-main">
              <div className="row-title">
                <span className={`pill ${MOVE_TYPES[t].tone}`}>{MOVE_TYPES[t].label}</span>
                {showProduct ? `${m.productName} · ` : ''}{variantLabel(m.size, p)}
              </div>
              <div className="move-text">{describe(m, s)}</div>
              <div className="row-sub">{fmtDate(m.date)} {fmtTime(m.date)}{m.by ? ` · ${m.by}` : ''}{m.note && t !== 'received' ? ` · ${m.note}` : ''}</div>
            </div>
            <div className="row-end move-end">
              <div className={`diff ${m.change > 0 ? 'up' : 'down'}`}>{m.change > 0 ? '+' : ''}{m.change}</div>
              {m.before != null && <div className="move-stock">{m.before} → {m.after}</div>}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
