const isProductionBuild = process.env.NODE_ENV === 'production';
const useFirebaseEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

if (isProductionBuild && useFirebaseEmulator) {
  throw new Error('Firebase emulators cannot be enabled in a production web build.');
}

function requiredClientConfig(
  name: string,
  value: string | undefined
): string {
  const normalized = value?.trim();
  if (normalized) return normalized;
  throw new Error(`Missing required public Firebase configuration: ${name}`);
}

function requiredCloudClientConfig(name: string, value: string | undefined): string | null {
  if (useFirebaseEmulator) return null;
  const normalized = value?.trim();
  if (normalized) return normalized;
  throw new Error(
    `Missing required cloud Firebase configuration: ${name}. ` +
      'Use the Firebase Emulator Suite for local development or configure App Check.'
  );
}

const devPersonaValues = [
  process.env.NEXT_PUBLIC_DEV_PERSONA_PASSWORD,
  process.env.NEXT_PUBLIC_DEV_PERSONA_TENANT_ADMIN_EMAIL,
  process.env.NEXT_PUBLIC_DEV_PERSONA_COMPLIANCE_MANAGER_EMAIL,
  process.env.NEXT_PUBLIC_DEV_PERSONA_SECURITY_MANAGER_EMAIL,
  process.env.NEXT_PUBLIC_DEV_PERSONA_PRIVACY_MANAGER_EMAIL,
  process.env.NEXT_PUBLIC_DEV_PERSONA_AI_GOVERNANCE_MANAGER_EMAIL,
  process.env.NEXT_PUBLIC_DEV_PERSONA_APPROVER_EMAIL,
  process.env.NEXT_PUBLIC_DEV_PERSONA_AUDITOR_EMAIL,
  process.env.NEXT_PUBLIC_DEV_PERSONA_CONTRIBUTOR_EMAIL,
];

export const devPersonaConfigurationPresent =
  process.env.NEXT_PUBLIC_ENABLE_DEV_PERSONAS === 'true' ||
  devPersonaValues.some((value) => Boolean(value?.trim()));

if (isProductionBuild && devPersonaConfigurationPresent) {
  throw new Error('Development persona configuration cannot be embedded in a production build.');
}

export const firebasePublicConfig = Object.freeze({
  apiKey: requiredClientConfig(
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  ),
  authDomain: requiredClientConfig(
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  ),
  projectId: requiredClientConfig(
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ),
  storageBucket: requiredClientConfig(
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: requiredClientConfig(
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  ),
  appId: requiredClientConfig(
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  ),
});

export const firebaseFunctionsRegion = requiredClientConfig(
  'NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION',
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION
);

export const firebaseAppCheckSiteKey = requiredCloudClientConfig(
  'NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY',
  process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY
);

export const firebaseDeploymentMetadata = Object.freeze({
  schemaVersion: 1,
  buildMode: isProductionBuild ? 'production' : 'development',
  projectId: firebasePublicConfig.projectId,
  apiKey: firebasePublicConfig.apiKey,
  appId: firebasePublicConfig.appId,
  authDomain: firebasePublicConfig.authDomain,
  storageBucket: firebasePublicConfig.storageBucket,
  messagingSenderId: firebasePublicConfig.messagingSenderId,
  functionsRegion: firebaseFunctionsRegion,
  appCheckSiteKey: firebaseAppCheckSiteKey,
  emulatorEnabled: useFirebaseEmulator,
  appCheckMode: useFirebaseEmulator ? 'functions_emulator' : 'recaptcha_enterprise',
  devPersonaConfigurationPresent,
});

export { isProductionBuild, useFirebaseEmulator };
