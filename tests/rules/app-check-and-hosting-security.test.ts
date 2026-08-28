import { readFileSync } from 'node:fs';

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

describe('App Check and Firebase Hosting browser perimeter', () => {
  test('cloud web builds initialize reCAPTCHA Enterprise App Check before Firebase services', () => {
    const firebaseClient = source('apps/web/src/lib/firebase.ts');
    const firebasePublicConfig = source('apps/web/src/lib/firebase-public-config.ts');
    const appCheckInitialization = firebaseClient.indexOf('initializeAppCheck(app, {');
    const firstServiceAccess = firebaseClient.indexOf('export const auth = getAuth(app)');

    expect(firebaseClient).toContain('ReCaptchaEnterpriseProvider');
    expect(firebaseClient).toContain('CustomProvider');
    expect(firebaseClient).toContain('firebaseAppCheckSiteKey');
    expect(firebaseClient).toContain('isTokenAutoRefreshEnabled: !useFirebaseEmulator');
    expect(firebasePublicConfig).toContain('NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY');
    expect(firebasePublicConfig).toContain('if (useFirebaseEmulator) return null');
    expect(firebasePublicConfig).toContain(
      'Firebase emulators cannot be enabled in a production web build.'
    );
    expect(firebaseClient).toContain(
      "throw new Error('Emulator App Check tokens are unavailable outside local development.')"
    );
    expect(firebaseClient).toContain("'functions-emulator-only'");
    expect(firebaseClient).not.toContain('FIREBASE_APPCHECK_DEBUG_TOKEN');
    expect(appCheckInitialization).toBeGreaterThan(0);
    expect(firstServiceAccess).toBeGreaterThan(appCheckInitialization);
  });

  test('local attestation is emulator-only and generated production assets are scanned', () => {
    const firebaseClient = source('apps/web/src/lib/firebase.ts');
    const firebasePublicConfig = source('apps/web/src/lib/firebase-public-config.ts');
    const packageManifest = JSON.parse(source('package.json')) as {
      scripts?: Record<string, string>;
    };
    const bundleGate = source('scripts/verify-production-web-bundle.mjs');

    const productionRejection = firebasePublicConfig.indexOf(
      'if (isProductionBuild && useFirebaseEmulator)'
    );
    const emulatorToken = firebaseClient.indexOf(
      'function createFunctionsEmulatorAppCheckToken()'
    );
    expect(productionRejection).toBeGreaterThan(0);
    expect(emulatorToken).toBeGreaterThan(0);
    expect(firebaseClient).toContain('if (isProductionBuild || !useFirebaseEmulator)');
    expect(bundleGate).toContain("'functions-emulator-only'");
    expect(bundleGate).toContain("resolve(REPOSITORY_ROOT, 'apps/web/out')");
    expect(packageManifest.scripts?.['security:web-bundle']).toBe(
      'node scripts/verify-production-web-bundle.mjs'
    );
    expect(packageManifest.scripts?.['test:ci']).toContain('security:web-bundle');
  });

  test('authoritative command boundary requires platform and in-handler App Check verification', () => {
    const boundary = source('functions/src/lib/command-boundary.ts');
    const bootstrap = source('functions/src/bootstrap.ts');

    expect(bootstrap).toContain('enforceAppCheck: true');
    expect(boundary).toContain('export const AUTHORITATIVE_CALLABLE_OPTIONS');
    expect(boundary).toContain('enforceAppCheck: true');
    expect(boundary).toContain('if (!request.app)');
    expect(boundary).toContain('A valid Firebase App Check attestation is required.');
  });

  test('Hosting enforces browser security headers and safe cache separation', () => {
    const config = JSON.parse(source('firebase.json')) as {
      hosting?: {
        headers?: Array<{
          source: string;
          headers: Array<{ key: string; value: string }>;
        }>;
      };
    };
    const rules = config.hosting?.headers ?? [];
    const allPaths = rules.find((rule) => rule.source === '**');
    const staticAssets = rules.find((rule) => rule.source === '/_next/static/**');
    expect(allPaths).toBeDefined();
    expect(staticAssets).toBeDefined();

    const header = (rule: typeof allPaths, name: string): string | undefined =>
      rule?.headers.find((candidate) => candidate.key === name)?.value;
    const csp = header(allPaths, 'Content-Security-Policy') ?? '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain('https://www.google.com/recaptcha/');
    expect(csp).toContain('https://www.gstatic.com/recaptcha/');
    expect(csp).toContain('https://firebaseappcheck.googleapis.com');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(header(allPaths, 'X-Content-Type-Options')).toBe('nosniff');
    expect(header(allPaths, 'X-Frame-Options')).toBe('DENY');
    expect(header(allPaths, 'Referrer-Policy')).toBe('no-referrer');
    expect(header(allPaths, 'Cache-Control')).toBe('no-store');
    expect(header(staticAssets, 'Cache-Control')).toBe(
      'public,max-age=31536000,immutable'
    );
  });
});
