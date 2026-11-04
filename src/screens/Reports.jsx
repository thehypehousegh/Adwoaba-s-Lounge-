import React, { useEffect, useMemo, useState } from 'react';
import { subscribeMovements, useStore } from '../store.jsx';
import { Chips, Field, Header, Loading, Page, Stat } from '../ui.jsx';
import {
  downloadFile,
  endOfDay,
  fmtDate,
  fmtDay,
  fmtTime,
  fromInputDate,
  money,
  productAlerts,
  sizeLabel,
  startOfDay,
  toCSV,
  toInputDate,
  totalStock,
} from '../util.js';

const DAY = 86400000;

function presetRange(preset) {
  const today = startOfDay(Date.now());
  const d = new Date(today);
  switch (preset) {
    case 'today': return [today, endOfDay(today)];
    case 'yesterday': return [today - DAY, today - 1];
    case 'week': {
      const dow = (d.getDay() + 6) % 7; // Monday start
      return [today - dow * DAY, endOfDay(today)];
    }
    case 'month': return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), endOfDay(today)];
    case 'lastMonth': return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1];
    case 'year': return [new Date(d.getFullYear(), 0, 1).getTime(), endOfDay(today)];
    default: return null;
  }
}

function addTo(map, key, fields) {
  const x = (map[key] = map[key] || { key, qty: 0, revenue: 0, count: 0 });
  for (const [k, v] of Object.entries(fields)) x[k] = (x[k] || 0) + v;
  return x;
}

