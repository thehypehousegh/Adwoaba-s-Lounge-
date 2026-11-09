import React, { useMemo, useState } from 'react';
import { itemCost, useStore } from '../store.jsx';
import { ORDER_TYPES, customerLabel, orderType } from './Sales.jsx';
import { Chips, Field, Header, Loading, Page, Stat } from '../ui.jsx';
import { deliveryGoods } from './Deliveries.jsx';
import {
  defaultSalePrice,
  downloadFile,
  endOfDay,
  fmtDate,
  fmtDay,
  fmtTime,
  fromInputDate,
  money,
  productAlerts,
  sizeLabel,
  sortedVariants,
  startOfDay,
  sum,
  toCSV,
  toInputDate,
  totalStock,
  variantCost,
} from '../util.js';

const DAY = 86400000;

function presetRange(preset) {
  const today = startOfDay(Date.now());
  const d = new Date(today);
  switch (preset) {
    case 'today': return [today, endOfDay(today)];
    case 'yesterday': return [today - DAY, today - 1];
    case 'week': return [today - ((d.getDay() + 6) % 7) * DAY, endOfDay(today)];
    case 'month': return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), endOfDay(today)];
    case 'lastMonth': return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1];
    case 'year': return [new Date(d.getFullYear(), 0, 1).getTime(), endOfDay(today)];
    default: return null;
  }
}

function addTo(map, key, fields) {
  const x = (map[key] = map[key] || { key, qty: 0, revenue: 0, count: 0, cost: 0, amount: 0 });
  for (const [k, v] of Object.entries(fields)) x[k] = (x[k] || 0) + v;
  return x;
}
const sortBy = (m, k) => Object.values(m).sort((a, b) => b[k] - a[k]);

