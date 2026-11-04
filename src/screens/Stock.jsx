import React, { useEffect, useMemo, useState } from 'react';
import {
  applyStockCount,
  createProduct,
  deleteProduct,
  loadSeed,
  receiveStock,
  subscribeMovements,
  updateProduct,
  useStore,
} from '../store.jsx';
import { seed, seedTotal } from '../seed.js';
import { CategoryChips, Empty, Field, Header, Icon, Loading, Page, ProductPicker, SearchBox, useNav } from '../ui.jsx';
import {
  COMMON_SIZES,
  DEFAULT_SIZE_ALERT,
  DEFAULT_TOTAL_ALERT,
  MIXED,
  ONE_SIZE,
  fmtDate,
  fmtTime,
  matches,
  money,
  num,
  productAlerts,
  sizeLabel,
  sortedSizes,
  thresholds,
  totalStock,
} from '../util.js';

/* ---------- Stock list ---------- */
export function StockList() {
  const s = useStore();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  if (s.loading) return (<><Header title="Stock" back={false} /><Loading /></>);

  const list = s.products.filter(
    (p) =>
      (!cat || p.categoryId === cat) &&
      matches(p.name, q) &&
      (!lowOnly || productAlerts(p, s.settings).length)
  );
  const units = list.reduce((a, p) => a + totalStock(p), 0);

  return (
    <>
      <Header
        title="Stock"
        back={false}
        right={
          <button className="icon-btn" onClick={() => nav.push('productForm')} aria-label="Add product">
            <Icon name="plus" />
          </button>
        }
      />
      <Page>
        {s.products.length === 0 && !s.settings.seeded && <SeedCard />}
        <SearchBox value={q} onChange={setQ} placeholder="Search products" />
        <CategoryChips value={cat} onChange={setCat} />
        <label className="toggle">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Only show low stock
        </label>
        <p className="muted small">{list.length} products · {units} in stock</p>
        <div className="list">
          {list.map((p) => (
            <ProductRow key={p.id} p={p} />
          ))}
          {!list.length && <Empty>No products</Empty>}
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => nav.push('receive')}>Receive stock</button>
          <button className="btn" onClick={() => nav.push('count', { categoryId: cat })}>Take stock</button>
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
        Adds {seed.products.length} heel designs ({seedTotal} pairs) with their sizes, in the categories Bridal,
        Corporate, Zara, Mei and Other heels, plus empty Handbags and Perfumes categories. Prices are left blank for you to fill in.
      </p>
      <button
        className="btn primary"
        disabled={done}
        onClick={() => {
          loadSeed(seed);
          setDone(true);
        }}
      >
        {done ? 'Loaded' : 'Load stocktake'}
      </button>
    </div>
  );
}

function ProductRow({ p }) {
  const s = useStore();
  const nav = useNav();
  const alerts = productAlerts(p, s.settings);
  const t = thresholds(p, s.settings);
  const total = totalStock(p);
  return (
    <button className="row" onClick={() => nav.push('product', { id: p.id })}>
      <div className="row-main">
        <div className="row-title">
          {p.name}
          {alerts.length > 0 && <span className={`pill ${total <= 0 ? 'out' : 'low'}`}>{total <= 0 ? 'Out' : 'Low'}</span>}
        </div>
        <div className="row-sub">
          {s.catName[p.categoryId] || 'No category'} · {p.price != null ? money(p.price) : 'No price'}
        </div>
        <div className="sizes">
          {sortedSizes(p).map((k) => {
            const qn = Number(p.sizes[k]) || 0;
            const low = k !== MIXED && k !== ONE_SIZE && qn <= t.size;
            return (
              <span key={k} className={`size ${qn <= 0 ? 'zero' : low ? 'low' : ''}`}>
                {sizeLabel(k, p)} <b>×{qn}</b>
              </span>
            );
          })}
        </div>
      </div>
      <div className="row-end big">{total}</div>
    </button>
  );
}