export default function Reports() {
  const s = useStore();
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(toInputDate(Date.now() - 6 * DAY));
  const [to, setTo] = useState(toInputDate(Date.now()));
  const [moves, setMoves] = useState(null);
  const [start, end] = preset === 'custom' ? [fromInputDate(from), endOfDay(fromInputDate(to))] : presetRange(preset);
  useEffect(() => subscribeMovements(setMoves, { since: start }), [start]);

  const r = useMemo(() => {
    if (s.loading) return null;
    const sales = s.sales.filter((x) => x.date >= start && x.date <= end);
    const out = {
      sales,
      count: sales.length,
      revenue: 0,
      units: 0,
      cost: 0,
      costedRevenue: 0,
      uncosted: 0,
      byPayment: {},
      byCategory: {},
      byProduct: {},
      byDay: {},
      byCustomer: {},
      byDelivery: {},
      bySize: {},
    };
    for (const sale of sales) {
      out.revenue += sale.total || 0;
      addTo(out.byPayment, sale.paymentMethod || 'Other', { revenue: sale.total || 0, count: 1 });
      addTo(out.byDay, startOfDay(sale.date), { revenue: sale.total || 0, count: 1 });
      if (sale.customerId) addTo(out.byCustomer, sale.customerName, { revenue: sale.total || 0, count: 1 });
      if (sale.delivery) addTo(out.byDelivery, sale.delivery.status, { count: 1 });
      for (const it of sale.items) {
        const line = it.qty * it.price;
        out.units += it.qty;
        const cost = it.cost ?? s.productById[it.productId]?.cost ?? null;
        if (cost != null) {
          out.cost += cost * it.qty;
          out.costedRevenue += line;
        } else out.uncosted += it.qty;
        addTo(out.byCategory, s.catName[it.categoryId || s.productById[it.productId]?.categoryId] || 'No category', { qty: it.qty, revenue: line });
        addTo(out.byProduct, it.productName, { qty: it.qty, revenue: line });
        addTo(out.bySize, it.size, { qty: it.qty });
      }
    }
    const sort = (m, k = 'revenue') => Object.values(m).sort((a, b) => b[k] - a[k]);
    out.payment = sort(out.byPayment);
    out.category = sort(out.byCategory);
    out.product = sort(out.byProduct, 'qty');
    out.customer = sort(out.byCustomer).slice(0, 10);
    out.delivery = sort(out.byDelivery, 'count');
    out.size = sort(out.bySize, 'qty');
    out.day = Object.values(out.byDay).sort((a, b) => b.key - a.key);
    out.profit = out.costedRevenue - out.cost;

    const ms = (moves || []).filter((m) => m.date >= start && m.date <= end);
    out.received = ms.filter((m) => m.reason === 'Received').reduce((a, m) => a + m.change, 0);
    out.countAdj = ms.filter((m) => m.reason === 'Stock count').reduce((a, m) => a + m.change, 0);

    // Current stock snapshot
    out.stockUnits = s.products.reduce((a, p) => a + totalStock(p), 0);
    out.stockAtPrice = s.products.reduce((a, p) => a + (p.price != null ? p.price * Math.max(0, totalStock(p)) : 0), 0);
    out.stockAtCost = s.products.reduce((a, p) => a + (p.cost != null ? p.cost * Math.max(0, totalStock(p)) : 0), 0);
    out.unpriced = s.products.filter((p) => p.price == null).length;
    out.lowCount = s.products.filter((p) => productAlerts(p, s.settings).length).length;
    return out;
  }, [s, start, end, moves]);

  if (!r) return (<><Header title="Reports" /><Loading /></>);

  const rangeLabel = `${fmtDate(start)} to ${fmtDate(end)}`;

  function exportSales() {
    const rows = [['Date', 'Time', 'Customer', 'Phone', 'Product', 'Category', 'Size', 'Qty', 'Price', 'Line total', 'Payment', 'Delivery name', 'Delivery address', 'Delivery status', 'Note', 'Recorded by']];
    for (const sale of [...r.sales].reverse()) {
      for (const it of sale.items) {
        rows.push([
          fmtDate(sale.date), fmtTime(sale.date), sale.customerName || 'Walk-in', sale.customerPhone || '',
          it.productName, s.catName[it.categoryId] || '', sizeLabel(it.size, s.productById[it.productId]), it.qty, it.price, it.qty * it.price,
          sale.paymentMethod, sale.delivery?.name || '', sale.delivery?.address || '', sale.delivery?.status || '', sale.note || '', sale.by || '',
        ]);
      }
    }
    downloadFile(`sales_${toInputDate(start)}_to_${toInputDate(end)}.csv`, toCSV(rows), 'text/csv');
  }

  function exportStock() {
    const rows = [['Category', 'Product', 'Size', 'Qty', 'Selling price', 'Cost price']];
    for (const p of s.products) {
      for (const [k, q] of Object.entries(p.sizes || {})) rows.push([s.catName[p.categoryId] || '', p.name, sizeLabel(k, p), q, p.price ?? '', p.cost ?? '']);
    }
    downloadFile(`stock_${toInputDate(Date.now())}.csv`, toCSV(rows), 'text/csv');
  }

  return (
    <>
      <Header title="Reports" />
      <Page>
        <div className="no-print">
          <Chips value={preset} onChange={setPreset} options={[
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'lastMonth', label: 'Last month' },
            { value: 'year', label: 'This year' },
            { value: 'custom', label: 'Pick dates' },
          ]} />
          {preset === 'custom' && (
            <div className="two">
              <Field label="From"><input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
              <Field label="To"><input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
            </div>
          )}
        </div>

        <div className="print-only print-title">Adwoaba's Lounge report</div>
        <p className="range">{rangeLabel}</p>

        <div className="stats">
          <Stat label="Sales" value={money(r.revenue)} sub={`${r.count} sale${r.count === 1 ? '' : 's'}`} />
          <Stat label="Items sold" value={r.units} sub={r.count ? `Average sale ${money(r.revenue / r.count)}` : ''} />
          <Stat label="Gross profit" value={money(r.profit)} sub={r.uncosted ? `${r.uncosted} item${r.uncosted === 1 ? '' : 's'} had no cost price, not included` : 'Sales minus cost price'} />
          <Stat label="Stock received" value={r.received} sub={r.countAdj ? `Count corrections: ${r.countAdj > 0 ? '+' : ''}${r.countAdj}` : 'Pieces added in period'} />
        </div>

        <Table title="By category" cols={['Category', 'Qty', 'Sales']} rows={r.category.map((x) => [x.key, x.qty, money(x.revenue)])} />
        <Table title="By payment method" cols={['Method', 'Sales', 'Amount']} rows={r.payment.map((x) => [x.key, x.count, money(x.revenue)])} />
        <Table title="Products sold" cols={['Product', 'Qty', 'Sales']} rows={r.product.map((x) => [x.key, x.qty, money(x.revenue)])} />
        <Table title="Sizes sold" cols={['Size', 'Qty']} rows={r.size.map((x) => [sizeLabel(x.key), x.qty])} />
        <Table title="By day" cols={['Day', 'Sales', 'Amount']} rows={r.day.map((x) => [fmtDay(x.key), x.count, money(x.revenue)])} />
        <Table title="Top customers" cols={['Customer', 'Purchases', 'Spent']} rows={r.customer.map((x) => [x.key, x.count, money(x.revenue)])} />
        <Table title="Deliveries" cols={['Status', 'Count']} rows={r.delivery.map((x) => [x.key, x.count])} />

        <h3 className="section">Stock now</h3>
        <div className="stats">
          <Stat label="In stock" value={r.stockUnits} sub={`${r.lowCount} product${r.lowCount === 1 ? '' : 's'} low`} />
          <Stat label="Stock value" value={money(r.stockAtPrice)} sub={r.unpriced ? `At selling price. ${r.unpriced} products have no price.` : 'At selling price'} />
          <Stat label="Stock cost" value={money(r.stockAtCost)} sub="At cost price, where set" />
        </div>

        <div className="row-actions no-print">
          <button className="btn primary" onClick={exportSales}>Download sales (CSV)</button>
          <button className="btn" onClick={exportStock}>Download stock (CSV)</button>
          <button className="btn" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </Page>
    </>
  );
}

function Table({ title, cols, rows }) {
  if (!rows.length) return null;
  return (
    <>
      <h3 className="section">{title}</h3>
      <table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
      </table>
    </>
  );
}
