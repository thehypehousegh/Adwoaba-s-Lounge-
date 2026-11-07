import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import { deleteCategory, exportAll, saveCategory, saveSettings, useStore } from '../store.jsx';
import { Empty, Field, Header, Icon, Loading, Page, useNav } from '../ui.jsx';
import { DEFAULT_SIZE_ALERT, DEFAULT_TOTAL_ALERT, downloadFile, num, toInputDate } from '../util.js';
import { SyncBadge } from './Home.jsx';

export function More() {
  const nav = useNav();
  const { alerts } = useStore();
  const items = [
    ['customers', 'users', 'Customers'],
    ['reports', 'chart', 'Reports'],
    ['alerts', 'bell', `Low stock${alerts.length ? ` (${alerts.length})` : ''}`],
    ['receive', 'inbox', 'Receive stock (new delivery)'],
    ['deliveries', 'truck', 'Deliveries & suppliers'],
    ['expenses', 'receipt', 'Expenses'],
    ['count', 'clipboard', 'Take stock'],
    ['history', 'history', 'Stock history'],
    ['categories', 'tag', 'Categories'],
    ['settings', 'gear', 'Settings & backup'],
  ];
  return (
    <>
      <Header title="More" back={false} right={<SyncBadge />} />
      <Page>
        <div className="list">
          {items.map(([screen, icon, label]) => (
            <button key={screen} className="row menu" onClick={() => nav.push(screen)}>
              <Icon name={icon} />
              <div className="row-main"><div className="row-title">{label}</div></div>
            </button>
          ))}
          <button className="row menu" onClick={() => confirm('Sign out of this phone?') && signOut(auth)}>
            <Icon name="logout" />
            <div className="row-main"><div className="row-title">Sign out</div><div className="row-sub">{auth.currentUser?.email}</div></div>
          </button>
        </div>
      </Page>
    </>
  );
}

export function Categories() {
  const s = useStore();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null); // {id, name}
  if (s.loading) return (<><Header title="Categories" /><Loading /></>);

  const counts = {};
  s.products.forEach((p) => (counts[p.categoryId] = (counts[p.categoryId] || 0) + 1));

  return (
    <>
      <Header title="Categories" />
      <Page>
        <div className="inline">
          <input placeholder="New category, e.g. Sandals" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" onClick={() => {
            if (!name.trim()) return;
            saveCategory({ name: name.trim(), order: s.categories.length + 1 });
            setName('');
          }}>Add</button>
        </div>
        <div className="list">
          {s.categories.map((c, i) => (
            <div key={c.id} className="row static">
              {editing?.id === c.id ? (
                <div className="inline grow">
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
                  <button className="btn primary" onClick={() => { if (editing.name.trim()) saveCategory({ id: c.id, name: editing.name.trim() }); setEditing(null); }}>Save</button>
                </div>
              ) : (
                <>
                  <div className="row-main">
                    <div className="row-title">{c.name}</div>
                    <div className="row-sub">{counts[c.id] || 0} products</div>
                  </div>
                  <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => {
                    const arr = [...s.categories];
                    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                    arr.forEach((x, j) => x.order !== j + 1 && saveCategory({ id: x.id, order: j + 1 }));
                  }}>↑</button>
                  <button className="icon-btn" aria-label="Rename" onClick={() => setEditing({ id: c.id, name: c.name })}><Icon name="edit" size={18} /></button>
                  <button className="icon-btn" aria-label="Delete" onClick={() => {
                    if (counts[c.id]) return alert('Move or delete the products in this category first.');
                    if (confirm(`Delete category "${c.name}"?`)) deleteCategory(c.id);
                  }}><Icon name="x" size={18} /></button>
                </>
              )}
            </div>
          ))}
          {!s.categories.length && <Empty>No categories yet</Empty>}
        </div>
      </Page>
    </>
  );
}

export function Settings() {
  const s = useStore();
  const [sizeAlert, setSizeAlert] = useState(s.settings.sizeAlert ?? '');
  const [totalAlert, setTotalAlert] = useState(s.settings.totalAlert ?? '');
  const [busy, setBusy] = useState(false);

  async function backup() {
    setBusy(true);
    try {
      const data = await exportAll();
      downloadFile(`adwoabas-lounge-backup_${toInputDate(Date.now())}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (e) {
      alert('Backup failed: ' + e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <Header title="Settings & backup" />
      <Page>
        <h3 className="section">Default shortage alerts</h3>
        <p className="muted small">Used for every product that has no threshold of its own.</p>
        <div className="two">
          <Field label="Alert when a size is at or below" hint={`Currently ${s.settings.sizeAlert ?? DEFAULT_SIZE_ALERT}. 0 = only when sold out`}>
            <input inputMode="numeric" type="number" min="0" value={sizeAlert} placeholder={String(DEFAULT_SIZE_ALERT)} onChange={(e) => setSizeAlert(e.target.value)} />
          </Field>
          <Field label="Alert when a product total is at or below" hint={`Currently ${s.settings.totalAlert ?? DEFAULT_TOTAL_ALERT}`}>
            <input inputMode="numeric" type="number" min="0" value={totalAlert} placeholder={String(DEFAULT_TOTAL_ALERT)} onChange={(e) => setTotalAlert(e.target.value)} />
          </Field>
        </div>
        <button className="btn primary block" onClick={() => { saveSettings({ sizeAlert: num(sizeAlert), totalAlert: num(totalAlert) }); alert('Saved.'); }}>Save alert settings</button>

        <h3 className="section">Backup</h3>
        <p className="muted small">
          Everything is already saved online in Firebase and on each phone. This downloads an extra copy of all
          products, sales, customers and stock history as a file.
        </p>
        <button className="btn block" disabled={busy} onClick={backup}>{busy ? 'Preparing…' : 'Download full backup'}</button>

        <h3 className="section">About</h3>
        <p className="muted small">Signed in as {auth.currentUser?.email}. App version {__APP_VERSION__}.</p>
      </Page>
    </>
  );
}
