import React, { useState } from 'react';
import { createDelivery, createProduct, deleteExpense, deliveryLotId, saveCategory, saveExpense, updateDelivery, useStore } from '../store.jsx';
import { Empty, Field, Header, Icon, Loading, Modal, Page, ProductPicker, SearchBox, useNav } from '../ui.jsx';
import {
  COMMON_SIZES,
  MIXED,
  ONE_SIZE,
  OPENING_DELIVERY_ID,
  coloursOf,
  dayToTimestamp,
  defaultSalePrice,
  fmtDate,
  makeVariant,
  matches,
  money,
  moneyOr,
  num,
  sizeText,
  sum,
  toInputDate,
  variantCost,
  variantLabel,
  variantPrice,
} from '../util.js';

const COST_MODES = [
  { value: 'spread', label: 'Spread into unit cost' },
  { value: 'expense', label: 'Expense (net profit only)' },
];

export const deliveryGoods = (d) => sum(d.items || [], (i) => (i.cost ?? 0) * i.qty);
export const deliveryOther = (d) => sum(d.otherCosts || [], (c) => c.amount);
const pieces = (d) => sum(d.items || [], (i) => i.qty);

/* ---------- Receive stock: a delivery from a supplier ---------- */
export function ReceiveStock({ productId, isNew }) {
  const s = useStore();
  const nav = useNav();
  const [date, setDate] = useState(toInputDate(Date.now()));
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  const [otherCosts, setOtherCosts] = useState([]);
  const [adding, setAdding] = useState(productId ? { productId } : null);

  if (s.loading) return (<><Header title="Receive stock" /><Loading /></>);

  const conflict = (it) => {
    const p = s.productById[it.productId];
    const inStock = Number(p?.sizes?.[it.variant]) || 0;
    const current = defaultSalePrice(p, it.variant, s.lotsFor(it.productId, it.variant));
    return it.price != null && inStock > 0 && current != null && current !== it.price ? { inStock, current } : null;
  };

  const goods = sum(items, (i) => (i.cost ?? 0) * i.qty);
  const other = sum(otherCosts, (c) => c.amount);
  const spread = sum(otherCosts.filter((c) => c.mode === 'spread'), (c) => c.amount);
  const qty = sum(items, (i) => i.qty);

  function save() {
    if (!items.length) return alert('Add at least one item.');
    if (items.some((it) => conflict(it) && it.updateExisting === undefined)) return alert('Choose what happens to the selling price of stock you already have (marked in orange).');
    if (otherCosts.some((c) => !c.label.trim() || !(c.amount > 0))) return alert('Each other cost needs a description and an amount.');
    const id = createDelivery({ date: dayToTimestamp(date), supplier: supplier.trim(), note: note.trim(), items, otherCosts }, s.lotsFor, s.productById);
    nav.replace('delivery', { id });
  }

  return (
    <>
      <Header title="Receive stock" />
      <Page>
        {isNew && <p className="banner ok-banner">Product saved. Now add its colours, sizes, quantities and prices.</p>}
        <div className="two">
          <Field label="Date bought"><input type="date" value={date} max={toInputDate(Date.now())} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
          <Field label="Supplier">
            <input list="suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Teemah" />
            <datalist id="suppliers">{s.suppliers.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </div>

        <h3 className="section">Items</h3>
        <div className="list">
          {items.map((it, i) => {
            const c = conflict(it);
            return (
              <div className="row static col" key={i}>
                <div className="row-line">
                  <div className="row-main">
                    <div className="row-title">{it.productName}</div>
                    <div className="row-sub">{variantLabel(it.variant, s.productById[it.productId])} · {it.qty} pcs</div>
                    <div className="row-sub">Cost {moneyOr(it.cost, 'not set')} · Sell {moneyOr(it.price, 'not set')}</div>
                  </div>
                  <button className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={18} /></button>
                </div>
                {c && (
                  <div className={`choice ${it.updateExisting === undefined ? 'needs' : ''}`}>
                    <div className="small">You already have {c.inStock} selling at {money(c.current)}. New price is {money(it.price)}.</div>
                    <div className="chips">
                      <button className={`chip ${it.updateExisting === false ? 'on' : ''}`} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, updateExisting: false } : x)))}>Keep {money(c.current)} for those</button>
                      <button className={`chip ${it.updateExisting === true ? 'on' : ''}`} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, updateExisting: true } : x)))}>Change all to {money(it.price)}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button className="btn block" onClick={() => setAdding({})}><Icon name="plus" size={18} /> Add items</button>

        <h3 className="section">Other costs</h3>
        <p className="muted small">Transport, customs, packaging and so on for this delivery.</p>
        {otherCosts.map((c, i) => (
          <div className="card" key={i}>
            <div className="qty-row wide">
              <input placeholder="e.g. Transport" value={c.label} onChange={(e) => setOtherCosts(otherCosts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input inputMode="decimal" type="number" step="0.01" placeholder="GH₵" value={c.amount ?? ''} onChange={(e) => setOtherCosts(otherCosts.map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)))} />
              <button className="icon-btn" onClick={() => setOtherCosts(otherCosts.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={18} /></button>
            </div>
            <select value={c.mode} onChange={(e) => setOtherCosts(otherCosts.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)))}>
              {COST_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        ))}
        <button className="btn block" onClick={() => setOtherCosts([...otherCosts, { label: '', amount: null, mode: 'spread' }])}><Icon name="plus" size={18} /> Add other cost</button>

        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>

        <div className="card">
          <div className="kv"><span>Pieces</span><b>{qty}</b></div>
          <div className="kv"><span>Goods (cost × qty)</span><b>{money(goods)}</b></div>
          <div className="kv"><span>Other costs</span><b>{money(other)}</b></div>
          {spread > 0 && qty > 0 && <div className="kv"><span>Added to each piece's cost</span><b>{money(spread / qty)}</b></div>}
          <div className="kv total"><span>Total</span><b>{money(goods + other)}</b></div>
        </div>
        <button className="btn primary block sticky-btn" onClick={save}>Save delivery</button>

        {adding && (
          <AddLines
            initialProductId={adding.productId}
            onClose={() => setAdding(null)}
            onAdd={(lines, keepOpen) => { setItems((x) => [...x, ...lines]); if (!keepOpen) setAdding(null); }}
          />
        )}
      </Page>
    </>
  );
}