export default function Reports() {
  const s = useStore();
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(toInputDate(Date.now() - 6 * DAY));
  const [to, setTo] = useState(toInputDate(Date.now()));
  const [start, end] = preset === 'custom' ? [fromInputDate(from), endOfDay(fromInputDate(to))] : presetRange(preset);

  const r = useMemo(() => {
    if (s.loading) return null;
    const inRange = (x) => x.date >= start && x.date <= end;
    const sales = s.sales.filter(inRange);
    const o = {
      sales, count: sales.length, revenue: 0, units: 0, cogs: 0, costedRevenue: 0, unknownCostQty: 0, missingPrice: 0,
      byPayment: {}, byCategory: {}, byProduct: {}, byDay: {}, byCustomer: {}, byDelivery: {}, bySize: {}, bySupplier: {}, byOrderType: {},
      saleExpenses: 0,
    };
    for (const sale of sales) {
      o.revenue += sale.total || 0;
      addTo(o.byPayment, sale.paymentMethod || 'Other', { revenue: sale.total || 0, count: 1 });
      addTo(o.byDay, startOfDay(sale.date), { revenue: sale.total || 0, count: 1 });
      if (sale.customerId || sale.customerName) addTo(o.byCustomer, customerLabel(sale), { revenue: sale.total || 0, count: 1 });
      addTo(o.byOrderType, ORDER_TYPES.find((t) => t.value === orderType(sale))?.label, { revenue: sale.total || 0, count: 1, amount: sale.expensesTotal || 0 });
      o.saleExpenses += sale.expensesTotal || sum(sale.expenses || [], (e) => e.amount);
      if (sale.delivery) addTo(o.byDelivery, sale.delivery.status, { count: 1 });
      for (const it of sale.items) {
        const line = it.price == null ? 0 : it.qty * it.price;
        if (it.price == null) o.missingPrice += it.qty;
        o.units += it.qty;
        if (it.price != null) {
          // Items without a price yet are left out of profit until the price is added.
          const { cost, unknownQty } = itemCost(it, s);
          o.unknownCostQty += unknownQty;
          o.cogs += cost;
          o.costedRevenue += line * ((it.qty - unknownQty) / it.qty);
        }
        const cat = s.catName[it.categoryId || s.productById[it.productId]?.categoryId] || 'No category';
        addTo(o.byCategory, cat, { qty: it.qty, revenue: line });
        addTo(o.byProduct, it.productName, { qty: it.qty, revenue: line });
        addTo(o.bySize, sizeLabel(it.size, s.productById[it.productId]), { qty: it.qty });
      }
    }
    o.gross = o.costedRevenue - o.cogs - o.saleExpenses;

    // Expenses: shop expenses + delivery other costs marked "expense", dated in the period.
    const expenses = s.expenses.filter(inRange);
    const deliveries = s.deliveries.filter(inRange);
    o.shopExpenses = sum(expenses, (e) => e.amount);
    o.deliveryExpenses = sum(deliveries, (d) => sum((d.otherCosts || []).filter((c) => c.mode === 'expense'), (c) => c.amount));
    o.expensesTotal = o.shopExpenses + o.deliveryExpenses;
    o.net = o.gross - o.expensesTotal;
    o.expenseRows = [
      ...expenses.map((e) => [fmtDate(e.date), e.description, money(e.amount)]),
      ...deliveries.flatMap((d) => (d.otherCosts || []).filter((c) => c.mode === 'expense').map((c) => [fmtDate(d.date), `${c.label} (${d.supplier || 'delivery'})`, money(c.amount)])),
    ];

    // Purchases in the period
    for (const d of deliveries) {
      addTo(o.bySupplier, d.supplier || 'No supplier', {
        count: 1,
        qty: sum(d.items, (i) => i.qty),
        cost: deliveryGoods(d),
        amount: sum(d.otherCosts || [], (c) => c.amount),
      });
    }
    o.purchases = sum(deliveries, (d) => deliveryGoods(d) + sum(d.otherCosts || [], (c) => c.amount));
    o.purchasedPieces = sum(deliveries, (d) => sum(d.items, (i) => i.qty));

    // Stock now
    o.stockUnits = s.products.reduce((a, p) => a + totalStock(p), 0);
    o.stockAtPrice = 0;
    o.stockAtCost = 0;
    o.unpricedPieces = 0;
    for (const p of s.products) {
      for (const v of sortedVariants(p)) {
        const q = Math.max(0, Number(p.sizes[v]) || 0);
        if (!q) continue;
        const lots = s.lotsFor(p.id, v);
        const price = defaultSalePrice(p, v, lots);
        if (price != null) o.stockAtPrice += price * q;
        else o.unpricedPieces += q;
        let left = q;
        for (const l of lots) {
          const take = Math.min(left, Math.max(0, l.remaining));
          const c = l.unitCost ?? variantCost(p, v);
          if (c != null) o.stockAtCost += c * take;
          left -= take;
        }
        const c = variantCost(p, v);
        if (left > 0 && c != null) o.stockAtCost += c * left;
      }
    }
    o.lowCount = s.products.filter((p) => productAlerts(p, s.settings).length).length;

    o.payment = sortBy(o.byPayment, 'revenue');
    o.category = sortBy(o.byCategory, 'revenue');
    o.product = sortBy(o.byProduct, 'qty');
    o.customer = sortBy(o.byCustomer, 'revenue').slice(0, 10);
    o.orderTypes = sortBy(o.byOrderType, 'revenue');
    o.deliveryStatus = sortBy(o.byDelivery, 'count');
    o.size = sortBy(o.bySize, 'qty');
    o.supplier = sortBy(o.bySupplier, 'cost');
    o.day = Object.values(o.byDay).sort((a, b) => b.key - a.key);
    return o;
  }, [s, start, end]);

  if (!r) return (<><Header title="Reports" /><Loading /></>);

  function exportSales() {
    const rows = [['Date', 'Time', 'Customer', 'Phone', 'Product', 'Category', 'Colour / size', 'Qty', 'Price', 'Line total', 'Cost', 'Profit', 'Payment', 'Delivery name', 'Delivery address', 'Delivery status', 'Note', 'Recorded by']];
    for (const sale of [...r.sales].reverse()) {
      for (const it of sale.items) {
        const { cost, unknownQty } = itemCost(it, s);
        const line = it.price == null ? '' : it.qty * it.price;
        rows.push([
          fmtDate(sale.date), fmtTime(sale.date), customerLabel(sale), sale.customerPhone || '',
          it.productName, s.catName[it.categoryId] || '', sizeLabel(it.size, s.productById[it.productId]), it.qty, it.price ?? 'missing', line,
          unknownQty ? '' : cost, unknownQty || line === '' ? '' : line - cost,
          sale.paymentMethod, sale.delivery?.name || '', sale.delivery?.address || '', sale.delivery?.status || '', sale.note || '', sale.by || '',
        ]);
      }
    }
    downloadFile(`sales_${toInputDate(start)}_to_${toInputDate(end)}.csv`, toCSV(rows), 'text/csv');
  }

  function exportStock() {
    const rows = [['Category', 'Product', 'Colour / size', 'Qty', 'Selling price', 'Supplier', 'Bought', 'Qty left from delivery', 'Unit cost']];
    for (const p of s.products) {
      for (const v of sortedVariants(p)) {
        const lots = s.lotsFor(p.id, v).filter((l) => l.remaining > 0);
        const price = defaultSalePrice(p, v, lots);
        if (!lots.length) rows.push([s.catName[p.categoryId] || '', p.name, sizeLabel(v, p), p.sizes[v], price ?? '', '', '', '', variantCost(p, v) ?? '']);
        lots.forEach((l, i) => rows.push([s.catName[p.categoryId] || '', p.name, sizeLabel(v, p), i === 0 ? p.sizes[v] : '', price ?? '', l.supplier, fmtDate(l.date), l.remaining, l.unitCost ?? '']));
      }
    }
    downloadFile(`stock_${toInputDate(Date.now())}.csv`, toCSV(rows), 'text/csv');
  }

  const warn = [
    r.unknownCostQty ? `${r.unknownCostQty} item${r.unknownCostQty === 1 ? '' : 's'} sold have no cost price, so they are left out of profit. Add costs on the delivery.` : '',
    r.missingPrice ? `${r.missingPrice} item${r.missingPrice === 1 ? '' : 's'} sold have no price yet, so they are left out of sales and profit. Add the price on the sale.` : '',
  ].filter(Boolean);

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
        <p className="range">{fmtDate(start)} to {fmtDate(end)}</p>

        <div className="stats">
          <Stat label="Sales" value={money(r.revenue)} sub={`${r.count} sale${r.count === 1 ? '' : 's'} · ${r.units} items`} />
          <Stat label="Gross profit" value={money(r.gross)} sub="Sales minus item costs and sale expenses" />
          <Stat label="Expenses" value={money(r.expensesTotal)} sub={`Shop ${money(r.shopExpenses)} · Delivery ${money(r.deliveryExpenses)}`} />
          <Stat label="Net profit" value={money(r.net)} sub="Gross profit minus expenses" tone={r.net < 0 ? 'neg' : ''} />
        </div>
        {warn.map((w) => <p key={w} className="warn-text small">{w}</p>)}

        <div className="card">
          <div className="kv"><span>Sales</span><b>{money(r.revenue)}</b></div>
          {r.costedRevenue !== r.revenue && <div className="kv"><span>Sales with known cost</span><b>{money(r.costedRevenue)}</b></div>}
          <div className="kv"><span>Cost of items sold</span><b>− {money(r.cogs)}</b></div>
          <div className="kv"><span>Expenses on sales (rider, packaging…)</span><b>− {money(r.saleExpenses)}</b></div>
          <div className="kv total"><span>Gross profit</span><b>{money(r.gross)}</b></div>
          <div className="kv"><span>Expenses</span><b>− {money(r.expensesTotal)}</b></div>
          <div className="kv total"><span>Net profit</span><b>{money(r.net)}</b></div>
        </div>

        <Table title="By category" cols={['Category', 'Qty', 'Sales']} rows={r.category.map((x) => [x.key, x.qty, money(x.revenue)])} />
        <Table title="By order type" cols={['Type', 'Sales', 'Amount', 'Expenses']} rows={r.orderTypes.map((x) => [x.key, x.count, money(x.revenue), money(x.amount)])} />
        <Table title="By payment method" cols={['Method', 'Sales', 'Amount']} rows={r.payment.map((x) => [x.key, x.count, money(x.revenue)])} />
        <Table title="Products sold" cols={['Product', 'Qty', 'Sales']} rows={r.product.map((x) => [x.key, x.qty, money(x.revenue)])} />
        <Table title="Colours & sizes sold" cols={['Colour / size', 'Qty']} rows={r.size.map((x) => [x.key, x.qty])} />
        <Table title="By day" cols={['Day', 'Sales', 'Amount']} rows={r.day.map((x) => [fmtDay(x.key), x.count, money(x.revenue)])} />
        <Table title="Top customers" cols={['Customer', 'Purchases', 'Spent']} rows={r.customer.map((x) => [x.key, x.count, money(x.revenue)])} />
        <Table title="Deliveries to customers" cols={['Status', 'Count']} rows={r.deliveryStatus.map((x) => [x.key, x.count])} />
        <Table title="Expenses" cols={['Date', 'What for', 'Amount']} rows={r.expenseRows} />

        <h3 className="section">Stock bought</h3>
        <div className="stats">
          <Stat label="Spent on stock" value={money(r.purchases)} sub={`${r.purchasedPieces} pieces, incl. other costs`} />
        </div>
        <Table title="By supplier" cols={['Supplier', 'Pieces', 'Goods', 'Other']} rows={r.supplier.map((x) => [x.key, x.qty, money(x.cost), money(x.amount)])} />

        <h3 className="section">Stock now</h3>
        <div className="stats">
          <Stat label="In stock" value={r.stockUnits} sub={`${r.lowCount} product${r.lowCount === 1 ? '' : 's'} low`} />
          <Stat label="Value at selling price" value={money(r.stockAtPrice)} sub={r.unpricedPieces ? `${r.unpricedPieces} pieces have no price` : ''} />
          <Stat label="Value at cost" value={money(r.stockAtCost)} sub="Where cost is known" />
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
