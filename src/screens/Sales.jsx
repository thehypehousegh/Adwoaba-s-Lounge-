import React, { useState } from 'react';
import { allocateItems, saleProfit, saveSale, updateSale, upsertCustomer, useStore, voidSale } from '../store.jsx';
import { Chips, Empty, Field, Header, Icon, Loading, Modal, Page, ProductPicker, SearchBox, useNav } from '../ui.jsx';
import { VariantGrid } from './Stock.jsx';
import {
  DELIVERY_STATUSES,
  PAYMENT_METHODS,
  dayToTimestamp,
  defaultSalePrice,
  fmtDate,
  fmtDay,
  fmtTime,
  matches,
  money,
  moneyOr,
  num,
  sizeLabel,
  sortedSizes,
  startOfDay,
  sum,
  toInputDate,
} from '../util.js';

export const PICKUP_STATUSES = ['Waiting for pick-up', 'Picked up', 'Cancelled'];
export const ORDER_TYPES = [
  { value: 'walkin', label: 'Walk-in' },
  { value: 'pickup', label: 'Pick-up' },
  { value: 'delivery', label: 'Delivery' },
];
const EXPENSE_SUGGESTIONS = ['Rider / delivery fee', 'Packaging', 'Transport', 'Mobile Money charges', 'Gift wrap'];

const lineTotal = (it) => (it.price == null ? 0 : it.qty * it.price);
export const saleTotal = (items) => sum(items, lineTotal);
export const orderType = (sale) => sale.orderType || (sale.delivery ? 'delivery' : 'walkin');
export const customerLabel = (sale) => sale.customerName || sale.customerPhone || 'Unnamed customer';
export const pickupPending = (sale) => orderType(sale) === 'pickup' && sale.pickup?.status === 'Waiting for pick-up';
export const deliveryPending = (sale) => orderType(sale) === 'delivery' && sale.delivery && !['Delivered', 'Cancelled'].includes(sale.delivery.status);
export const statusTone = (s) => (s === 'Delivered' || s === 'Picked up' ? 'ok' : s === 'Cancelled' ? 'muted' : 'low');

function statusOf(sale) {
  const t = orderType(sale);
  if (t === 'delivery') return sale.delivery?.status;
  if (t === 'pickup') return sale.pickup?.status;
  return null;
}

/* ---------- Shared row ---------- */
export function SaleRow({ sale, sub }) {
  const nav = useNav();
  const items = sale.items.reduce((a, it) => a + it.qty, 0);
  const names = sale.items.map((it) => it.productName).join(', ');
  const t = orderType(sale);
  const st = statusOf(sale);
  return (
    <button className="row" onClick={() => nav.push('sale', { id: sale.id })}>
      <div className="row-main">
        <div className="row-title">
          {customerLabel(sale)}
          {st && <span className={`pill ${statusTone(st)}`}>{st}</span>}
          {sale.priceMissing && <span className="pill out">Price missing</span>}
        </div>
        <div className="row-sub ellipsis">{items} item{items === 1 ? '' : 's'}: {names}</div>
        <div className="row-sub">{sub} · {ORDER_TYPES.find((o) => o.value === t)?.label} · {sale.paymentMethod}</div>
      </div>
      <div className="row-end">{money(sale.total)}</div>
    </button>
  );
}

/* ---------- New sale / edit sale ---------- */
function initialState(sale, customer) {
  if (sale) {
    const t = orderType(sale);
    return {
      items: sale.items.map((it) => ({ ...it })),
      name: sale.customerName || '',
      phone: sale.customerPhone || '',
      type: t,
      collector: sale.collector || { name: '', phone: '' },
      pickupStatus: sale.pickup?.status || 'Waiting for pick-up',
      delivery: { name: '', phone: '', address: '', status: 'Pending', ...(sale.delivery || {}) },
      payment: sale.paymentMethod || 'Cash',
      expenses: (sale.expenses || []).map((e) => ({ ...e })),
      note: sale.note || '',
      date: toInputDate(sale.date),
    };
  }
  return {
    items: [],
    name: customer?.name || '',
    phone: customer?.phone || '',
    type: 'walkin',
    collector: { name: '', phone: '' },
    pickupStatus: 'Waiting for pick-up',
    delivery: { name: '', phone: '', address: customer?.address || '', status: 'Pending' },
    payment: 'Cash',
    expenses: [],
    note: '',
    date: toInputDate(Date.now()),
  };
}