/* ---------- Product detail ---------- */
export function ProductDetail({ id }) {
  const s = useStore();
  const nav = useNav();
  const [moves, setMoves] = useState(null);
  useEffect(() => subscribeMovements((all) => setMoves(all.slice(0, 40)), { productId: id }), [id]);

  const p = s.productById[id];
  if (s.loading) return (<><Header title="Product" /><Loading /></>);
  if (!p) return (<><Header title="Product" /><Empty>This product was deleted.</Empty></>);

  const alerts = productAlerts(p, s.settings);
  const t = thresholds(p, s.settings);
  const sold = s.sales.reduce(
    (a, sale) => a + sale.items.filter((it) => it.productId === id).reduce((x, it) => x + it.qty, 0),
    0
  );

  return (
    <>
      <Header
        title={p.name}
        right={
          <button className="icon-btn" onClick={() => nav.push('productForm', { id })} aria-label="Edit">
            <Icon name="edit" />
          </button>
        }
      />
      <Page>
        <div className="card">
          <div className="kv"><span>Category</span><b>{s.catName[p.categoryId] || 'None'}</b></div>
          <div className="kv"><span>Selling price</span><b>{p.price != null ? money(p.price) : 'Not set'}</b></div>
          <div className="kv"><span>Cost price</span><b>{p.cost != null ? money(p.cost) : 'Not set'}</b></div>
          <div className="kv"><span>In stock</span><b>{totalStock(p)}</b></div>
          <div className="kv"><span>Sold (all time)</span><b>{sold}</b></div>
          <div className="kv"><span>Alert when a size is at or below</span><b>{t.size}{p.sizeAlert == null ? ' (default)' : ''}</b></div>
          <div className="kv"><span>Alert when total is at or below</span><b>{t.total}{p.totalAlert == null ? ' (default)' : ''}</b></div>
        </div>

        {alerts.length > 0 && (
          <div className="card alert-list">
            {alerts.map((a, i) => (
              <div key={i} className={`alert-line ${a.level}`}>{a.text}</div>
            ))}
          </div>
        )}

        <h3 className="section">Sizes</h3>
        <div className="size-grid">
          {sortedSizes(p).map((k) => (
            <div key={k} className={`size-cell ${(Number(p.sizes[k]) || 0) <= 0 ? 'zero' : ''}`}>
              <div className="size-cell-label">{sizeLabel(k, p)}</div>
              <div className="size-cell-qty">{Number(p.sizes[k]) || 0}</div>
            </div>
          ))}
        </div>

        <div className="row-actions">
          <button className="btn primary" onClick={() => nav.push('newSale', { productId: id, pushed: true })}>Sell</button>
          <button className="btn" onClick={() => nav.push('receive', { productId: id })}>Receive stock</button>
          <button className="btn" onClick={() => nav.push('count', { productId: id })}>Correct count</button>
        </div>

        <h3 className="section">Stock history</h3>
        {!moves ? <Loading /> : <MovementList moves={moves} showProduct={false} />}

        <button
          className="btn danger block"
          onClick={() => {
            if (confirm(`Delete "${p.name}"? Past sales stay in your records.`)) {
              deleteProduct(id);
              nav.pop();
            }
          }}
        >
          Delete product
        </button>
      </Page>
    </>
  );
}

