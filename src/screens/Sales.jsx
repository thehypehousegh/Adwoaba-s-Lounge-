import React, { useState } from 'react';
import { createSale, saveCustomer, updateSale, useStore, voidSale } from '../store.jsx';
import { Chips, Empty, Field, Header, Icon, Loading, Modal, Page, ProductPicker, SearchBox, useNav } from '../ui.jsx';
import {
  DELIVERY_STATUSES,
  PAYMENT_METHODS,
  fmtDate,
  fmtDay,
  fmtTime,
  fromInputDate,
  matches,
  money,
  sizeLabel,
  sortedSizes,
  startOfDay,
  toInputDate,
} from '../util.js';

/* ---------- Shared row ---------- */
export function SaleRow({ sale, sub }) {
  const nav = useNav();
  const items = sale.items.reduce((a, it) => a + it.qty, 0);
  const names = sale.items.map((it) => it.productName).join(', ');
  return (
    <button className="row" onClick={() => nav.push('sale', { id: sale.id })}>
      <div className="row-main">
        <div className="row-title">
          {sale.customerName || 'Walk-in'}
          {sale.delivery && <span className={`pill ${statusTone(sale.delivery.status)}`}>{sale.delivery.status}</span>}
        </div>
        <div className="row-sub ellipsis">{items} item{items === 1 ? '' : 's'}: {names}</div>
        <div className="row-sub">{sub} · {sale.paymentMethod}</div>
      </div>
      <div className="row-end">{money(sale.total)}</div>
    </button>
  );
}

export const statusTone = (s) => (s === 'Delivered' ? 'ok' : s === 'Cancelled' ? 'muted' : 'low');

/* ---------- New sale ---------- */
const blankDelivery = { name: '', address: '', status: 'Pending' };

export function NewSale({ productId, customerId, pushed }) {
  const s = useStore();
  const nav = useNav();
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(productId ? { productId } : null); // {productId?}
  const [customer, setCustomer] = useState(() => (customerId && s.customers?.find((c) => c.id === customerId)) || null); // null = walk-in
  const [pickCustomer, setPickCustomer] = useState(false);
  const [payment, setPayment] = useState('Cash');
  const [isDelivery, setIsDelivery] = useState(false);
  const [delivery, setDelivery] = useState(blankDelivery);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toInputDate(Date.now()));

  if (s.loading) return (<><Header title="New sale" back={!!pushed} /><Loading /></>);

  const total = items.reduce((a, it) => a + it.qty * it.price, 0);

  function chooseCustomer(c) {
    setCustomer(c);
    setPickCustomer(false);
    if (c) setDelivery((d) => ({ ...d, name: d.name || c.name, address: d.address || c.address || '' }));
  }

  function save() {
    if (!items.length) return alert('Add at least one item.');
    if (isDelivery && !delivery.name.trim() && !delivery.address.trim()) return alert('Enter the delivery name and address.');
    // Stock check (stock may already be low on this phone's view)
    const need = {};
    items.forEach((it) => (need[it.productId + '|' + it.size] = (need[it.productId + '|' + it.size] || 0) + it.qty));
    const short = Object.entries(need)
      .filter(([key, q]) => {
        const [pid, size] = key.split('|');
        return q > (Number(s.productById[pid]?.sizes?.[size]) || 0);
      })
      .map(([key]) => {
        const [pid, size] = key.split('|');
        const p = s.productById[pid];
        return `${p?.name} size ${sizeLabel(size, p)}`;
      });
    if (short.length && !confirm(`Not enough stock recorded for:\n${short.join('\n')}\n\nSave the sale anyway? Stock will go below zero.`)) return;

    const day = fromInputDate(date);
    const isToday = day === startOfDay(Date.now());
    const when = isToday ? Date.now() : day + 12 * 3600000;
    const id = createSale({
      date: when,
      items,
      total,
      paymentMethod: payment,
      customerId: customer?.id || null,
      customerName: customer?.name || '',
      customerPhone: customer?.phone || '',
      delivery: isDelivery ? { name: delivery.name.trim(), address: delivery.address.trim(), status: delivery.status, updatedAt: Date.now() } : null,
      note: note.trim(),
    });
    if (pushed) {
      nav.replace('sale', { id });
    } else {
      setItems([]); setCustomer(null); setPayment('Cash'); setIsDelivery(false); setDelivery(blankDelivery); setNote(''); setDate(toInputDate(Date.now()));
      nav.push('sale', { id });
    }
  }

  return (
    <>
      <Header title="New sale" back={!!pushed} />
      <Page>
        <h3 className="section">Items</h3>
        <div className="list">
          {items.map((it, i) => (
            <div className="row static" key={i}>
              <div className="row-main">
                <div className="row-title">{it.productName}</div>
                <div className="row-sub">Size {sizeLabel(it.size, s.productById[it.productId])} · {it.qty} × {money(it.price)}</div>
              </div>
              <div className="row-end">{money(it.qty * it.price)}</div>
              <button className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={18} /></button>
            </div>
          ))}
        </div>
        <button className="btn block" onClick={() => setAdding({})}><Icon name="plus" size={18} /> Add item</button>

        <div className="total-line"><span>Total</span><b>{money(total)}</b></div>

        <h3 className="section">Customer</h3>
        <button className="card card-btn" onClick={() => setPickCustomer(true)}>
          <div className="row-title">{customer ? customer.name : 'Walk-in customer'}</div>
          <div className="row-sub">{customer ? customer.phone || 'No phone' : 'Tap to choose or add a customer'}</div>
        </button>

        <h3 className="section">Payment</h3>
        <Chips value={payment} onChange={setPayment} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />

        <label className="toggle">
          <input type="checkbox" checked={isDelivery} onChange={(e) => setIsDelivery(e.target.checked)} /> Delivery
        </label>
        {isDelivery && (
          <div className="card">
            <Field label="Deliver to (name)"><input value={delivery.name} onChange={(e) => setDelivery({ ...delivery, name: e.target.value })} /></Field>
            <Field label="Address"><textarea rows="2" value={delivery.address} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} /></Field>
            <Field label="Status">
              <select value={delivery.status} onChange={(e) => setDelivery({ ...delivery, status: e.target.value })}>
                {DELIVERY_STATUSES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>
        )}

        <div className="two">
          <Field label="Date"><input type="date" value={date} max={toInputDate(Date.now())} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
          <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
        </div>

        <button className="btn primary block sticky-btn" onClick={save}>Save sale · {money(total)}</button>

        {adding && (
          <AddItem
            initialProductId={adding.productId}
            onClose={() => setAdding(null)}
            onAdd={(it) => { setItems([...items, it]); setAdding(null); }}
          />
        )}
        {pickCustomer && <CustomerPicker onPick={chooseCustomer} onClose={() => setPickCustomer(false)} />}
      </Page>
    </>
  );
}

