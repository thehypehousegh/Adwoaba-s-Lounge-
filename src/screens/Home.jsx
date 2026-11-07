import React from 'react';
import { useStore } from '../store.jsx';
import { Card, Header, Icon, Loading, Page, Stat, useNav } from '../ui.jsx';
import { fmtTime, money, startOfDay, totalStock } from '../util.js';
import { SaleRow } from './Sales.jsx';

export default function Home() {
  const s = useStore();
  const nav = useNav();
  if (s.loading) return (<><Header title="Adwoaba's Lounge" back={false} /><Loading /></>);

  const today = startOfDay(Date.now());
  const todaySales = s.sales.filter((x) => x.date >= today);
  const todayTotal = todaySales.reduce((a, x) => a + (x.total || 0), 0);
  const units = s.products.reduce((a, p) => a + totalStock(p), 0);
  const pendingDeliveries = s.sales.filter((x) => x.delivery && !['Delivered', 'Cancelled'].includes(x.delivery.status)).length;
  const missingPrices = s.sales.filter((x) => x.priceMissing).length;
  const outCount = s.alerts.filter((a) => a.alerts.some((x) => x.level === 'out')).length;

  const tiles = [
    { icon: 'plus', label: 'New sale', go: () => nav.goTab('sell'), primary: true },
    { icon: 'inbox', label: 'New stock', sub: 'Receive a delivery', go: () => nav.push('receive'), primary: true },
    { icon: 'box', label: 'View stock', go: () => nav.goTab('stock') },
    { icon: 'search', label: 'Search products', go: () => nav.push('stock', { pushed: true, focusSearch: true }) },
    { icon: 'receipt', label: 'Sales history', go: () => nav.goTab('sales') },
    { icon: 'tag', label: 'Add product', go: () => nav.push('productForm') },
    { icon: 'clipboard', label: 'Take stock', go: () => nav.push('count') },
    { icon: 'bell', label: 'Low stock', badge: s.alerts.length || null, go: () => nav.push('alerts') },
    { icon: 'users', label: 'Customers', go: () => nav.push('customers') },
    { icon: 'truck', label: 'Deliveries & suppliers', go: () => nav.push('deliveries') },
    { icon: 'history', label: 'Expenses', go: () => nav.push('expenses') },
    { icon: 'chart', label: 'Reports & profit', go: () => nav.push('reports') },
  ];

  return (
    <>
      <Header title="Adwoaba's Lounge" back={false} right={<SyncBadge />} />
      <Page>
        <div className="stats">
          <Stat label="Sales today" value={money(todayTotal)} sub={`${todaySales.length} sale${todaySales.length === 1 ? '' : 's'}`} />
          <Stat label="In stock" value={units} sub={`${s.products.length} products`} />
        </div>

        <div className="tiles">
          {tiles.map((t) => (
            <button key={t.label} className={`tile ${t.primary ? 'primary' : ''}`} onClick={t.go}>
              <span className="tile-icon">
                <Icon name={t.icon} size={26} />
                {t.badge && <span className="tile-badge">{t.badge}</span>}
              </span>
              <span className="tile-label">{t.label}</span>
              {t.sub && <span className="tile-sub">{t.sub}</span>}
            </button>
          ))}
        </div>

        {s.alerts.length > 0 && (
          <Card onClick={() => nav.push('alerts')} className="alert-card">
            <Icon name="bell" />
            <div>
              <strong>{s.alerts.length} product{s.alerts.length === 1 ? '' : 's'} running low</strong>
              <div className="row-sub">{outCount > 0 ? `${outCount} with a sold-out size or no stock. ` : ''}Tap to see.</div>
            </div>
          </Card>
        )}
        {pendingDeliveries > 0 && (
          <Card onClick={() => nav.push('sales', { pushed: true, initialFilter: 'deliveries' })} className="info-card">
            <Icon name="truck" />
            <div>
              <strong>{pendingDeliveries} customer deliver{pendingDeliveries === 1 ? 'y' : 'ies'} not yet delivered</strong>
              <div className="row-sub">Tap to see them.</div>
            </div>
          </Card>
        )}
        {missingPrices > 0 && (
          <Card onClick={() => nav.push('sales', { pushed: true, initialFilter: 'missing' })} className="info-card">
            <Icon name="tag" />
            <div>
              <strong>{missingPrices} sale{missingPrices === 1 ? '' : 's'} with a missing price</strong>
              <div className="row-sub">Tap to add the prices.</div>
            </div>
          </Card>
        )}

        <h3 className="section">Today's sales</h3>
        {todaySales.length === 0 && <p className="muted">No sales yet today.</p>}
        <div className="list">
          {todaySales.slice(0, 10).map((sale) => <SaleRow key={sale.id} sale={sale} sub={fmtTime(sale.date)} />)}
        </div>
      </Page>
    </>
  );
}

export function SyncBadge() {
  const { online, unsynced } = useStore();
  if (!online) return <span className="badge warn">Offline</span>;
  if (unsynced) return <span className="badge">Syncing…</span>;
  return <span className="badge ok">Synced</span>;
}
