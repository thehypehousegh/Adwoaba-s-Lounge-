import React, { useState } from 'react';
import { deleteCustomer, saveCustomer, useStore } from '../store.jsx';
import { Empty, Field, Header, Icon, Loading, Page, SearchBox, Stat, useNav } from '../ui.jsx';
import { fmtDate, matches, money } from '../util.js';
import { SaleRow } from './Sales.jsx';

function customerTotals(sales) {
  const t = {};
  for (const s of sales) {
    if (!s.customerId) continue;
    const x = (t[s.customerId] = t[s.customerId] || { count: 0, total: 0, last: 0 });
    x.count++;
    x.total += s.total || 0;
    x.last = Math.max(x.last, s.date);
  }
  return t;
}

export function CustomerList() {
  const s = useStore();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  if (s.loading) return (<><Header title="Customers" /><Loading /></>);

  const totals = customerTotals(s.sales);
  let list = s.customers.filter((c) => matches(c.name, q) || matches(c.phone, q));
  if (sort === 'spent') list = [...list].sort((a, b) => (totals[b.id]?.total || 0) - (totals[a.id]?.total || 0));
  if (sort === 'recent') list = [...list].sort((a, b) => (totals[b.id]?.last || 0) - (totals[a.id]?.last || 0));

  return (
    <>
      <Header title="Customers" right={<button className="icon-btn" onClick={() => nav.push('customerForm')} aria-label="Add customer"><Icon name="plus" /></button>} />
      <Page>
        <SearchBox value={q} onChange={setQ} placeholder="Search name or phone" />
        <div className="chips">
          {[['name', 'A to Z'], ['spent', 'Top spenders'], ['recent', 'Recent']].map(([v, l]) => (
            <button key={v} className={`chip ${sort === v ? 'on' : ''}`} onClick={() => setSort(v)}>{l}</button>
          ))}
        </div>
        <p className="muted small">{s.customers.length} customers</p>
        <div className="list">
          {list.map((c) => (
            <button key={c.id} className="row" onClick={() => nav.push('customer', { id: c.id })}>
              <div className="row-main">
                <div className="row-title">{c.name}</div>
                <div className="row-sub">{c.phone || 'No phone'}{totals[c.id] ? ` · ${totals[c.id].count} purchase${totals[c.id].count === 1 ? '' : 's'}` : ''}</div>
              </div>
              <div className="row-end">{totals[c.id] ? money(totals[c.id].total) : ''}</div>
            </button>
          ))}
          {!list.length && <Empty>No customers yet</Empty>}
        </div>
      </Page>
    </>
  );
}

export function CustomerDetail({ id }) {
  const s = useStore();
  const nav = useNav();
  if (s.loading) return (<><Header title="Customer" /><Loading /></>);
  const c = s.customers.find((x) => x.id === id);
  if (!c) return (<><Header title="Customer" /><Empty>This customer was deleted.</Empty></>);
  const sales = s.sales.filter((x) => x.customerId === id);
  const total = sales.reduce((a, x) => a + (x.total || 0), 0);
  const phone = (c.phone || '').replace(/[^\d+]/g, '');
  const wa = phone.startsWith('0') ? '233' + phone.slice(1) : phone.replace('+', '');

  return (
    <>
      <Header title={c.name} right={<button className="icon-btn" onClick={() => nav.push('customerForm', { id })} aria-label="Edit"><Icon name="edit" /></button>} />
      <Page>
        <div className="card">
          <div className="kv"><span>Phone</span><b>{c.phone || 'Not set'}</b></div>
          <div className="kv"><span>Address</span><b>{c.address || 'Not set'}</b></div>
          {c.notes && <div className="kv"><span>Notes</span><b>{c.notes}</b></div>}
          {c.createdAt && <div className="kv"><span>Customer since</span><b>{fmtDate(c.createdAt)}</b></div>}
          {phone && (
            <div className="row-actions">
              <a className="btn" href={`tel:${phone}`}><Icon name="phone" size={18} /> Call</a>
              <a className="btn" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>
            </div>
          )}
        </div>
        <div className="stats">
          <Stat label="Purchases" value={sales.length} />
          <Stat label="Total spent" value={money(total)} />
        </div>
        <button className="btn primary block" onClick={() => nav.push('newSale', { pushed: true, customerId: id })}>New sale</button>
        <h3 className="section">Purchase history</h3>
        <div className="list">
          {sales.map((sale) => <SaleRow key={sale.id} sale={sale} sub={fmtDate(sale.date)} />)}
          {!sales.length && <Empty>No purchases yet</Empty>}
        </div>
      </Page>
    </>
  );
}

export function CustomerForm({ id }) {
  const s = useStore();
  const nav = useNav();
  const existing = id ? s.customers?.find((x) => x.id === id) : null;
  const [f, setF] = useState({
    name: existing?.name || '',
    phone: existing?.phone || '',
    address: existing?.address || '',
    notes: existing?.notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <Header title={existing ? 'Edit customer' : 'New customer'} />
      <Page>
        <Field label="Name"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Phone"><input type="tel" value={f.phone} onChange={set('phone')} placeholder="e.g. 024 123 4567" /></Field>
        <Field label="Address"><textarea rows="2" value={f.address} onChange={set('address')} /></Field>
        <Field label="Notes" hint="e.g. shoe size, favourite styles"><textarea rows="2" value={f.notes} onChange={set('notes')} /></Field>
        <button className="btn primary block" onClick={() => {
          if (!f.name.trim()) return alert('Enter a name.');
          const cid = saveCustomer({ ...(id ? { id } : {}), name: f.name.trim(), phone: f.phone.trim(), address: f.address.trim(), notes: f.notes.trim() });
          if (id) nav.pop();
          else nav.replace('customer', { id: cid });
        }}>Save</button>
        {existing && (
          <button className="btn danger block" onClick={() => {
            if (confirm(`Delete ${existing.name}? Their past sales stay, under their name.`)) {
              deleteCustomer(id);
              nav.pop();
            }
          }}>Delete customer</button>
        )}
      </Page>
    </>
  );
}
