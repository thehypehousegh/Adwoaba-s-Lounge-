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
  const outCount = s.alerts.filter((a) => a.alerts.some((x) => x.level === 'out')).length;

  return (
    <>
      <Header title="Adwoaba's Lounge" back={false} right={<SyncBadge />} />
      <Page>
        <div className="stats">
          <Stat label="Sales today" value={money(todayTotal)} sub={`${todaySales.length} sale${todaySales.length === 1 ? '' : 's'}`} />
          <Stat label="Pairs & items in stock" value={units} sub={`${s.products.length} products`} />
        </div>

        <div className="actions">
          <button className="action primary" onClick={() => nav.goTab('sell')}><Icon name="plus" />New sale</button>
          <button className="action" onClick={() => nav.push('receive')}><Icon name="inbox" />Receive stock</button>
          <button className="action" onClick={() => nav.push('count')}><Icon name="clipboard" />Take stock</button>
          <button className="action" onClick={() => nav.push('reports')}><Icon name="chart" />Reports</button>
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
          <Card onClick={() => nav.goTab('sales')} className="info-card">
            <Icon name="truck" />
            <div>
              <strong>{pendingDeliveries} deliver{pendingDeliveries === 1 ? 'y' : 'ies'} not yet delivered</strong>
              <div className="row-sub">Tap Sales, then filter by deliveries.</div>
            </div>
          </Card>
        )}

        <h3 className="section">Today's sales</h3>
        {todaySales.length === 0 && <p className="muted">No sales yet today.</p>}
        <div className="list">
          {todaySales.slice(0, 10).map((sale) => (
            <SaleRow key={sale.id} sale={sale} sub={fmtTime(sale.date)} />
          ))}
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