/* ---------- Product form ---------- */
export function ProductForm({ id }) {
  const s = useStore();
  const nav = useNav();
  const existing = id ? s.productById[id] : null;
  const [name, setName] = useState(existing?.name || '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId || s.categories?.[0]?.id || '');
  const [price, setPrice] = useState(existing?.price ?? '');
  const [cost, setCost] = useState(existing?.cost ?? '');
  const [sizeAlert, setSizeAlert] = useState(existing?.sizeAlert ?? '');
  const [totalAlert, setTotalAlert] = useState(existing?.totalAlert ?? '');
  const [mixedNote, setMixedNote] = useState(existing?.mixedNote || '');
  const [hasSizes, setHasSizes] = useState(true);
  const [rows, setRows] = useState([]); // new product only: [{size, qty}]
  const [customSize, setCustomSize] = useState('');

  if (s.loading) return (<><Header title="Product" /><Loading /></>);

  function addSize(size) {
    if (!size || rows.some((r) => r.size === size)) return;
    setRows([...rows, { size, qty: '' }]);
  }

  function save() {
    if (!name.trim()) return alert('Enter a product name.');
    const fields = {
      name: name.trim(),
      categoryId: categoryId || s.categories[0]?.id || '',
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
      const sizes = {};
      if (hasSizes) {
        for (const r of rows) sizes[r.size] = Number(r.qty) || 0;
        if (!rows.length) return alert('Add at least one size, or untick "Has sizes".');
      } else {
        sizes[ONE_SIZE] = Number(rows[0]?.qty) || 0;
      }
      const newId = createProduct(fields, sizes);
      nav.replace('product', { id: newId });
    }
  }

  return (
    <>
      <Header title={existing ? 'Edit product' : 'New product'} />
      <Page>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nude sling" /></Field>
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {!s.categories.length && <option value="">No categories yet</option>}
          </select>
        </Field>
        <div className="two">
          <Field label="Selling price (GH₵)"><input inputMode="decimal" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Cost price (GH₵)" hint="For profit in reports"><input inputMode="decimal" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
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

        {existing ? (
          <>
            {existing.sizes?.[MIXED] != null && (
              <Field label="Mixed sizes note" hint="Shown next to the mixed-size count, e.g. 37-42">
                <input value={mixedNote} onChange={(e) => setMixedNote(e.target.value)} />
              </Field>
            )}
            <p className="muted small">To change quantities, use "Receive stock" or "Correct count" on the product page.</p>
          </>
        ) : (
          <>
            <h3 className="section">Opening stock</h3>
            <label className="toggle">
              <input type="checkbox" checked={hasSizes} onChange={(e) => { setHasSizes(e.target.checked); setRows([]); }} /> Has sizes (shoes)
            </label>
            {hasSizes ? (
              <>
                <div className="chips">
                  {COMMON_SIZES.map((z) => (
                    <button key={z} type="button" className={`chip ${rows.some((r) => r.size === z) ? 'on' : ''}`} onClick={() => addSize(z)}>{z}</button>
                  ))}
                  <button type="button" className="chip" onClick={() => addSize(MIXED)}>Mixed</button>
                </div>
                <div className="inline">
                  <input placeholder="Other size, e.g. 36 kitten" value={customSize} onChange={(e) => setCustomSize(e.target.value)} />
                  <button type="button" className="btn" onClick={() => { addSize(customSize.trim()); setCustomSize(''); }}>Add</button>
                </div>
                {rows.map((r, i) => (
                  <div className="qty-row" key={r.size}>
                    <span>{sizeLabel(r.size, { mixedNote })}</span>
                    <input inputMode="numeric" type="number" min="0" placeholder="Qty" value={r.qty}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                    <button type="button" className="icon-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={18} /></button>
                  </div>
                ))}
                {rows.some((r) => r.size === MIXED) && (
                  <Field label="Mixed sizes note" hint="e.g. 37-42"><input value={mixedNote} onChange={(e) => setMixedNote(e.target.value)} /></Field>
                )}
              </>
            ) : (
              <Field label="Quantity">
                <input inputMode="numeric" type="number" min="0" value={rows[0]?.qty || ''} onChange={(e) => setRows([{ size: ONE_SIZE, qty: e.target.value }])} />
              </Field>
            )}
          </>
        )}
        <button className="btn primary block" onClick={save}>Save</button>
      </Page>
    </>
  );
}

/* ---------- Receive stock ---------- */
export function ReceiveStock({ productId }) {
  const s = useStore();
  const nav = useNav();
  const [pid, setPid] = useState(productId || null);
  const [picking, setPicking] = useState(!productId);
  const [adds, setAdds] = useState({});
  const [newSize, setNewSize] = useState('');
  const [note, setNote] = useState('');

  if (s.loading) return (<><Header title="Receive stock" /><Loading /></>);
  const p = pid ? s.productById[pid] : null;
  const keys = p ? Array.from(new Set([...sortedSizes(p), ...Object.keys(adds)])) : [];

  function save() {
    const changes = {};
    for (const [k, v] of Object.entries(adds)) if (Number(v) > 0) changes[k] = Number(v);
    if (!Object.keys(changes).length) return alert('Enter how many you received for at least one size.');
    receiveStock(p, changes, note.trim());
    nav.pop();
  }

  return (
    <>
      <Header title="Receive stock" />
      <Page>
        {picking && <ProductPicker onPick={(x) => { setPid(x.id); setAdds({}); setPicking(false); }} onClose={() => (p ? setPicking(false) : nav.pop())} />}
        {p && (
          <>
            <button className="card card-btn" onClick={() => setPicking(true)}>
              <div className="row-title">{p.name}</div>
              <div className="row-sub">{s.catName[p.categoryId]} · tap to change</div>
            </button>
            <p className="muted small">Enter how many new pieces arrived for each size.</p>
            {keys.map((k) => (
              <div className="qty-row" key={k}>
                <span>{sizeLabel(k, p)} <small className="muted">(now {Number(p.sizes?.[k]) || 0})</small></span>
                <input inputMode="numeric" type="number" min="0" placeholder="+0" value={adds[k] || ''} onChange={(e) => setAdds({ ...adds, [k]: e.target.value })} />
              </div>
            ))}
            <div className="inline">
              <input placeholder="New size, e.g. 41" value={newSize} onChange={(e) => setNewSize(e.target.value)} />
              <button type="button" className="btn" onClick={() => { const z = newSize.trim(); if (z && !keys.includes(z)) setAdds({ ...adds, [z]: '' }); setNewSize(''); }}>Add size</button>
            </div>
            <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Supplier, delivery" /></Field>
            <button className="btn primary block" onClick={save}>Add to stock</button>
          </>
        )}
      </Page>
    </>
  );
}

/* ---------- Take stock (count) ---------- */
export function StockCount({ categoryId = '', productId }) {
  const s = useStore();
  const nav = useNav();
  const [cat, setCat] = useState(categoryId);
  const [counts, setCounts] = useState({}); // { productId: { size: '3' } }
  const [note, setNote] = useState('');

  const list = useMemo(() => {
    if (!s.products) return [];
    if (productId) return s.products.filter((p) => p.id === productId);
    return s.products.filter((p) => !cat || p.categoryId === cat);
  }, [s.products, cat, productId]);

  if (s.loading) return (<><Header title="Take stock" /><Loading /></>);

  const entries = Object.entries(counts)
    .map(([pid, c]) => ({
      product: s.productById[pid],
      counts: Object.fromEntries(Object.entries(c).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])),
    }))
    .filter((e) => e.product);
  const changes = entries.reduce(
    (a, e) => a + Object.entries(e.counts).filter(([k, v]) => v !== (Number(e.product.sizes?.[k]) || 0)).length,
    0
  );

  function save() {
    if (!changes) return alert('No counts differ from the current stock.');
    if (!confirm(`Update ${changes} size count${changes === 1 ? '' : 's'}?`)) return;
    applyStockCount(entries, note.trim());
    nav.pop();
  }

  return (
    <>
      <Header title={productId ? 'Correct count' : 'Take stock'} />
      <Page>
        <p className="muted small">
          Type the number you actually counted. Leave a box empty if it matches. The difference is saved in stock history.
        </p>
        {!productId && <CategoryChips value={cat} onChange={setCat} />}
        {list.map((p) => (
          <div className="card" key={p.id}>
            <div className="row-title">{p.name}</div>
            {sortedSizes(p).map((k) => {
              const v = counts[p.id]?.[k] ?? '';
              const cur = Number(p.sizes[k]) || 0;
              const diff = v === '' ? 0 : Number(v) - cur;
              return (
                <div className="qty-row" key={k}>
                  <span>{sizeLabel(k, p)} <small className="muted">(app says {cur})</small></span>
                  <input inputMode="numeric" type="number" min="0" placeholder={String(cur)} value={v}
                    onChange={(e) => setCounts({ ...counts, [p.id]: { ...(counts[p.id] || {}), [k]: e.target.value } })} />
                  <span className={`diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`}>{diff ? (diff > 0 ? '+' : '') + diff : ''}</span>
                </div>
              );
            })}
          </div>
        ))}
        {!list.length && <Empty>No products in this category</Empty>}
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Month-end count" /></Field>
        <button className="btn primary block sticky-btn" onClick={save}>Save count ({changes} change{changes === 1 ? '' : 's'})</button>
      </Page>
    </>
  );
}

