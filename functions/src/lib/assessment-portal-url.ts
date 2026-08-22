import { HttpsError } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { buildAssessmentPortalAccessUrl } from '@eurogovernance/shared-types';

const assessmentPortalOrigin = defineString('ASSESSMENT_PORTAL_ORIGIN', {
  description:
    'HTTPS origin for the external assessment portal in this Firebase environment (for example https://staging.example.eu).',
});

export interface DeploymentAssessmentPortalUrlInput {
  tenantId: string;
  requestId: string;
  tokenId: string;
  rawToken: string;
}
/**
 * Builds links from an explicit per-deployment origin. There is intentionally
 * no production-domain fallback: a missing staging/dev parameter must fail
 * closed instead of silently sending respondents to another environment.
 */
export function buildDeploymentAssessmentPortalAccessUrl(
  input: DeploymentAssessmentPortalUrlInput
): string {
  const portalBaseUrl = assessmentPortalOrigin.value()?.trim();
  if (!portalBaseUrl) {
    throw new HttpsError(
      'failed-precondition',
      'Assessment portal links are not configured for this deployment.'
    );
  }

  try {
    return buildAssessmentPortalAccessUrl({ portalBaseUrl, ...input });
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Assessment portal links are not configured with a valid HTTPS origin.'
    );
  }
}
