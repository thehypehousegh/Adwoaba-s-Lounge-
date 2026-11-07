import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  FieldPath,
  getDocs,
  increment,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { OPENING_DELIVERY_ID, productAlerts, sum, variantCost } from './util.js';
import { seed } from './seed.js';

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
export const lotKey = (productId, variant) => `${productId}::${variant}`;
export const openingLotId = (productId, variant) => `${OPENING_DELIVERY_ID}-${productId}-${variant}`;

export function StoreProvider({ children }) {
  const [data, setData] = useState({
    categories: null,
    products: null,
    customers: null,
    sales: null,
    lots: null,
    deliveries: null,
    expenses: null,
    settings: null,
  });
  const [pending, setPending] = useState({});
  const [error, setError] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const subs = [];
    const sub = (name, ref, map) =>
      subs.push(
        onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snap) => {
            setData((s) => ({ ...s, [name]: map(snap) }));
            setPending((p) => ({ ...p, [name]: snap.metadata.hasPendingWrites }));
          },
          (err) => {
            console.error(name, err);
            setError(
              err.code === 'permission-denied'
                ? 'This account is not allowed to use the shop data. Ask the owner to add your email.'
                : err.message
            );
          }
        )
      );
    const byName = (a, b) => a.name.localeCompare(b.name);
    sub('categories', collection(db, 'categories'), (s) =>
      docsOf(s).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || byName(a, b))
    );
    sub('products', collection(db, 'products'), (s) => docsOf(s).sort(byName));
    sub('customers', collection(db, 'customers'), (s) => docsOf(s).sort(byName));
    sub('sales', collection(db, 'sales'), (s) => docsOf(s).sort((a, b) => b.date - a.date));
    sub('lots', collection(db, 'lots'), (s) => docsOf(s).sort((a, b) => a.date - b.date || a.id.localeCompare(b.id)));
    sub('deliveries', collection(db, 'deliveries'), (s) => docsOf(s).sort((a, b) => b.date - a.date));
    sub('expenses', collection(db, 'expenses'), (s) => docsOf(s).sort((a, b) => b.date - a.date));
    sub('settings', doc(db, 'meta', 'settings'), (s) => (s.exists() ? s.data() : {}));
    return () => subs.forEach((u) => u());
  }, []);

  // One-time: turn the 26 Oct stocktake into a delivery from Teemah (24 Oct) so it has costs and a supplier.
  useEffect(() => {
    if (!data.products || !data.settings) return;
    if (data.settings.seeded && !data.settings.openingDelivery) migrateOpeningDelivery(data.products);
  }, [data.products, data.settings]);

  const value = useMemo(() => {
    const catName = {};
    (data.categories || []).forEach((c) => (catName[c.id] = c.name));
    const productById = {};
    (data.products || []).forEach((p) => (productById[p.id] = p));
    const lotById = {};
    const lotsByVariant = {};
    for (const l of data.lots || []) {
      lotById[l.id] = l;
      (lotsByVariant[lotKey(l.productId, l.variant)] = lotsByVariant[lotKey(l.productId, l.variant)] || []).push(l);
    }
    const alerts = (data.products || [])
      .map((p) => ({ product: p, alerts: productAlerts(p, data.settings || {}) }))
      .filter((x) => x.alerts.length);
    const suppliers = Array.from(new Set((data.deliveries || []).map((d) => d.supplier).filter(Boolean))).sort();
    return {
      ...data,
      settings: data.settings || {},
      loading: Object.values(data).some((v) => v === null),
      catName,
      productById,
      lotById,
      lotsByVariant,
      lotsFor: (pid, v) => lotsByVariant[lotKey(pid, v)] || [],
      suppliers,
      alerts,
      unsynced: Object.values(pending).some(Boolean),
      online,
      error,
    };
  }, [data, pending, online, error]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/* ---------------- Cost of a sold item ----------------
 * Worked out from the deliveries (lots) it was taken from, at report time,
 * so a cost entered on a delivery later still counts for earlier sales.
 */
export function itemCost(it, { lotById, productById }) {
  const p = productById[it.productId];
  let cost = 0;
  let unknownQty = 0;
  let lotted = 0;
  const fallback = () => lotById[openingLotId(it.productId, it.size)]?.unitCost ?? variantCost(p, it.size) ?? it.cost ?? null;
  for (const r of it.lots || []) {
    lotted += r.qty;
    const c = lotById[r.lotId]?.unitCost ?? variantCost(p, it.size) ?? null;
    if (c != null) cost += c * r.qty;
    else unknownQty += r.qty;
  }
  const rest = it.qty - lotted;
  if (rest > 0) {
    const c = fallback();
    if (c != null) cost += c * rest;
    else unknownQty += rest;
  }
  return { cost, unknownQty };
}

/* ---------------- Writes ----------------
 * Writes are never awaited: Firestore applies them to the local cache at once
 * (so the UI updates offline) and syncs them to the server when online.
 */
const by = () => auth.currentUser?.email || '';
const now = () => Date.now();

function report(e) {
  console.error(e);
  alert('Could not save to the shop database: ' + e.message);
}

function batcher() {
  const done = [];
  let b = writeBatch(db);
  let n = 0;
  return {
    op(fn) {
      if (n >= 400) {
        done.push(b);
        b = writeBatch(db);
        n = 0;
      }
      fn(b);
      n++;
    },
    commit() {
      done.push(b);
      done.forEach((x) => x.commit().catch(report));
    },
  };
}

/** One update to a product: stock deltas, and per-variant prices / costs to set. */
function productUpdate(bt, productId, { stock = {}, prices = {}, costs = {}, fields = {} } = {}) {
  const args = [];
  for (const [v, d] of Object.entries(stock)) if (d) args.push(new FieldPath('sizes', v), increment(d));
  for (const [v, x] of Object.entries(prices)) args.push(new FieldPath('prices', v), x);
  for (const [v, x] of Object.entries(costs)) args.push(new FieldPath('costs', v), x);
  for (const [k, x] of Object.entries(fields)) args.push(k, x);
  if (!args.length) return;
  args.push('updatedAt', now());
  bt.op((b) => b.update(doc(db, 'products', productId), ...args));
}

function movement(bt, m) {
  bt.op((b) => b.set(doc(collection(db, 'movements')), { note: '', ...m, date: m.date ?? now(), by: by() }));
}

const newId = (col) => doc(collection(db, col)).id;

/* Products */
export function createProduct(fields) {
  const id = newId('products');
  setDoc(doc(db, 'products', id), { prices: {}, costs: {}, sizes: {}, ...fields, createdAt: now(), updatedAt: now() }).catch(report);
  return id;
}
export function updateProduct(id, fields) {
  updateDoc(doc(db, 'products', id), { ...fields, updatedAt: now() }).catch(report);
}
export function deleteProduct(id) {
  deleteDoc(doc(db, 'products', id)).catch(report);
}

/** Set selling / cost price per variant. Selling price also applies to pieces still in stock from earlier deliveries. */
export function setVariantPrices(product, { prices = {}, costs = {} }, lotsFor) {
  const bt = batcher();
  productUpdate(bt, product.id, { prices, costs });
  for (const [v, price] of Object.entries(prices)) {
    for (const l of lotsFor(product.id, v)) if (l.remaining > 0 && l.price !== price) bt.op((b) => b.update(doc(db, 'lots', l.id), { price }));
  }
  bt.commit();
}

/* Deliveries (stock received from a supplier) */
function spreadShare(items, otherCosts) {
  const qty = sum(items, (i) => i.qty);
  const spread = sum((otherCosts || []).filter((c) => c.mode === 'spread'), (c) => c.amount);
  return qty ? spread / qty : 0;
}
const unitCost = (cost, share) => (cost == null ? null : cost + share);

/**
 * d: { date, supplier, note, items: [{ productId, productName, variant, qty, cost, price, updateExisting }], otherCosts: [{ label, amount, mode }] }
 * updateExisting: true = pieces already in stock also take the new selling price.
 */
export function createDelivery(d, lotsFor) {
  const id = newId('deliveries');
  const bt = batcher();
  const share = spreadShare(d.items, d.otherCosts);
  const items = d.items.map(({ updateExisting, ...it }) => it);
  bt.op((b) =>
    b.set(doc(db, 'deliveries', id), {
      date: d.date,
      supplier: d.supplier,
      note: d.note,
      items,
      otherCosts: d.otherCosts,
      by: by(),
      createdAt: now(),
    })
  );
  const perProduct = {};
  d.items.forEach((it, i) => {
    bt.op((b) =>
      b.set(doc(db, 'lots', `${id}-${i}`), {
        deliveryId: id,
        productId: it.productId,
        productName: it.productName,
        variant: it.variant,
        date: d.date,
        supplier: d.supplier,
        qty: it.qty,
        remaining: it.qty,
        enteredCost: it.cost,
        spreadShare: share,
        unitCost: unitCost(it.cost, share),
        price: it.price,
      })
    );
    const pu = (perProduct[it.productId] = perProduct[it.productId] || { stock: {}, prices: {}, costs: {} });
    pu.stock[it.variant] = (pu.stock[it.variant] || 0) + it.qty;
    if (it.cost != null) pu.costs[it.variant] = it.cost;
    if (it.price != null && it.updateExisting !== false) {
      pu.prices[it.variant] = it.price;
      if (it.updateExisting) {
        for (const l of lotsFor(it.productId, it.variant)) if (l.remaining > 0) bt.op((b) => b.update(doc(db, 'lots', l.id), { price: it.price }));
      }
    }
    movement(bt, {
      productId: it.productId,
      productName: it.productName,
      size: it.variant,
      change: it.qty,
      reason: 'Received',
      note: d.supplier ? `From ${d.supplier}` : '',
      deliveryId: id,
      date: d.date,
    });
  });
  for (const [pid, pu] of Object.entries(perProduct)) productUpdate(bt, pid, pu);
  bt.commit();
  return id;
}

/** Edit supplier, date, note, prices and other costs of a delivery (not quantities). */
export function updateDelivery(delivery, changes) {
  const bt = batcher();
  const items = changes.items || delivery.items;
  const otherCosts = changes.otherCosts || delivery.otherCosts || [];
  const share = spreadShare(items, otherCosts);
  const next = { ...changes, items, otherCosts, updatedAt: now() };
  bt.op((b) => b.set(doc(db, 'deliveries', delivery.id), next, { merge: true }));
  const date = changes.date ?? delivery.date;
  const supplier = changes.supplier ?? delivery.supplier;
  items.forEach((it, i) => {
    const lotId = delivery.id === OPENING_DELIVERY_ID ? openingLotId(it.productId, it.variant) : `${delivery.id}-${i}`;
    bt.op((b) =>
      b.set(
        doc(db, 'lots', lotId),
        { date, supplier, enteredCost: it.cost, spreadShare: share, unitCost: unitCost(it.cost, share), price: it.price },
        { merge: true }
      )
    );
  });
  bt.commit();
}

/* Take stock (count). entries: [{ product, counts: {variant: qty}, prices: {variant: x}, costs: {variant: x} }] */
export function applyStockCount(entries, note, lotsFor) {
  const bt = batcher();
  let changed = 0;
  for (const { product, counts, prices = {}, costs = {} } of entries) {
    const stock = {};
    for (const [v, counted] of Object.entries(counts)) {
      const diff = counted - (Number(product.sizes?.[v]) || 0);
      if (!diff) continue;
      stock[v] = diff;
      changed++;
      movement(bt, { productId: product.id, productName: product.name, size: v, change: diff, reason: 'Stock count', note });
      if (diff > 0) {
        // Extra pieces found: record them as their own lot with the cost given (or the usual cost).
        const cost = costs[v] ?? variantCost(product, v);
        bt.op((b) =>
          b.set(doc(collection(db, 'lots')), {
            deliveryId: null,
            productId: product.id,
            productName: product.name,
            variant: v,
            date: now(),
            supplier: 'Stock count',
            qty: diff,
            remaining: diff,
            enteredCost: cost,
            spreadShare: 0,
            unitCost: cost,
            price: prices[v] ?? null,
          })
        );
      } else {
        // Missing pieces: take them out of the oldest deliveries first.
        let left = -diff;
        for (const l of lotsFor(product.id, v)) {
          if (left <= 0) break;
          const take = Math.min(l.remaining, left);
          if (take > 0) {
            bt.op((b) => b.update(doc(db, 'lots', l.id), { remaining: increment(-take) }));
            left -= take;
          }
        }
      }
    }
    const priceChanges = Object.fromEntries(Object.entries(prices).filter(([v, x]) => x !== (product.prices?.[v] ?? product.price ?? null)));
    const costChanges = Object.fromEntries(Object.entries(costs).filter(([v, x]) => x !== (product.costs?.[v] ?? product.cost ?? null)));
    changed += Object.keys(priceChanges).length + Object.keys(costChanges).length;
    productUpdate(bt, product.id, { stock, prices: priceChanges, costs: costChanges });
    for (const [v, price] of Object.entries(priceChanges)) {
      for (const l of lotsFor(product.id, v)) if (l.remaining > 0) bt.op((b) => b.update(doc(db, 'lots', l.id), { price }));
    }
  }
  bt.commit();
  return changed;
}

/** Take pieces out of stock (damaged, returned to supplier...). changes: { variant: qtyToRemove } */
export function removeStock(product, changes, reason, note, lotsFor) {
  const bt = batcher();
  const stock = {};
  for (const [v, q] of Object.entries(changes)) {
    if (!(q > 0)) continue;
    stock[v] = -q;
    movement(bt, { productId: product.id, productName: product.name, size: v, change: -q, reason, note });
    let left = q;
    for (const l of lotsFor(product.id, v)) {
      if (left <= 0) break;
      const take = Math.min(Math.max(0, l.remaining), left);
      if (take > 0) {
        bt.op((b) => b.update(doc(db, 'lots', l.id), { remaining: increment(-take) }));
        left -= take;
      }
    }
  }
  productUpdate(bt, product.id, { stock });
  bt.commit();
}

/* Sales. Each item already carries `lots: [{lotId, qty}]` (oldest delivery first). */
export function createSale(sale) {
  const id = newId('sales');
  const bt = batcher();
  bt.op((b) => b.set(doc(db, 'sales', id), { ...sale, by: by(), createdAt: now() }));
  const perProduct = {};
  for (const it of sale.items) {
    perProduct[it.productId] = perProduct[it.productId] || {};
    perProduct[it.productId][it.size] = (perProduct[it.productId][it.size] || 0) - it.qty;
    for (const r of it.lots || []) bt.op((b) => b.update(doc(db, 'lots', r.lotId), { remaining: increment(-r.qty) }));
    movement(bt, { productId: it.productId, productName: it.productName, size: it.size, change: -it.qty, reason: 'Sold', saleId: id, date: sale.date });
  }
  for (const [pid, stock] of Object.entries(perProduct)) productUpdate(bt, pid, { stock });
  bt.commit();
  return id;
}

export function updateSale(id, fields) {
  updateDoc(doc(db, 'sales', id), { ...fields, updatedAt: now() }).catch(report);
}

/** Deletes the sale and puts the items back into stock (and back into their deliveries). */
export function voidSale(sale, productById, lotById) {
  const bt = batcher();
  bt.op((b) => b.delete(doc(db, 'sales', sale.id)));
  const perProduct = {};
  for (const it of sale.items) {
    if (!productById[it.productId]) continue;
    perProduct[it.productId] = perProduct[it.productId] || {};
    perProduct[it.productId][it.size] = (perProduct[it.productId][it.size] || 0) + it.qty;
    for (const r of it.lots || []) if (lotById[r.lotId]) bt.op((b) => b.update(doc(db, 'lots', r.lotId), { remaining: increment(r.qty) }));
    movement(bt, { productId: it.productId, productName: it.productName, size: it.size, change: it.qty, reason: 'Sale cancelled', saleId: sale.id });
  }
  for (const [pid, stock] of Object.entries(perProduct)) productUpdate(bt, pid, { stock });
  bt.commit();
}

/* Customers */
export function saveCustomer(c) {
  const { id, ...fields } = c;
  const cid = id || newId('customers');
  setDoc(doc(db, 'customers', cid), { ...fields, ...(id ? {} : { createdAt: now() }), updatedAt: now() }, { merge: true }).catch(report);
  return cid;
}
export function deleteCustomer(id) {
  deleteDoc(doc(db, 'customers', id)).catch(report);
}

/* Expenses */
export function saveExpense(e) {
  const { id, ...fields } = e;
  const eid = id || newId('expenses');
  setDoc(doc(db, 'expenses', eid), { ...fields, ...(id ? {} : { by: by(), createdAt: now() }), updatedAt: now() }, { merge: true }).catch(report);
  return eid;
}
export function deleteExpense(id) {
  deleteDoc(doc(db, 'expenses', id)).catch(report);
}

/* Categories */
export function saveCategory(c) {
  const { id, ...fields } = c;
  const cid = id || newId('categories');
  setDoc(doc(db, 'categories', cid), fields, { merge: true }).catch(report);
  return cid;
}
export function deleteCategory(id) {
  deleteDoc(doc(db, 'categories', id)).catch(report);
}

/* Settings */
export function saveSettings(fields) {
  setDoc(doc(db, 'meta', 'settings'), fields, { merge: true }).catch(report);
}

/* Movements */
export function subscribeMovements(cb, opts = {}) {
  let ref = collection(db, 'movements');
  if (opts.productId) ref = query(ref, where('productId', '==', opts.productId));
  else if (opts.since != null) ref = query(ref, where('date', '>=', opts.since));
  return onSnapshot(ref, (snap) => cb(docsOf(snap).sort((a, b) => b.date - a.date)), report);
}

/* Backup */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString() };
  for (const name of ['categories', 'products', 'customers', 'sales', 'deliveries', 'lots', 'expenses', 'movements']) {
    out[name] = docsOf(await getDocs(collection(db, name)));
  }
  return out;
}