/* ---------- Stock history ---------- */
export function StockHistory() {
  const [moves, setMoves] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => subscribeMovements(setMoves), []);
  const reasons = ['Received', 'Sold', 'Stock count', 'Sale cancelled', 'Opening stock'];
  const list = (moves || []).filter((m) => !reason || m.reason === reason).slice(0, 300);
  return (
    <>
      <Header title="Stock history" />
      <Page>
        <div className="chips">
          {['', ...reasons].map((r) => (
            <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r || 'All'}</button>
          ))}
        </div>
        {!moves ? <Loading /> : <MovementList moves={list} showProduct />}
      </Page>
    </>
  );
}

function MovementList({ moves, showProduct }) {
  const { productById } = useStore();
  if (!moves.length) return <Empty>No stock changes yet</Empty>;
  return (
    <div className="list">
      {moves.map((m) => (
        <div className="row static" key={m.id}>
          <div className="row-main">
            <div className="row-title">
              {showProduct ? `${m.productName} · ` : ''}{sizeLabel(m.size, productById[m.productId])}
            </div>
            <div className="row-sub">
              {m.reason} · {fmtDate(m.date)} {fmtTime(m.date)}{m.by ? ` · ${m.by}` : ''}{m.note ? ` · ${m.note}` : ''}
            </div>
          </div>
          <div className={`row-end diff ${m.change > 0 ? 'up' : 'down'}`}>{m.change > 0 ? '+' : ''}{m.change}</div>
        </div>
      ))}
    </div>
  );
}