export function NewSale({ productId, customerId, pushed, editId }) {
  const s = useStore();
  const nav = useNav();
  const old = editId ? s.sales?.find((x) => x.id === editId) : null;
  const [f, setF] = useState(() => initialState(old, customerId && s.customers?.find((c) => c.id === customerId)));
  const [adding, setAdding] = useState(productId ? { productId } : null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const title = editId ? 'Edit sale' : 'New sale';
  if (s.loading) return (<><Header title={title} back={!!pushed} /><Loading /></>);
  if (editId && !old) return (<><Header title={title} /><Empty>This sale was cancelled.</Empty></>);

  const total = saleTotal(f.items);
  const expenses = sum(f.expenses, (e) => e.amount);
  const preview = saleProfit({ items: allocateItems(f.items.filter((it) => it.qty > 0), s, old).items, expensesTotal: expenses }, s);

  // Customer suggestions from the Customers list
  const q = (f.name || f.phone).trim();
  const suggestions = q.length >= 2
    ? s.customers.filter((c) => (matches(c.name, f.name) && f.name) || (f.phone && matches(c.phone, f.phone))).slice(0, 4)
    : [];
  const exact = suggestions.find((c) => c.name === f.name && (c.phone || '') === f.phone);

  function pickCustomer(c) {
    set({
      name: c.name || '',
      phone: c.phone || '',
      delivery: { ...f.delivery, address: f.delivery.address || c.address || '' },
    });
  }

  function save() {
    if (!f.items.length) return alert('Add at least one item.');
    if (f.items.some((it) => !(it.qty > 0))) return alert('Each item needs a quantity.');
    if (f.expenses.some((e) => !e.label.trim() || !(e.amount > 0))) return alert('Each expense needs a description and an amount.');
    // Stock check (for an edit, what this sale already took counts as available)
    const need = {};
    f.items.forEach((it) => (need[it.productId + '|' + it.size] = (need[it.productId + '|' + it.size] || 0) + it.qty));
    const had = {};
    (old?.items || []).forEach((it) => (had[it.productId + '|' + it.size] = (had[it.productId + '|' + it.size] || 0) + it.qty));
    const short = Object.entries(need)
      .filter(([key, qn]) => {
        const [pid, size] = key.split('|');
        return qn > (Number(s.productById[pid]?.sizes?.[size]) || 0) + (had[key] || 0);
      })
      .map(([key]) => {
        const [pid, size] = key.split('|');
        const p = s.productById[pid];
        return `${p?.name || 'Deleted product'} ${sizeLabel(size, p)}`;
      });
    if (short.length && !confirm(`Not enough stock recorded for:\n${short.join('\n')}\n\nSave anyway? Stock will go below zero.`)) return;

    const name = f.name.trim();
    const phone = f.phone.trim();
    const customerId = upsertCustomer(name, phone, s.customers, { address: f.type === 'delivery' ? f.delivery.address.trim() : '' });
    const t = f.type;
    const collector = t !== 'delivery' && (f.collector.name.trim() || f.collector.phone.trim())
      ? { name: f.collector.name.trim(), phone: f.collector.phone.trim() }
      : null;
    const sameDay = old && toInputDate(old.date) === f.date;
    const sale = {
      date: sameDay ? old.date : dayToTimestamp(f.date),
      items: f.items,
      paymentMethod: f.payment,
      customerId,
      customerName: name,
      customerPhone: phone,
      orderType: t,
      collector,
      pickup: t === 'pickup'
        ? { status: f.pickupStatus, at: f.pickupStatus === 'Picked up' ? (old?.pickup?.status === 'Picked up' ? old.pickup.at : Date.now()) : null }
        : null,
      delivery: t === 'delivery'
        ? { name: f.delivery.name.trim() || name, phone: f.delivery.phone.trim() || phone, address: f.delivery.address.trim(), status: f.delivery.status, updatedAt: Date.now() }
        : null,
      expenses: f.expenses.map((e) => ({ label: e.label.trim(), amount: e.amount })),
      note: f.note.trim(),
    };
    const id = saveSale(sale, s, old);
    if (pushed || old) {
      nav.replace('sale', { id });
    } else {
      setF(initialState(null, null));
      nav.push('sale', { id });
    }
  }

  const setItem = (i, patch) => set({ items: f.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setExp = (i, patch) => set({ expenses: f.expenses.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <>
      <Header title={title} back={!!pushed || !!editId} />
      <Page>
        {/* Customer */}
        <h3 className="section">Customer</h3>
        <div className="card">
          <div className="two">
            <Field label="Name"><input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Optional" autoComplete="off" /></Field>
            <Field label="Contact"><input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Optional" autoComplete="off" /></Field>
          </div>
          {suggestions.length > 0 && !exact && (
            <div className="suggest">
              {suggestions.map((c) => (
                <button key={c.id} className="chip" onClick={() => pickCustomer(c)}>{c.name || 'No name'}{c.phone ? ` · ${c.phone}` : ''}</button>
              ))}
            </div>
          )}
          <p className="muted small">Saved to Customers automatically. An existing customer with the same name or number is reused.</p>
        </div>

        {/* Order type */}
        <h3 className="section">Order type</h3>
        <Chips value={f.type} onChange={(v) => set({ type: v })} options={ORDER_TYPES} />
        {f.type === 'walkin' && (
          <div className="card">
            <div className="field-label">Person who came to the shop, if not the customer</div>
            <div className="two">
              <input placeholder="Name" value={f.collector.name} onChange={(e) => set({ collector: { ...f.collector, name: e.target.value } })} />
              <input type="tel" placeholder="Contact" value={f.collector.phone} onChange={(e) => set({ collector: { ...f.collector, phone: e.target.value } })} />
            </div>
          </div>
        )}
        {f.type === 'pickup' && (
          <div className="card">
            <div className="field-label">Person picking up, if not the customer</div>
            <div className="two">
              <input placeholder="Name" value={f.collector.name} onChange={(e) => set({ collector: { ...f.collector, name: e.target.value } })} />
              <input type="tel" placeholder="Contact" value={f.collector.phone} onChange={(e) => set({ collector: { ...f.collector, phone: e.target.value } })} />
            </div>
            <Field label="Status">
              <select value={f.pickupStatus} onChange={(e) => set({ pickupStatus: e.target.value })}>
                {PICKUP_STATUSES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>
        )}
        {f.type === 'delivery' && (
          <div className="card">
            <div className="two">
              <Field label="Deliver to (name)"><input value={f.delivery.name} placeholder={f.name || 'Same as customer'} onChange={(e) => set({ delivery: { ...f.delivery, name: e.target.value } })} /></Field>
              <Field label="Their contact"><input type="tel" value={f.delivery.phone} placeholder={f.phone || 'Same as customer'} onChange={(e) => set({ delivery: { ...f.delivery, phone: e.target.value } })} /></Field>
            </div>
            <Field label="Address"><textarea rows="2" value={f.delivery.address} onChange={(e) => set({ delivery: { ...f.delivery, address: e.target.value } })} /></Field>
            <Field label="Status">
              <select value={f.delivery.status} onChange={(e) => set({ delivery: { ...f.delivery, status: e.target.value } })}>
                {DELIVERY_STATUSES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>
        )}

        {/* Items */}
        <h3 className="section">Items</h3>
        <div className="list">
          {f.items.map((it, i) => (
            <div className="row static col" key={i}>
              <div className="row-line">
                <div className="row-main">
                  <div className="row-title">{it.productName}</div>
                  <div className="row-sub">{sizeLabel(it.size, s.productById[it.productId])}</div>
                </div>
                <button className="icon-btn" onClick={() => set({ items: f.items.filter((_, j) => j !== i) })} aria-label="Remove"><Icon name="x" size={18} /></button>
              </div>
              <div className="item-edit">
                <label>Qty<input inputMode="numeric" type="number" min="1" value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) || 0 })} /></label>
                <label>Price each<input inputMode="decimal" type="number" step="0.01" placeholder="Missing" value={it.price ?? ''} onChange={(e) => setItem(i, { price: num(e.target.value) })} /></label>
                <b>{it.price == null ? '' : money(it.qty * it.price)}</b>
              </div>
            </div>
          ))}
        </div>
        <button className="btn block" onClick={() => setAdding({})}><Icon name="plus" size={18} /> Add item</button>

        {/* Payment */}
        <h3 className="section">Payment</h3>
        <Chips value={f.payment} onChange={(v) => set({ payment: v })} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />

        {/* Expenses for this sale */}
        <h3 className="section">Expenses for this sale</h3>
        <p className="muted small">Rider fee, packaging and so on. They come off this sale's profit.</p>
        <datalist id="sale-exp">{EXPENSE_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>
        {f.expenses.map((e, i) => (
          <div className="qty-row wide" key={i}>
            <input list="sale-exp" placeholder="e.g. Rider / delivery fee" value={e.label} onChange={(ev) => setExp(i, { label: ev.target.value })} />
            <input inputMode="decimal" type="number" step="0.01" placeholder="GH₵" value={e.amount ?? ''} onChange={(ev) => setExp(i, { amount: num(ev.target.value) })} />
            <button className="icon-btn" onClick={() => set({ expenses: f.expenses.filter((_, j) => j !== i) })} aria-label="Remove"><Icon name="x" size={18} /></button>
          </div>
        ))}
        <button className="btn block" onClick={() => set({ expenses: [...f.expenses, { label: '', amount: null }] })}><Icon name="plus" size={18} /> Add expense</button>

        <div className="two">
          <Field label="Date"><input type="date" value={f.date} max={toInputDate(Date.now())} onChange={(e) => e.target.value && set({ date: e.target.value })} /></Field>
          <Field label="Note"><input value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" /></Field>
        </div>

        <ProfitCard p={{ ...preview, total }} />

        <button className="btn primary block sticky-btn" onClick={save}>{editId ? 'Save changes' : 'Save sale'} · {money(total)}</button>

        {adding && (
          <AddItem
            initialProductId={adding.productId}
            onClose={() => setAdding(null)}
            onAdd={(it) => { set({ items: [...f.items, it] }); setAdding(null); }}
          />
        )}
      </Page>
    </>
  );
}

function ProfitCard({ p }) {
  return (
    <div className="card">
      <div className="kv"><span>Total</span><b>{money(p.total)}</b></div>
      <div className="kv"><span>Cost of items</span><b>− {money(p.cost)}</b></div>
      <div className="kv"><span>Expenses for this sale</span><b>− {money(p.expenses)}</b></div>
      <div className="kv total"><span>Profit on this sale</span><b className={p.profit < 0 ? 'neg-text' : ''}>{money(p.profit)}</b></div>
      {p.unknownQty > 0 && <p className="warn-text small">{p.unknownQty} item{p.unknownQty === 1 ? ' has' : 's have'} no cost price, so {p.unknownQty === 1 ? 'it is' : 'they are'} left out of profit.</p>}
      {p.missingPrice > 0 && <p className="warn-text small">{p.missingPrice} item{p.missingPrice === 1 ? ' has' : 's have'} no price yet.</p>}
    </div>
  );
}

function AddItem({ initialProductId, onAdd, onClose }) {
  const s = useStore();
  const [pid, setPid] = useState(initialProductId || null);
  const p = pid ? s.productById[pid] : null;
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');

  function pickVariant(v) {
    setSize(v);
    setPrice(defaultSalePrice(p, v, s.lotsFor(p.id, v)) ?? '');
  }

  if (!p) return <ProductPicker onPick={(x) => { setPid(x.id); const k = sortedSizes(x); if (k.length === 1) { setSize(k[0]); setPrice(defaultSalePrice(x, k[0], s.lotsFor(x.id, k[0])) ?? ''); } }} onClose={onClose} />;

  function add() {
    if (!size) return alert('Choose a colour and size.');
    if (!(Number(qty) > 0)) return alert('Enter a quantity.');
    onAdd({ productId: p.id, productName: p.name, categoryId: p.categoryId || '', size, qty: Number(qty), price: num(price) });
  }

  return (
    <Modal title={p.name} onClose={onClose}>
      <h3 className="section">Colour & size</h3>
      <VariantGrid p={p} onPick={pickVariant} selected={size} />
      <div className="two">
        <Field label="Quantity"><input inputMode="numeric" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Price each (GH₵)" hint="Optional. Leave blank to add it later.">
          <input inputMode="decimal" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price missing" />
        </Field>
      </div>
      <button className="btn primary block" onClick={add}>Add to sale</button>
    </Modal>
  );
}

/* ---------- Sales list ---------- */
export function SalesList({ pushed, initialFilter }) {
  const s = useStore();
  const nav = useNav();
  const [filter, setFilter] = useState(initialFilter || 'all');
  const [q, setQ] = useState('');
  if (s.loading) return (<><Header title="Sales" back={!!pushed} /><Loading /></>);

  let list = s.sales;
  if (filter === 'deliveries') list = list.filter(deliveryPending);
  if (filter === 'pickups') list = list.filter(pickupPending);
  if (filter === 'walkin' || filter === 'pickup' || filter === 'delivery') list = list.filter((x) => orderType(x) === filter);
  if (filter === 'missing') list = list.filter((x) => x.priceMissing);
  if (q) {
    list = list.filter((x) =>
      matches(x.customerName, q) || matches(x.customerPhone, q) || matches(x.collector?.name, q) ||
      x.items.some((it) => matches(it.productName, q)) || matches(x.delivery?.address, q) || matches(x.delivery?.name, q));
  }

  const groups = [];
  for (const sale of list.slice(0, 500)) {
    const day = startOfDay(sale.date);
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) groups.push((g = { day, sales: [], total: 0 }));
    g.sales.push(sale);
    g.total += sale.total || 0;
  }

  return (
    <>
      <Header title="Sales" back={!!pushed} right={<button className="icon-btn" onClick={() => nav.goTab('sell')} aria-label="New sale"><Icon name="plus" /></button>} />
      <Page>
        <SearchBox value={q} onChange={setQ} placeholder="Search customer, contact, product, address" />
        <Chips value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All sales' },
          { value: 'deliveries', label: 'Deliveries to do' },
          { value: 'pickups', label: 'Waiting for pick-up' },
          { value: 'walkin', label: 'Walk-in' },
          { value: 'pickup', label: 'Pick-up' },
          { value: 'delivery', label: 'Delivery' },
          { value: 'missing', label: 'Price missing' },
        ]} />
        {groups.map((g) => (
          <div key={g.day}>
            <div className="day-hdr"><span>{fmtDay(g.day)}</span><b>{money(g.total)}</b></div>
            <div className="list">
              {g.sales.map((sale) => <SaleRow key={sale.id} sale={sale} sub={fmtTime(sale.date)} />)}
            </div>
          </div>
        ))}
        {!groups.length && <Empty>No sales</Empty>}
      </Page>
    </>
  );
}

