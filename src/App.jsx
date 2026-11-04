import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, configured } from './firebase.js';
import { StoreProvider, useStore } from './store.jsx';
import { Icon, LOGO, NavCtx } from './ui.jsx';
import Home from './screens/Home.jsx';
import { StockList, ProductDetail, ProductForm, ReceiveStock, StockCount, StockHistory } from './screens/Stock.jsx';
import { NewSale, SalesList, SaleDetail } from './screens/Sales.jsx';
import { CustomerList, CustomerDetail, CustomerForm } from './screens/Customers.jsx';
import Reports from './screens/Reports.jsx';
import Alerts from './screens/Alerts.jsx';
import { More, Categories, Settings } from './screens/More.jsx';

const TABS = {
  home: Home,
  stock: StockList,
  sell: NewSale,
  sales: SalesList,
  more: More,
};

const SCREENS = {
  product: ProductDetail,
  productForm: ProductForm,
  receive: ReceiveStock,
  count: StockCount,
  history: StockHistory,
  newSale: NewSale,
  sale: SaleDetail,
  customers: CustomerList,
  customer: CustomerDetail,
  customerForm: CustomerForm,
  reports: Reports,
  alerts: Alerts,
  categories: Categories,
  settings: Settings,
};

export default function App() {
  if (!configured) return <SetupNeeded />;
  return <AuthGate />;
}

function SetupNeeded() {
  return (
    <div className="center-page">
      <img className="login-logo" src={LOGO} alt="Adwoaba's Lounge" />
      <h2>Almost ready</h2>
      <p className="muted">
        The app is not connected to its Firebase database yet. Add the Firebase web config to
        <code> src/firebase-config.js</code> (see SETUP.md).
      </p>
    </div>
  );
}

function AuthGate() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <div className="center-page"><img className="login-logo" src={LOGO} alt="" /></div>;
  if (!user) return <Login />;
  return (
    <StoreProvider key={user.uid}>
      <Shell />
    </StoreProvider>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setMsg(
        err.code === 'auth/network-request-failed'
          ? 'No internet. The first sign-in on a phone needs internet; after that the app works offline.'
          : 'Wrong email or password.'
      );
    }
    setBusy(false);
  }

  async function reset() {
    if (!email.trim()) return setMsg('Type your email first, then tap "Forgot password".');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg('Password reset email sent.');
    } catch {
      setMsg('Could not send the reset email. Check the address and your internet.');
    }
  }

  return (
    <div className="center-page">
      <img className="login-logo" src={LOGO} alt="Adwoaba's Lounge" />
      <form className="login" onSubmit={submit}>
        <input type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="btn link" onClick={reset}>Forgot password</button>
        {msg && <p className="login-msg">{msg}</p>}
      </form>
    </div>
  );
}

function Shell() {
  const [tab, setTab] = useState('home');
  const [stack, setStack] = useState([]);
  const { error } = useStore();

  // Phone back button / gesture closes the top screen.
  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((screen, params = {}) => {
    window.history.pushState({ s: Date.now() }, '');
    setStack((s) => [...s, { screen, params }]);
    window.scrollTo(0, 0);
  }, []);
  const pop = useCallback(() => window.history.back(), []);
  const replace = useCallback((screen, params = {}) => {
    setStack((s) => [...s.slice(0, -1), { screen, params }]);
    window.scrollTo(0, 0);
  }, []);
  const goTab = useCallback((t) => {
    setTab(t);
    window.scrollTo(0, 0);
  }, []);

  const nav = useMemo(() => ({ push, pop, replace, goTab, tab }), [push, pop, replace, goTab, tab]);
  const top = stack[stack.length - 1];
  const Screen = top ? SCREENS[top.screen] : TABS[tab];

  return (
    <NavCtx.Provider value={nav}>
      {error && <div className="banner error">{error}</div>}
      <Screen key={top ? `${stack.length}-${top.screen}` : `tab-${tab}`} {...(top?.params || {})} />
      {!top && <BottomNav tab={tab} setTab={goTab} />}
    </NavCtx.Provider>
  );
}

function BottomNav({ tab, setTab }) {
  const { alerts } = useStore();
  const items = [
    ['home', 'home', 'Home'],
    ['stock', 'box', 'Stock'],
    ['sell', 'plus', 'Sell'],
    ['sales', 'receipt', 'Sales'],
    ['more', 'menu', 'More'],
  ];
  return (
    <nav className="bottom-nav">
      {items.map(([id, icon, label]) => (
        <button key={id} className={`nav-btn ${tab === id ? 'on' : ''} ${id === 'sell' ? 'sell' : ''}`} onClick={() => setTab(id)}>
          <span className="nav-icon">
            <Icon name={icon} />
            {id === 'stock' && alerts.length > 0 && <span className="dot" />}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
