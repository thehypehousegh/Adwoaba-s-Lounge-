import React, { createContext, useContext, useState } from 'react';
import { useStore } from './store.jsx';
import { coloursOf, searchProduct, totalStock } from './util.js';

export const NavCtx = createContext(null);
export const useNav = () => useContext(NavCtx);

export const LOGO = import.meta.env.BASE_URL + 'logo.webp';
export const MARK = import.meta.env.BASE_URL + 'icons/icon-192.png';

/* Icons */
const P = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  box: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9',
  plus: 'M12 5v14M5 12h14',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  menu: 'M4 7h16M4 12h16M4 17h16',
  back: 'M15 5l-7 7 7 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c2 .6 3.2 2.5 3.5 5.5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  clipboard: 'M9 4h6v3H9zM7 5.5H5V21h14V5.5h-2M8.5 12l2 2 4-4M8.5 17h7',
  truck: 'M2 6h11v10H2zM13 9h4.5l3.5 3.5V16h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  x: 'M6 6l12 12M18 6 6 18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
};
export function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function Header({ title, back = true, right }) {
  const nav = useNav();
  return (
    <header className="hdr">
      {back ? (
        <button className="icon-btn" onClick={nav.pop} aria-label="Back">
          <Icon name="back" />
        </button>
      ) : (
        <img className="hdr-logo" src={MARK} alt="" />
      )}
      <h1>{title}</h1>
      <div className="hdr-right">{right}</div>
    </header>
  );
}

export function Page({ children }) {
  return <main className="page">{children}</main>;
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Card({ children, onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`card ${onClick ? 'card-btn' : ''} ${className}`} onClick={onClick}>
      {children}
    </Tag>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.value} className={`chip ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CategoryChips({ value, onChange }) {
  const { categories } = useStore();
  return (
    <Chips
      value={value}
      onChange={onChange}
      options={[{ value: '', label: 'All' }, ...(categories || []).map((c) => ({ value: c.id, label: c.name }))]}
    />
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search', autoFocus }) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ProductPicker({ onPick, onClose, extra }) {
  const { products, catName } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const list = (products || []).filter((p) => (!cat || p.categoryId === cat) && searchProduct(p, catName[p.categoryId], q));
  return (
    <Modal title="Choose product" onClose={onClose}>
      {extra}
      <SearchBox value={q} onChange={setQ} placeholder="Search, e.g. zara black" />
      <CategoryChips value={cat} onChange={setCat} />
      <div className="list">
        {list.map((p) => (
          <button key={p.id} className="row" onClick={() => onPick(p)}>
            <div className="row-main">
              <div className="row-title">{p.name}</div>
              <div className="row-sub">{catName[p.categoryId] || 'No category'}{coloursOf(p).filter(Boolean).length ? ` · ${coloursOf(p).filter(Boolean).join(', ')}` : ''}</div>
            </div>
            <div className="row-end">{totalStock(p)} in stock</div>
          </button>
        ))}
        {!list.length && <Empty>No products found</Empty>}
      </div>
    </Modal>
  );
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
