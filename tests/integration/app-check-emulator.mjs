import { createRequire } from 'node:module';

const requireFromWeb = createRequire(
  new URL('../../apps/web/package.json', import.meta.url)
);
const { CustomProvider, initializeAppCheck } = requireFromWeb('firebase/app-check');

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Attach a structurally valid App Check token to callable requests. This helper
 * is emulator-only: the Functions emulator decodes, but does not trust or
 * externally verify, the token. Production uses reCAPTCHA Enterprise and must
 * never import this module or a debug token.
 */
export function initializeFunctionsEmulatorAppCheck(clientApp) {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Refusing to initialize emulator App Check outside emulator tests.');
  }

  const appId = clientApp.options.appId;
  const projectId = clientApp.options.projectId;
  if (typeof appId !== 'string' || typeof projectId !== 'string') {
    throw new Error('The emulator Firebase app requires appId and projectId.');
  }

  const token = [
    base64UrlJson({ alg: 'none', typ: 'JWT' }),
    base64UrlJson({
      app_id: appId,
      aud: [`projects/${projectId}`],
      exp: Math.floor(Date.now() / 1_000) + 60 * 60,
      iat: Math.floor(Date.now() / 1_000),
      iss: `https://firebaseappcheck.googleapis.com/${projectId}`,
      sub: appId,
    }),
    'emulator-signature',
  ].join('.');

  initializeAppCheck(clientApp, {
    provider: new CustomProvider({
      getToken: async () => ({
        token,
        expireTimeMillis: Date.now() + 60 * 60 * 1_000,
      }),
    }),
    isTokenAutoRefreshEnabled: false,
  });
}