/** Pick (or create) a product, then a colour, sizes with quantities, and prices. */
function AddLines({ initialProductId, onAdd, onClose }) {
  const s = useStore();
  const [pid, setPid] = useState(initialProductId || null);
  const [creating, setCreating] = useState(false);
  const p = pid ? s.productById[pid] : null;
  const [colour, setColour] = useState('');
  const [qty, setQty] = useState({}); // size -> qty
  const [custom, setCustom] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  if (creating) return <QuickProduct onClose={() => setCreating(false)} onCreated={(id) => { setPid(id); setCreating(false); }} />;
  if (!pid) {
    return (
      <ProductPicker
        onPick={(x) => setPid(x.id)}
        onClose={onClose}
        extra={<button className="btn primary block" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> New product</button>}
      />
    );
  }
  if (!p) return <Modal title="Loading" onClose={onClose}><Loading /></Modal>;

  // Prefill prices from what this colour usually costs/sells for.
  const sizeKeys = Object.keys(qty);
  const firstVariant = makeVariant(colour, sizeKeys[0] || ONE_SIZE);
  if (!prefilled && (variantCost(p, firstVariant) != null || variantPrice(p, firstVariant) != null) && cost === '' && price === '') {
    setCost(variantCost(p, firstVariant) ?? '');
    setPrice(variantPrice(p, firstVariant) ?? '');
    setPrefilled(true);
  }

  const toggle = (z) => {
    const n = { ...qty };
    if (z in n) delete n[z];
    else n[z] = '';
    setQty(n);
  };
  const existingSizes = Array.from(new Set(Object.keys(p.sizes || {}).map((k) => k.split('|').pop()))).filter((z) => !COMMON_SIZES.includes(z) && z !== ONE_SIZE && z !== MIXED);

  function add(keepOpen) {
    const lines = Object.entries(qty)
      .filter(([, q]) => Number(q) > 0)
      .map(([z, q]) => ({
        productId: p.id,
        productName: p.name,
        variant: makeVariant(colour, z),
        qty: Number(q),
        cost: num(cost),
        price: num(price),
      }));
    if (!lines.length) return alert('Choose at least one size and enter how many.');
    onAdd(lines, keepOpen);
    if (keepOpen) { setColour(''); setQty({}); setPrefilled(false); }
  }

  const colours = coloursOf(p).filter(Boolean);

  return (
    <Modal title={p.name} onClose={onClose}>
      <Field label="Colour (optional)" hint="Leave blank if the product has only one colour.">
        <input list="colours" value={colour} onChange={(e) => { setColour(e.target.value); setPrefilled(false); }} placeholder="e.g. Black, Tan, Gold" />
        <datalist id="colours">{colours.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      {colours.length > 0 && (
        <div className="chips">
          {colours.map((c) => <button key={c} className={`chip ${colour === c ? 'on' : ''}`} onClick={() => { setColour(c); setPrefilled(false); }}>{c}</button>)}
        </div>
      )}

      <div className="field-label">Sizes</div>
      <div className="chips wrap">
        {[...COMMON_SIZES, ...existingSizes].map((z) => <button key={z} className={`chip ${z in qty ? 'on' : ''}`} onClick={() => toggle(z)}>{z}</button>)}
        <button className={`chip ${ONE_SIZE in qty ? 'on' : ''}`} onClick={() => toggle(ONE_SIZE)}>One size (bags, perfume)</button>
        <button className={`chip ${MIXED in qty ? 'on' : ''}`} onClick={() => toggle(MIXED)}>Mixed</button>
      </div>
      <div className="inline">
        <input placeholder="Other size, e.g. 36 kitten, Large" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn" onClick={() => { const z = custom.trim().replace(/\|/g, '/'); if (z && !(z in qty)) setQty({ ...qty, [z]: '' }); setCustom(''); }}>Add size</button>
      </div>
      {Object.entries(qty).map(([z, q]) => (
        <div className="qty-row" key={z}>
          <span>{sizeText(z, p)} <small className="muted">(now {Number(p.sizes?.[makeVariant(colour, z)]) || 0})</small></span>
          <input inputMode="numeric" type="number" min="1" placeholder="Qty" value={q} onChange={(e) => setQty({ ...qty, [z]: e.target.value })} />
          <span />
        </div>
      ))}

      <div className="two">
        <Field label="Cost price each (GH₵)"><input inputMode="decimal" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" /></Field>
        <Field label="Selling price each (GH₵)"><input inputMode="decimal" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" /></Field>
      </div>
      <p className="muted small">Prices apply to all the sizes ticked above. For a different price per size, add them in separate goes.</p>
      <div className="row-actions">
        <button className="btn primary" onClick={() => add(false)}>Add to delivery</button>
        <button className="btn" onClick={() => add(true)}>Add, then another colour</button>
      </div>
    </Modal>
  );
}

function QuickProduct({ onCreated, onClose }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(s.categories[0]?.id || '');
  function pick(v) {
    if (v !== '__new') return setCategoryId(v);
    const n = prompt('New category name, e.g. Hermes');
    if (n && n.trim()) setCategoryId(saveCategory({ name: n.trim(), order: s.categories.length + 1 }));
  }
  return (
    <Modal title="New product" onClose={onClose}>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hermes slippers" autoFocus /></Field>
      <Field label="Category">
        <select value={categoryId} onChange={(e) => pick(e.target.value)}>
          {s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new">+ New category…</option>
        </select>
      </Field>
      <button className="btn primary block" onClick={() => {
        if (!name.trim()) return alert('Enter a name.');
        onCreated(createProduct({ name: name.trim(), categoryId, price: null, cost: null, sizeAlert: null, totalAlert: null, mixedNote: '' }));
      }}>Create and continue</button>
    </Modal>
  );
}

/* ---------- Deliveries list ---------- */
export function DeliveriesList() {
  const s = useStore();
  const nav = useNav();
  const [q, setQ] = useState('');
  if (s.loading) return (<><Header title="Deliveries" /><Loading /></>);
  const list = s.deliveries.filter((d) => matches(d.supplier, q) || d.items.some((i) => matches(i.productName, q)));
  return (
    <>
      <Header title="Deliveries" right={<button className="icon-btn" onClick={() => nav.push('receive')} aria-label="Receive stock"><Icon name="plus" /></button>} />
      <Page>
        <SearchBox value={q} onChange={setQ} placeholder="Search supplier or product" />
        <div className="list">
          {list.map((d) => (
            <button key={d.id} className="row" onClick={() => nav.push('delivery', { id: d.id })}>
              <div className="row-main">
                <div className="row-title">{d.supplier || 'No supplier'}</div>
                <div className="row-sub">{fmtDate(d.date)} · {pieces(d)} pieces · {new Set(d.items.map((i) => i.productId)).size} products</div>
                {d.items.some((i) => i.cost == null) && <div className="row-sub warn-text">Some cost prices missing</div>}
              </div>
              <div className="row-end">{money(deliveryGoods(d) + deliveryOther(d))}</div>
            </button>
          ))}
          {!list.length && <Empty>No deliveries yet</Empty>}
        </div>
      </Page>
    </>
  );
}

/* ---------- Delivery detail / edit ---------- */
export function DeliveryDetail({ id }) {
  const s = useStore();
  const [edit, setEdit] = useState(null);
  if (s.loading) return (<><Header title="Delivery" /><Loading /></>);
  const d = s.deliveries.find((x) => x.id === id);
  if (!d) return (<><Header title="Delivery" /><Empty>Delivery not found.</Empty></>);
  const lotOf = (i, it) => s.lotById[deliveryLotId(d, it, i)];
  const share = (() => {
    const qty = pieces(d);
    const spread = sum((d.otherCosts || []).filter((c) => c.mode === 'spread'), (c) => c.amount);
    return qty ? spread / qty : 0;
  })();

  if (edit) return <DeliveryEdit d={d} onDone={() => setEdit(null)} />;

  return (
    <>
      <Header title="Delivery" right={<button className="icon-btn" onClick={() => setEdit(true)} aria-label="Edit"><Icon name="edit" /></button>} />
      <Page>
        <div className="card">
          <div className="kv"><span>Supplier</span><b>{d.supplier || 'Not set'}</b></div>
          <div className="kv"><span>Date bought</span><b>{fmtDate(d.date)}</b></div>
          {d.note && <div className="kv"><span>Note</span><b>{d.note}</b></div>}
          {d.by && <div className="kv"><span>Recorded by</span><b>{d.by}</b></div>}
        </div>
        <button className="btn block" onClick={() => setEdit(true)}><Icon name="edit" size={18} /> Edit supplier, date, prices or other costs</button>

        <h3 className="section">Items</h3>
        <div className="list">
          {d.items.map((it, i) => {
            const lot = lotOf(i, it);
            return (
              <div className="row static" key={i}>
                <div className="row-main">
                  <div className="row-title">{it.productName}</div>
                  <div className="row-sub">{variantLabel(it.variant, s.productById[it.productId])} · {it.qty} in{lot ? `, ${lot.remaining} left` : ''}</div>
                  <div className="row-sub">Cost {moneyOr(it.cost, 'not set')}{share && it.cost != null ? ` + ${money(share)} = ${money(it.cost + share)}` : ''} · Sell {moneyOr(it.price, 'not set')}</div>
                </div>
                <div className="row-end">{it.cost != null ? money(it.cost * it.qty) : ''}</div>
              </div>
            );
          })}
        </div>

        <DeliverySales d={d} lotOf={lotOf} />

        {(d.otherCosts || []).length > 0 && (
          <>
            <h3 className="section">Other costs</h3>
            <div className="list">
              {d.otherCosts.map((c, i) => (
                <div className="row static" key={i}>
                  <div className="row-main"><div className="row-title">{c.label}</div><div className="row-sub">{COST_MODES.find((m) => m.value === c.mode)?.label}</div></div>
                  <div className="row-end">{money(c.amount)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="card">
          <div className="kv"><span>Pieces</span><b>{pieces(d)}</b></div>
          <div className="kv"><span>Goods</span><b>{money(deliveryGoods(d))}</b></div>
          <div className="kv"><span>Other costs</span><b>{money(deliveryOther(d))}</b></div>
          <div className="kv total"><span>Total</span><b>{money(deliveryGoods(d) + deliveryOther(d))}</b></div>
          {d.items.some((i) => i.cost == null) && <p className="warn-text small">Some items have no cost price, so profit on them can't be worked out yet. Tap Edit to add them.</p>}
        </div>
      </Page>
    </>
  );
}

function DeliveryEdit({ d, onDone }) {
  const s = useStore();
  const [supplier, setSupplier] = useState(d.supplier || '');
  const [date, setDate] = useState(toInputDate(d.date));
  const [note, setNote] = useState(d.note || '');
  const [items, setItems] = useState(d.items.map((it) => ({ ...it, cost: it.cost ?? '', price: it.price ?? '' })));
  const [otherCosts, setOtherCosts] = useState(d.otherCosts || []);
  const [all, setAll] = useState({ productId: '', cost: '', price: '' });

  const products = Array.from(new Set(items.map((i) => i.productId)));

  function save() {
    if (otherCosts.some((c) => !c.label.trim() || !(c.amount > 0))) return alert('Each other cost needs a description and an amount.');
    const newDate = toInputDate(d.date) === date ? d.date : dayToTimestamp(date);
    updateDelivery(d, {
      supplier: supplier.trim(),
      date: newDate,
      note: note.trim(),
      items: items.map((it) => ({ ...it, cost: num(it.cost), price: num(it.price) })),
      otherCosts,
    });
    onDone();
  }

  return (
    <>
      <Header title="Edit delivery" />
      <Page>
        <div className="two">
          <Field label="Date bought"><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
          <Field label="Supplier">
            <input list="suppliers2" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            <datalist id="suppliers2">{s.suppliers.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </div>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>

        <div className="card">
          <div className="row-title">Set prices for a whole product</div>
          <select value={all.productId} onChange={(e) => setAll({ ...all, productId: e.target.value })}>
            <option value="">Choose product…</option>
            {products.map((pid) => <option key={pid} value={pid}>{items.find((i) => i.productId === pid).productName}</option>)}
          </select>
          <div className="qty-row three">
            <input inputMode="decimal" type="number" placeholder="Cost" value={all.cost} onChange={(e) => setAll({ ...all, cost: e.target.value })} />
            <input inputMode="decimal" type="number" placeholder="Selling" value={all.price} onChange={(e) => setAll({ ...all, price: e.target.value })} />
            <button className="btn" onClick={() => {
              if (!all.productId) return alert('Choose a product.');
              setItems(items.map((it) => (it.productId === all.productId ? { ...it, cost: all.cost !== '' ? all.cost : it.cost, price: all.price !== '' ? all.price : it.price } : it)));
            }}>Apply</button>
          </div>
        </div>

        <div className="price-table">
          <div className="price-row head"><span>Item</span><span>Cost</span><span>Selling</span></div>
          {items.map((it, i) => (
            <div className="price-row" key={i}>
              <span>{it.productName}<br /><small className="muted">{variantLabel(it.variant, s.productById[it.productId])} · {it.qty} pcs</small></span>
              <input inputMode="decimal" type="number" step="0.01" value={it.cost} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
              <input inputMode="decimal" type="number" step="0.01" value={it.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <p className="muted small">Selling prices here apply to the pieces from this delivery. Quantities are changed with Take stock.</p>

        <h3 className="section">Other costs</h3>
        {otherCosts.map((c, i) => (
          <div className="card" key={i}>
            <div className="qty-row wide">
              <input placeholder="e.g. Transport" value={c.label} onChange={(e) => setOtherCosts(otherCosts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input inputMode="decimal" type="number" step="0.01" placeholder="GH₵" value={c.amount ?? ''} onChange={(e) => setOtherCosts(otherCosts.map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)))} />
              <button className="icon-btn" onClick={() => setOtherCosts(otherCosts.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={18} /></button>
            </div>
            <select value={c.mode} onChange={(e) => setOtherCosts(otherCosts.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)))}>
              {COST_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        ))}
        <button className="btn block" onClick={() => setOtherCosts([...otherCosts, { label: '', amount: null, mode: 'spread' }])}><Icon name="plus" size={18} /> Add other cost</button>

        <div className="row-actions">
          <button className="btn primary" onClick={save}>Save</button>
          <button className="btn" onClick={onDone}>Cancel</button>
        </div>
      </Page>
    </>
  );
}

/* ---------- Expenses ---------- */
export function Expenses() {
  const s = useStore();
  const [date, setDate] = useState(toInputDate(Date.now()));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  if (s.loading) return (<><Header title="Expenses" /><Loading /></>);

  const months = [];
  for (const e of s.expenses) {
    const key = new Date(e.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    let m = months[months.length - 1];
    if (!m || m.key !== key) months.push((m = { key, items: [], total: 0 }));
    m.items.push(e);
    m.total += e.amount || 0;
  }

  return (
    <>
      <Header title="Expenses" />
      <Page>
        <p className="muted small">Shop running costs such as rent, salaries, data and transport. They reduce net profit in reports.</p>
        <div className="card">
          <div className="two">
            <Field label="Date"><input type="date" value={date} max={toInputDate(Date.now())} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
            <Field label="Amount (GH₵)"><input inputMode="decimal" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          </div>
          <Field label="What for">
            <input list="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Shop rent" />
            <datalist id="exp-desc">{['Rent', 'Salaries', 'Transport', 'Data / airtime', 'Electricity', 'Water', 'Packaging', 'Advertising'].map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <button className="btn primary" onClick={() => {
            if (!description.trim() || !(Number(amount) > 0)) return alert('Enter what it was for and the amount.');
            saveExpense({ date: dayToTimestamp(date), description: description.trim(), amount: Number(amount) });
            setDescription(''); setAmount('');
          }}>Add expense</button>
        </div>
        {months.map((m) => (
          <div key={m.key}>
            <div className="day-hdr"><span>{m.key}</span><b>{money(m.total)}</b></div>
            <div className="list">
              {m.items.map((e) => (
                <div className="row static" key={e.id}>
                  <div className="row-main"><div className="row-title">{e.description}</div><div className="row-sub">{fmtDate(e.date)}{e.by ? ` · ${e.by}` : ''}</div></div>
                  <div className="row-end">{money(e.amount)}</div>
                  <button className="icon-btn" aria-label="Delete" onClick={() => confirm(`Delete "${e.description}" ${money(e.amount)}?`) && deleteExpense(e.id)}><Icon name="x" size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!months.length && <Empty>No expenses recorded</Empty>}
      </Page>
    </>
  );
}

/** Sales that took pieces from this delivery. */
function DeliverySales({ d, lotOf }) {
  const s = useStore();
  const nav = useNav();
  const lotIds = new Set(d.items.map((it, i) => lotOf(i, it)?.id).filter(Boolean));
  const rows = [];
  for (const sale of s.sales) {
    for (const it of sale.items) {
      const q = sum((it.lots || []).filter((r) => lotIds.has(r.lotId)), (r) => r.qty);
      if (q) rows.push({ sale, it, q });
    }
  }
  const sold = sum(rows, (r) => r.q);
  return (
    <>
      <h3 className="section">Sales from this delivery ({sold} sold)</h3>
      <div className="list">
        {rows.map(({ sale, it, q }, i) => (
          <button key={sale.id + i} className="row" onClick={() => nav.push('sale', { id: sale.id })}>
            <div className="row-main">
              <div className="row-title">{it.productName} · {variantLabel(it.size, s.productById[it.productId])} × {q}</div>
              <div className="row-sub">{fmtDate(sale.date)} · {sale.customerName || 'Walk-in'}</div>
            </div>
            <div className="row-end">{it.price == null ? <span className="pill out">No price</span> : money(q * it.price)}</div>
          </button>
        ))}
        {!rows.length && <Empty>Nothing sold from this delivery yet</Empty>}
      </div>
    </>
  );
}
