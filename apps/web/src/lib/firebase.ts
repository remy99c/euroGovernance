import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const isProductionBuild = process.env.NODE_ENV === 'production';

function requiredClientConfig(name: string, value: string | undefined, developmentFallback: string): string {
  const normalized = value?.trim();
  if (normalized) return normalized;
  if (isProductionBuild) {
    throw new Error(`Missing required public Firebase configuration: ${name}`);
  }
  return developmentFallback;
}

const firebaseConfig = {
  apiKey: requiredClientConfig('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY, 'demo-api-key'),
  authDomain: requiredClientConfig('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, 'eurogovernance-dev.firebaseapp.com'),
  projectId: requiredClientConfig('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'eurogovernance-dev'),
  storageBucket: requiredClientConfig('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, 'eurogovernance-dev.appspot.com'),
  messagingSenderId: requiredClientConfig('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, '123456789012'),
  appId: requiredClientConfig('NEXT_PUBLIC_FIREBASE_APP_ID', process.env.NEXT_PUBLIC_FIREBASE_APP_ID, '1:123456789012:web:abcdef123456'),
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(
  app,
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west3'
);
export const storage = getStorage(app);

// Safe emulator attachment with Hot Module Reload (HMR) guard
if (isProductionBuild && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  throw new Error('Firebase emulators cannot be enabled in a production web build.');
}

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  // @ts-expect-error Global emulator guard
  if (!window.__FIREBASE_EMULATORS_CONNECTED__) {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      // @ts-expect-error Global emulator guard
      window.__FIREBASE_EMULATORS_CONNECTED__ = true;
    } catch {
      // Ignore repeat connection calls during development HMR
    }
  }
}

export default app;
