import { setGlobalOptions } from 'firebase-functions/v2';

// This side-effect module must be the first dependency of the Functions entry
// point. Static re-exported handlers are evaluated before the entry module body,
// so configuring global options directly in index.ts registers them in the
// default region instead of the intended EU region.
setGlobalOptions({
  region: 'europe-west3',
  minInstances: 0,
  maxInstances: 50,
  concurrency: 40,
  // Every callable is an abuse/cost and data-integrity surface. Individual
  // low-volume critical endpoints may additionally consume limited-use tokens,
  // but no deployed callable may opt out of baseline App Check enforcement.
  enforceAppCheck: true,
});