function AddItem({ initialProductId, onAdd, onClose }) {
  const s = useStore();
  const [pid, setPid] = useState(initialProductId || null);
  const p = pid ? s.productById[pid] : null;
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(p?.price ?? '');

  if (!p) return <ProductPicker onPick={(x) => { setPid(x.id); setPrice(x.price ?? ''); const k = sortedSizes(x); if (k.length === 1) setSize(k[0]); }} onClose={onClose} />;

  const keys = sortedSizes(p);
  function add() {
    if (!size) return alert('Choose a size.');
    if (!(Number(qty) > 0)) return alert('Enter a quantity.');
    if (price === '' || !(Number(price) >= 0)) return alert('Enter the selling price.');
    onAdd({
      productId: p.id,
      productName: p.name,
      categoryId: p.categoryId || '',
      size,
      qty: Number(qty),
      price: Number(price),
      cost: p.cost ?? null,
    });
  }

  return (
    <Modal title={p.name} onClose={onClose}>
      <h3 className="section">Size</h3>
      <div className="size-grid">
        {keys.map((k) => {
          const q = Number(p.sizes[k]) || 0;
          return (
            <button key={k} className={`size-cell pick ${size === k ? 'on' : ''} ${q <= 0 ? 'zero' : ''}`} onClick={() => setSize(k)}>
              <div className="size-cell-label">{sizeLabel(k, p)}</div>
              <div className="size-cell-qty small">{q} left</div>
            </button>
          );
        })}
      </div>
      <div className="two">
        <Field label="Quantity"><input inputMode="numeric" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Price each (GH₵)" hint={p.price == null ? 'No price saved for this product' : ''}>
          <input inputMode="decimal" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <button className="btn primary block" onClick={add}>Add to sale</button>
    </Modal>
  );
}

function CustomerPicker({ onPick, onClose }) {
  const { customers } = useStore();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const list = customers.filter((c) => matches(c.name, q) || matches(c.phone, q));

  if (adding) {
    return (
      <Modal title="New customer" onClose={() => setAdding(false)}>
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Phone"><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <button className="btn primary block" onClick={() => {
          if (!form.name.trim()) return alert('Enter a name.');
          const c = { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), notes: '' };
          const id = saveCustomer(c);
          onPick({ id, ...c });
        }}>Save customer</button>
      </Modal>
    );
  }

  return (
    <Modal title="Customer" onClose={onClose}>
      <SearchBox value={q} onChange={setQ} placeholder="Search name or phone" />
      <div className="row-actions">
        <button className="btn primary" onClick={() => { setForm({ name: q, phone: '', address: '' }); setAdding(true); }}>New customer</button>
        <button className="btn" onClick={() => onPick(null)}>Walk-in</button>
      </div>
      <div className="list">
        {list.map((c) => (
          <button key={c.id} className="row" onClick={() => onPick(c)}>
            <div className="row-main">
              <div className="row-title">{c.name}</div>
              <div className="row-sub">{c.phone || 'No phone'}</div>
            </div>
          </button>
        ))}
        {!list.length && <Empty>No customers found</Empty>}
      </div>
    </Modal>
  );
}

