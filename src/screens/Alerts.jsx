import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { CategoryChips, Empty, Header, Loading, Page, useNav } from '../ui.jsx';
import { totalStock } from '../util.js';

export default function Alerts() {
  const s = useStore();
  const nav = useNav();
  const [cat, setCat] = useState('');
  if (s.loading) return (<><Header title="Low stock" /><Loading /></>);

  const list = s.alerts
    .filter((a) => !cat || a.product.categoryId === cat)
    .sort((a, b) => totalStock(a.product) - totalStock(b.product));

  return (
    <>
      <Header title="Low stock" />
      <Page>
        <p className="muted small">
          Thresholds are set per product (Edit product) or as defaults in Settings.
        </p>
        <CategoryChips value={cat} onChange={setCat} />
        <div className="list">
          {list.map(({ product: p, alerts }) => (
            <button key={p.id} className="row" onClick={() => nav.push('product', { id: p.id })}>
              <div className="row-main">
                <div className="row-title">{p.name}</div>
                <div className="row-sub">{s.catName[p.categoryId]}</div>
                <div className="alert-list">
                  {alerts.map((a, i) => (
                    <span key={i} className={`alert-line ${a.level}`}>{a.text}</span>
                  ))}
                </div>
              </div>
              <div className="row-end big">{totalStock(p)}</div>
            </button>
          ))}
          {!list.length && <Empty>Nothing is running low.</Empty>}
        </div>
      </Page>
    </>
  );
}
