import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { firebaseConfig } from './firebase-config.js';

// Local testing only: `VITE_EMULATORS=1 npm run dev` with `firebase emulators:start --project demo-adwoaba`.
const useEmulators = import.meta.env.VITE_EMULATORS === '1';
const config = useEmulators
  ? { apiKey: 'demo-key', projectId: 'demo-adwoaba', authDomain: 'localhost', appId: 'demo' }
  : firebaseConfig;

export const configured = !!(config && config.apiKey);

let db = null;
let auth = null;
if (configured) {
  const app = initializeApp(config);
  // Persistent cache: all data is stored on the phone, works offline, syncs when online.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  auth = getAuth(app);
  if (useEmulators) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
}
export { db, auth };