/* ---------- Sales list ---------- */
export function SalesList() {
  const s = useStore();
  const nav = useNav();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  if (s.loading) return (<><Header title="Sales" back={false} /><Loading /></>);

  let list = s.sales;
  if (filter === 'deliveries') list = list.filter((x) => x.delivery && !['Delivered', 'Cancelled'].includes(x.delivery.status));
  if (filter === 'allDeliveries') list = list.filter((x) => x.delivery);
  if (q) list = list.filter((x) => matches(x.customerName, q) || x.items.some((it) => matches(it.productName, q)) || matches(x.delivery?.address, q));

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
      <Header title="Sales" back={false} right={<button className="icon-btn" onClick={() => nav.goTab('sell')} aria-label="New sale"><Icon name="plus" /></button>} />
      <Page>
        <SearchBox value={q} onChange={setQ} placeholder="Search customer, product, address" />
        <Chips value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All sales' },
          { value: 'deliveries', label: 'Deliveries to do' },
          { value: 'allDeliveries', label: 'All deliveries' },
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
  const [editDelivery, setEditDelivery] = useState(false);
  const [d, setD] = useState(null);

  if (s.loading) return (<><Header title="Sale" /><Loading /></>);
  if (!sale) return (<><Header title="Sale" /><Empty>This sale was cancelled.</Empty></>);

  function share() {
    const lines = [
      "Adwoaba's Lounge",
      `${fmtDate(sale.date)} ${fmtTime(sale.date)}`,
      sale.customerName ? `Customer: ${sale.customerName}` : '',
      '',
      ...sale.items.map((it) => `${it.productName} (size ${sizeLabel(it.size, s.productById[it.productId])}) ${it.qty} x ${money(it.price)} = ${money(it.qty * it.price)}`),
      '',
      `Total: ${money(sale.total)}`,
      `Paid by: ${sale.paymentMethod}`,
      sale.delivery ? `Delivery to: ${sale.delivery.name}, ${sale.delivery.address} (${sale.delivery.status})` : '',
      '',
      'Thank you for shopping with us!',
    ].filter((x, i, a) => x !== '' || a[i - 1] !== '');
    const text = lines.join('\n');
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => alert('Receipt copied.'));
  }

  return (
    <>
      <Header title="Sale" right={<button className="icon-btn" onClick={share} aria-label="Share receipt"><Icon name="share" /></button>} />
      <Page>
        <div className="card">
          <div className="kv"><span>Date</span><b>{fmtDate(sale.date)} {fmtTime(sale.date)}</b></div>
          <div className="kv"><span>Customer</span>
            {sale.customerId ? <button className="link" onClick={() => nav.push('customer', { id: sale.customerId })}>{sale.customerName}</button> : <b>{sale.customerName || 'Walk-in'}</b>}
          </div>
          <div className="kv"><span>Payment</span><b>{sale.paymentMethod}</b></div>
          {sale.by && <div className="kv"><span>Recorded by</span><b>{sale.by}</b></div>}
          {sale.note && <div className="kv"><span>Note</span><b>{sale.note}</b></div>}
        </div>

        <h3 className="section">Items</h3>
        <div className="list">
          {sale.items.map((it, i) => (
            <button className="row" key={i} onClick={() => s.productById[it.productId] && nav.push('product', { id: it.productId })}>
              <div className="row-main">
                <div className="row-title">{it.productName}</div>
                <div className="row-sub">Size {sizeLabel(it.size, s.productById[it.productId])} · {it.qty} × {money(it.price)}</div>
              </div>
              <div className="row-end">{money(it.qty * it.price)}</div>
            </button>
          ))}
        </div>
        <div className="total-line"><span>Total</span><b>{money(sale.total)}</b></div>

        <h3 className="section">Delivery</h3>
        {sale.delivery && !editDelivery ? (
          <div className="card">
            <div className="kv"><span>Name</span><b>{sale.delivery.name || 'Not set'}</b></div>
            <div className="kv"><span>Address</span><b>{sale.delivery.address || 'Not set'}</b></div>
            <Field label="Status">
              <select value={sale.delivery.status} onChange={(e) => updateSale(id, { delivery: { ...sale.delivery, status: e.target.value, updatedAt: Date.now() } })}>
                {DELIVERY_STATUSES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <button className="btn" onClick={() => { setD(sale.delivery); setEditDelivery(true); }}>Edit name or address</button>
          </div>
        ) : editDelivery || !sale.delivery ? (
          editDelivery ? (
            <div className="card">
              <Field label="Name"><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
              <Field label="Address"><textarea rows="2" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
              <Field label="Status">
                <select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>
                  {DELIVERY_STATUSES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <div className="row-actions">
                <button className="btn primary" onClick={() => { updateSale(id, { delivery: { ...d, updatedAt: Date.now() } }); setEditDelivery(false); }}>Save</button>
                <button className="btn" onClick={() => setEditDelivery(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn block" onClick={() => { setD({ name: sale.customerName || '', address: '', status: 'Pending' }); setEditDelivery(true); }}>Add delivery</button>
          )
        ) : null}

        <button className="btn danger block" onClick={() => {
          if (confirm('Cancel this sale? It will be deleted and the items put back into stock.')) {
            voidSale(sale, s.productById);
            nav.pop();
          }
        }}>Cancel sale and return items to stock</button>
      </Page>
    </>
  );
}
