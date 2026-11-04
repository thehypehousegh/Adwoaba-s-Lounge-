import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  FieldPath,
  getDocs,
  increment,
  onSnapshot,
  setDoc,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { productAlerts } from './util.js';

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export function StoreProvider({ children }) {
  const [data, setData] = useState({
    categories: null,
    products: null,
    customers: null,
    sales: null,
    settings: {},
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
            setError(err.code === 'permission-denied'
              ? 'This account is not allowed to use the shop data. Ask the owner to add your email.'
              : err.message);
          }
        )
      );
    sub('categories', collection(db, 'categories'), (s) =>
      docsOf(s).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name))
    );
    sub('products', collection(db, 'products'), (s) => docsOf(s).sort((a, b) => a.name.localeCompare(b.name)));
    sub('customers', collection(db, 'customers'), (s) => docsOf(s).sort((a, b) => a.name.localeCompare(b.name)));
    sub('sales', collection(db, 'sales'), (s) => docsOf(s).sort((a, b) => b.date - a.date));
    sub('settings', doc(db, 'meta', 'settings'), (s) => (s.exists() ? s.data() : {}));
    return () => subs.forEach((u) => u());
  }, []);

  const value = useMemo(() => {
    const catName = {};
    (data.categories || []).forEach((c) => (catName[c.id] = c.name));
    const productById = {};
    (data.products || []).forEach((p) => (productById[p.id] = p));
    const alerts = (data.products || [])
      .map((p) => ({ product: p, alerts: productAlerts(p, data.settings) }))
      .filter((x) => x.alerts.length);
    return {
      ...data,
      loading: !data.categories || !data.products || !data.customers || !data.sales,
      catName,
      productById,
      alerts,
      unsynced: Object.values(pending).some(Boolean),
      online,
      error,
    };
  }, [data, pending, online, error]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
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

function stockChange(bt, productId, changes) {
  const args = [];
  for (const [size, delta] of Object.entries(changes)) {
    if (!delta) continue;
    args.push(new FieldPath('sizes', size), increment(delta));
  }
  if (!args.length) return;
  args.push('updatedAt', now());
  bt.op((b) => b.update(doc(db, 'products', productId), ...args));
}

function movement(bt, m) {
  bt.op((b) => b.set(doc(collection(db, 'movements')), { note: '', ...m, date: m.date ?? now(), by: by() }));
}

const newId = (col) => doc(collection(db, col)).id;

/* Products */
export function createProduct(fields, sizes) {
  const id = newId('products');
  const bt = batcher();
  bt.op((b) => b.set(doc(db, 'products', id), { ...fields, sizes, createdAt: now(), updatedAt: now() }));
  for (const [size, qty] of Object.entries(sizes)) {
    if (qty) movement(bt, { productId: id, productName: fields.name, size, change: qty, reason: 'Opening stock' });
  }
  bt.commit();
  return id;
}

export function updateProduct(id, fields) {
  updateDoc(doc(db, 'products', id), { ...fields, updatedAt: now() }).catch(report);
}

export function deleteProduct(id) {
  deleteDoc(doc(db, 'products', id)).catch(report);
}

/** changes: { size: +qty } */
export function receiveStock(product, changes, note) {
  const bt = batcher();
  stockChange(bt, product.id, changes);
  for (const [size, qty] of Object.entries(changes)) {
    if (qty) movement(bt, { productId: product.id, productName: product.name, size, change: qty, reason: 'Received', note });
  }
  bt.commit();
}

/** entries: [{ product, counts: { size: countedQty } }] */
export function applyStockCount(entries, note) {
  const bt = batcher();
  let changed = 0;
  for (const { product, counts } of entries) {
    const diffs = {};
    for (const [size, counted] of Object.entries(counts)) {
      const diff = counted - (Number(product.sizes?.[size]) || 0);
      if (diff) {
        diffs[size] = diff;
        changed++;
        movement(bt, {
          productId: product.id,
          productName: product.name,
          size,
          change: diff,
          reason: 'Stock count',
          note,
        });
      }
    }
    stockChange(bt, product.id, diffs);
  }
  bt.commit();
  return changed;
}

/* Sales */
export function createSale(sale) {
  const id = newId('sales');
  const bt = batcher();
  bt.op((b) => b.set(doc(db, 'sales', id), { ...sale, by: by(), createdAt: now() }));
  const perProduct = {};
  for (const it of sale.items) {
    perProduct[it.productId] = perProduct[it.productId] || {};
    perProduct[it.productId][it.size] = (perProduct[it.productId][it.size] || 0) - it.qty;
    movement(bt, {
      productId: it.productId,
      productName: it.productName,
      size: it.size,
      change: -it.qty,
      reason: 'Sold',
      saleId: id,
      date: sale.date,
    });
  }
  for (const [pid, changes] of Object.entries(perProduct)) stockChange(bt, pid, changes);
  bt.commit();
  return id;
}

export function updateSale(id, fields) {
  updateDoc(doc(db, 'sales', id), { ...fields, updatedAt: now() }).catch(report);
}

/** Deletes the sale and puts the items back into stock. */
export function voidSale(sale, productById) {
  const bt = batcher();
  bt.op((b) => b.delete(doc(db, 'sales', sale.id)));
  const perProduct = {};
  for (const it of sale.items) {
    if (!productById[it.productId]) continue; // product was deleted
    perProduct[it.productId] = perProduct[it.productId] || {};
    perProduct[it.productId][it.size] = (perProduct[it.productId][it.size] || 0) + it.qty;
    movement(bt, {
      productId: it.productId,
      productName: it.productName,
      size: it.size,
      change: it.qty,
      reason: 'Sale cancelled',
      saleId: sale.id,
    });
  }
  for (const [pid, changes] of Object.entries(perProduct)) stockChange(bt, pid, changes);
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
/** opts.productId: only that product. opts.since: only movements on or after this time (ms). */
export function subscribeMovements(cb, opts = {}) {
  let ref = collection(db, 'movements');
  if (opts.productId) ref = query(ref, where('productId', '==', opts.productId));
  else if (opts.since != null) ref = query(ref, where('date', '>=', opts.since));
  return onSnapshot(ref, (snap) => cb(docsOf(snap).sort((a, b) => b.date - a.date)), report);
}

/* Backup */
export async function exportAll() {
  const out = { exportedAt: new Date().toISOString() };
  for (const name of ['categories', 'products', 'customers', 'sales', 'movements']) {
    out[name] = docsOf(await getDocs(collection(db, name)));
  }
  return out;
}

/* Seed (fixed IDs so loading twice from two phones cannot duplicate) */
export function loadSeed(seed) {
  const bt = batcher();
  for (const c of seed.categories) {
    bt.op((b) => b.set(doc(db, 'categories', c.id), { name: c.name, order: c.order }));
  }
  for (const p of seed.products) {
    const { id, ...fields } = p;
    bt.op((b) =>
      b.set(doc(db, 'products', id), {
        cost: null,
        price: null,
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
  bt.op((b) => b.set(doc(db, 'meta', 'settings'), { seeded: true }, { merge: true }));
  bt.commit();
}