/* ---------- Sale detail ---------- */
export function SaleDetail({ id }) {
  const s = useStore();
  const nav = useNav();
  const sale = s.sales?.find((x) => x.id === id);

  if (s.loading) return (<><Header title="Sale" /><Loading /></>);
  if (!sale) return (<><Header title="Sale" /><Empty>This sale was cancelled.</Empty></>);
  const t = orderType(sale);
  const profit = saleProfit(sale, s);

  function share() {
    const lines = [
      "Adwoaba's Lounge",
      `${fmtDate(sale.date)} ${fmtTime(sale.date)}`,
      sale.customerName ? `Customer: ${sale.customerName}${sale.customerPhone ? ` (${sale.customerPhone})` : ''}` : '',
      '',
      ...sale.items.map((it) => `${it.productName} (${sizeLabel(it.size, s.productById[it.productId])}) ${it.qty} x ${it.price == null ? 'price to be confirmed' : `${money(it.price)} = ${money(it.qty * it.price)}`}`),
      '',
      `Total: ${money(sale.total)}`,
      `Paid by: ${sale.paymentMethod}`,
      t === 'delivery' && sale.delivery ? `Delivery to: ${[sale.delivery.name, sale.delivery.phone, sale.delivery.address].filter(Boolean).join(', ')} (${sale.delivery.status})` : '',
      t === 'pickup' ? `Pick-up${sale.collector?.name ? ` by ${sale.collector.name}` : ''} (${sale.pickup?.status || ''})` : '',
      '',
      'Thank you for shopping with us!',
    ].filter((x, i, a) => x !== '' || a[i - 1] !== '');
    const text = lines.join('\n');
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => alert('Receipt copied.'));
  }

  const tel = (n) => (n ? <a className="link" href={`tel:${n.replace(/[^\d+]/g, '')}`}>{n}</a> : <b>Not given</b>);

  return (
    <>
      <Header title="Sale" right={<>
        <button className="icon-btn" onClick={() => nav.push('saleEdit', { editId: id })} aria-label="Edit sale"><Icon name="edit" /></button>
        <button className="icon-btn" onClick={share} aria-label="Share receipt"><Icon name="share" /></button>
      </>} />
      <Page>
        <div className="card">
          <div className="kv"><span>Customer</span>
            {sale.customerId && s.customers.some((c) => c.id === sale.customerId)
              ? <button className="link" onClick={() => nav.push('customer', { id: sale.customerId })}>{customerLabel(sale)}</button>
              : <b>{customerLabel(sale)}</b>}
          </div>
          <div className="kv"><span>Contact</span>{tel(sale.customerPhone)}</div>
          <div className="kv"><span>Date</span><b>{fmtDate(sale.date)} {fmtTime(sale.date)}</b></div>
          <div className="kv"><span>Payment</span><b>{sale.paymentMethod}</b></div>
          {sale.note && <div className="kv"><span>Note</span><b>{sale.note}</b></div>}
          <div className="kv"><span>Recorded by</span><b>{sale.by || 'Unknown'}</b></div>
          {sale.editedAt && <div className="kv"><span>Last edited</span><b>{fmtDate(sale.editedAt)} {fmtTime(sale.editedAt)}{sale.editedBy ? ` · ${sale.editedBy}` : ''}</b></div>}
        </div>

        <h3 className="section">{ORDER_TYPES.find((o) => o.value === t)?.label}</h3>
        <div className="card">
          {t === 'walkin' && (
            sale.collector ? (
              <>
                <div className="kv"><span>Came to the shop</span><b>{sale.collector.name || 'Not given'}</b></div>
                <div className="kv"><span>Their contact</span>{tel(sale.collector.phone)}</div>
              </>
            ) : <p className="muted small">The customer came to the shop.</p>
          )}
          {t === 'pickup' && (
            <>
              <div className="kv"><span>Picked up by</span><b>{sale.collector?.name || 'The customer'}</b></div>
              {sale.collector?.phone && <div className="kv"><span>Their contact</span>{tel(sale.collector.phone)}</div>}
              {sale.pickup?.status === 'Picked up' && sale.pickup.at && <div className="kv"><span>Picked up on</span><b>{fmtDate(sale.pickup.at)} {fmtTime(sale.pickup.at)}</b></div>}
              <Field label="Status">
                <select value={sale.pickup?.status || 'Waiting for pick-up'} onChange={(e) => updateSale(id, { pickup: { status: e.target.value, at: e.target.value === 'Picked up' ? Date.now() : null } })}>
                  {PICKUP_STATUSES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
            </>
          )}
          {t === 'delivery' && sale.delivery && (
            <>
              <div className="kv"><span>Deliver to</span><b>{sale.delivery.name || customerLabel(sale)}</b></div>
              <div className="kv"><span>Their contact</span>{tel(sale.delivery.phone || sale.customerPhone)}</div>
              <div className="kv"><span>Address</span><b>{sale.delivery.address || 'Not set'}</b></div>
              <Field label="Status">
                <select value={sale.delivery.status} onChange={(e) => updateSale(id, { delivery: { ...sale.delivery, status: e.target.value, updatedAt: Date.now() } })}>
                  {DELIVERY_STATUSES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>

        <h3 className="section">Items</h3>
        <div className="list">
          {sale.items.map((it, i) => (
            <button className="row" key={i} onClick={() => s.productById[it.productId] && nav.push('product', { id: it.productId })}>
              <div className="row-main">
                <div className="row-title">{it.productName}</div>
                <div className="row-sub">{sizeLabel(it.size, s.productById[it.productId])} · {it.qty} × {moneyOr(it.price, 'price missing')}</div>
              </div>
              <div className="row-end">{it.price == null ? <span className="pill out">Add price</span> : money(it.qty * it.price)}</div>
            </button>
          ))}
        </div>
        {sale.items.some((it) => it.price == null) && <MissingPrices sale={sale} />}

        {(sale.expenses || []).length > 0 && (
          <>
            <h3 className="section">Expenses for this sale</h3>
            <div className="list">
              {sale.expenses.map((e, i) => (
                <div className="row static" key={i}>
                  <div className="row-main"><div className="row-title">{e.label}</div></div>
                  <div className="row-end">{money(e.amount)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <ProfitCard p={{ ...profit, total: sale.total }} />

        <button className="btn block" onClick={() => nav.push('saleEdit', { editId: id })}><Icon name="edit" size={18} /> Edit sale</button>
        <button className="btn danger block" onClick={() => {
          if (confirm('Cancel this sale? It will be deleted and the items put back into stock.')) {
            voidSale(sale, s.productById, s.lotById);
            nav.pop();
          }
        }}>Cancel sale and return items to stock</button>
      </Page>
    </>
  );
}

function MissingPrices({ sale }) {
  const s = useStore();
  const [vals, setVals] = useState({});
  return (
    <div className="card warn-card">
      <strong>Add missing prices</strong>
      {sale.items.map((it, i) =>
        it.price == null ? (
          <div className="qty-row" key={i}>
            <span>{it.productName} · {sizeLabel(it.size, s.productById[it.productId])} × {it.qty}</span>
            <input inputMode="decimal" type="number" step="0.01" placeholder="Price each" value={vals[i] ?? ''} onChange={(e) => setVals({ ...vals, [i]: e.target.value })} />
            <span />
          </div>
        ) : null
      )}
      <button className="btn primary" onClick={() => {
        const items = sale.items.map((it, i) => (it.price == null && num(vals[i]) != null ? { ...it, price: num(vals[i]) } : it));
        updateSale(sale.id, { items, total: saleTotal(items), priceMissing: items.some((it) => it.price == null) });
        setVals({});
      }}>Save prices</button>
    </div>
  );
}
