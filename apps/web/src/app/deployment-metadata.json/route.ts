import { firebaseDeploymentMetadata } from '@/lib/firebase-public-config';

export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json(firebaseDeploymentMetadata, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
