import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import {
  firebaseAppCheckSiteKey,
  firebaseFunctionsRegion,
  firebasePublicConfig,
  isProductionBuild,
  useFirebaseEmulator,
} from './firebase-public-config';

declare global {
  interface Window {
    __FIREBASE_APP_CHECK_INITIALIZED__?: boolean;
    __FIREBASE_EMULATORS_CONNECTED__?: boolean;
  }
}

const app = getApps().length === 0 ? initializeApp(firebasePublicConfig) : getApp();

// Initialize App Check before any Firebase service is accessed. Callable SDK
// requests then carry a reCAPTCHA Enterprise attestation automatically. Local
// browser workflows use a structurally valid, unsigned token that is accepted
// only by the Functions emulator. It is not a secret/debug credential, and the
// production build fails closed before this branch can run.
function base64UrlJson(value: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window
    .btoa(binary)
    .replace(/=/gu, '')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_');
}

function createFunctionsEmulatorAppCheckToken(): string {
  if (isProductionBuild || !useFirebaseEmulator) {
    throw new Error('Emulator App Check tokens are unavailable outside local development.');
  }
  const issuedAt = Math.floor(Date.now() / 1_000);
  return [
    base64UrlJson({ alg: 'none', typ: 'JWT' }),
    base64UrlJson({
      app_id: firebasePublicConfig.appId,
      aud: [`projects/${firebasePublicConfig.projectId}`],
      exp: issuedAt + 60 * 60,
      iat: issuedAt,
      iss: `https://firebaseappcheck.googleapis.com/${firebasePublicConfig.projectId}`,
      sub: firebasePublicConfig.appId,
    }),
    'functions-emulator-only',
  ].join('.');
}

if (typeof window !== 'undefined' && !window.__FIREBASE_APP_CHECK_INITIALIZED__) {
  const provider = useFirebaseEmulator
    ? new CustomProvider({
        getToken: async () => ({
          token: createFunctionsEmulatorAppCheckToken(),
          expireTimeMillis: Date.now() + 60 * 60 * 1_000,
        }),
      })
    : new ReCaptchaEnterpriseProvider(firebaseAppCheckSiteKey!);
  initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: !useFirebaseEmulator,
  });
  window.__FIREBASE_APP_CHECK_INITIALIZED__ = true;
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(
  app,
  firebaseFunctionsRegion
);
export const storage = getStorage(app);

// Safe emulator attachment with Hot Module Reload (HMR) guard
if (typeof window !== 'undefined' && useFirebaseEmulator) {
  if (!window.__FIREBASE_EMULATORS_CONNECTED__) {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      window.__FIREBASE_EMULATORS_CONNECTED__ = true;
    } catch {
      // Ignore repeat connection calls during development HMR
    }
  }
}

export default app;