/* ---------------- Opening stock (26 Oct stocktake, bought from Teemah on 24 Oct) ---------------- */

function openingDeliveryWrites(bt, remainingFor) {
  const items = [];
  for (const p of seed.products) {
    for (const [v, qty] of Object.entries(p.sizes)) {
      items.push({ productId: p.id, productName: p.name, variant: v, qty, cost: null, price: null });
      bt.op((b) =>
        b.set(doc(db, 'lots', openingLotId(p.id, v)), {
          deliveryId: OPENING_DELIVERY_ID,
          productId: p.id,
          productName: p.name,
          variant: v,
          date: seed.purchaseDate,
          supplier: seed.supplier,
          qty,
          remaining: remainingFor(p, v, qty),
          enteredCost: null,
          spreadShare: 0,
          unitCost: null,
          price: null,
        })
      );
    }
  }
  bt.op((b) =>
    b.set(doc(db, 'deliveries', OPENING_DELIVERY_ID), {
      date: seed.purchaseDate,
      supplier: seed.supplier,
      note: seed.note,
      items,
      otherCosts: [],
      by: by(),
      createdAt: now(),
    })
  );
  bt.op((b) => b.set(doc(db, 'meta', 'settings'), { openingDelivery: true }, { merge: true }));
}

function migrateOpeningDelivery(products) {
  const byId = {};
  products.forEach((p) => (byId[p.id] = p));
  const bt = batcher();
  // Pieces already sold come out of the opening delivery.
  openingDeliveryWrites(bt, (p, v, qty) => Math.max(0, Math.min(qty, Number(byId[p.id]?.sizes?.[v]) || 0)));
  bt.commit();
}

/* Fixed IDs so loading twice from two phones cannot duplicate. */
export function loadSeed() {
  const bt = batcher();
  for (const c of seed.categories) bt.op((b) => b.set(doc(db, 'categories', c.id), { name: c.name, order: c.order }));
  for (const p of seed.products) {
    const { id, ...fields } = p;
    bt.op((b) =>
      b.set(doc(db, 'products', id), {
        cost: null,
        price: null,
        prices: {},
        costs: {},
        sizeAlert: null,
        totalAlert: null,
        mixedNote: '',
        ...fields,
        createdAt: seed.date,
        updatedAt: now(),
      })
    );
    for (const [size, qty] of Object.entries(p.sizes)) {
      bt.op((b) =>
        b.set(doc(db, 'movements', `${id}-opening-${size}`), {
          productId: id,
          productName: p.name,
          size,
          change: qty,
          reason: 'Opening stock',
          note: seed.note,
          date: seed.date,
          by: by(),
        })
      );
    }
  }
  openingDeliveryWrites(bt, (p, v, qty) => qty);
  bt.op((b) => b.set(doc(db, 'meta', 'settings'), { seeded: true }, { merge: true }));
  bt.commit();
}
