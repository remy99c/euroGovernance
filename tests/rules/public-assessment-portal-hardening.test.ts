import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AssessmentAccessToken,
  DynamicQuestionnaireSection,
  QuestionnaireAnswer,
  ThirdPartyAssessmentRequest,
  buildAssessmentPortalAccessUrl,
  createAssessmentTokenActivityUpdate,
  createSanitizedPublicAssessmentView,
  sanitizePublicQuestionnaireSections,
  validateAnswer,
  validateAndNormalizePublicAssessmentAnswers,
} from '@eurogovernance/shared-types';

const now = '2026-08-21T12:00:00.000Z';
const tenantId = 'tenant_alpha';
const requestId = 'req_supplier_001';
const tokenId = 'tok_001';
const rawToken = 'a'.repeat(64);

const sections: DynamicQuestionnaireSection[] = [
  {
    id: 'sec_security',
    tenantId,
    templateId: 'tmpl_001',
    code: 'SEC',
    title: 'Security',
    sortOrder: 1,
    weight: 1,
    questions: [
      {
        id: 'q_encrypt',
        tenantId,
        templateId: 'tmpl_001',
        sectionId: 'sec_security',
        code: 'SEC-01',
        title: 'Encryption enabled?',
        questionType: 'yes_no',
        required: true,
        sortOrder: 1,
        scoring: { weight: 5, passingThresholdScore: 100 },
        riskTriggers: [
          {
            operator: 'is_falsy',
            riskCode: 'NO_ENCRYPTION',
            riskTitle: 'Encryption missing',
            riskSeverity: 'critical',
            riskCategory: 'security',
            suggestedRemediation: 'Enable encryption.',
          },
        ],
        createdBy: 'internal_user_123',
        updatedBy: 'internal_user_123',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'q_region',
        tenantId,
        templateId: 'tmpl_001',
        sectionId: 'sec_security',
        code: 'SEC-02',
        title: 'Hosting region',
        questionType: 'single_select',
        required: true,
        sortOrder: 2,
        scoring: { weight: 5 },
        options: [
          { label: 'European Union', value: 'eu', score: 100 },
          { label: 'Other', value: 'other', score: 0, isRiskTrigger: true },
        ],
        createdBy: 'internal_user_123',
        updatedBy: 'internal_user_123',
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdBy: 'internal_user_123',
    updatedBy: 'internal_user_123',
    createdAt: now,
    updatedAt: now,
  },
];

function validAnswer(value: QuestionnaireAnswer['value'] = true): QuestionnaireAnswer {
  return {
    questionId: 'q_encrypt',
    questionCode: 'SEC-01',
    sectionId: 'sec_security',
    value,
    attachedEvidenceIds: [],
    updatedAt: '1999-01-01T00:00:00.000Z',
  };
}

function tokenRecord(): AssessmentAccessToken {
  return {
    id: tokenId,
    tenantId,
    requestId,
    templateId: 'tmpl_001',
    recipientEmail: 'security@supplier.example',
    recipientName: 'Supplier Security',
    thirdPartyName: 'Supplier Ltd',
    tokenHash: 'hash',
    tokenType: 'single_use',
    status: 'active',
    maxUses: 1,
    useCount: 0,
    expiresAt: '2026-09-21T12:00:00.000Z',
    lastAccessedAt: null,
    lastAccessedIpMasked: null,
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    requireEmailVerificationCode: false,
    issuedByUserId: 'manager_001',
    issuedAt: now,
    ownerId: 'manager_001',
    createdBy: 'manager_001',
    updatedBy: 'manager_001',
    createdAt: now,
    updatedAt: now,
  };
}

describe('public assessment portal security contract', () => {
  it('uses the real fixed export route, tenant-bound identifiers, and a non-HTTP bearer fragment', () => {
    const accessUrl = buildAssessmentPortalAccessUrl({
      portalBaseUrl: 'https://staging.eurogovernance.example',
      tenantId,
      requestId,
      tokenId,
      rawToken,
    });
    const parsed = new URL(accessUrl);

    expect(parsed.origin).toBe('https://staging.eurogovernance.example');
    expect(parsed.pathname).toBe('/portal/assessments/');
    expect(parsed.searchParams.get('tenantId')).toBe(tenantId);
    expect(parsed.searchParams.get('requestId')).toBe(requestId);
    expect(parsed.searchParams.get('tokenId')).toBe(tokenId);
    expect(parsed.searchParams.has('token')).toBe(false);
    expect(parsed.hash).toBe(`#token=${rawToken}`);
  });

  it.each([
    'https://dev.eurogovernance.example',
    'https://staging.eurogovernance.example',
    'https://app.eurogovernance.example',
  ])('uses the explicitly configured HTTPS origin for %s', (portalBaseUrl) => {
    expect(
      buildAssessmentPortalAccessUrl({ portalBaseUrl, tenantId, requestId, tokenId, rawToken })
    ).toMatch(new RegExp(`^${portalBaseUrl.replaceAll('.', '\\.')}/portal/assessments/`));
  });

  it.each([
    'http://staging.eurogovernance.example',
    'https://user:password@app.eurogovernance.example',
    'https://app.eurogovernance.example/untrusted-path',
    'https://app.eurogovernance.example?redirect=evil',
  ])('rejects an unsafe portal origin: %s', (portalBaseUrl) => {
    expect(() =>
      buildAssessmentPortalAccessUrl({ portalBaseUrl, tenantId, requestId, tokenId, rawToken })
    ).toThrow('portalBaseUrl must be an HTTPS origin');
  });

  it('does not consume final-submission allowance for page views or draft saves', () => {
    const token = tokenRecord();
    expect(createAssessmentTokenActivityUpdate(token, 'view', now)).not.toHaveProperty('useCount');
    expect(createAssessmentTokenActivityUpdate(token, 'draft', now)).not.toHaveProperty('useCount');
    expect(createAssessmentTokenActivityUpdate(token, 'final_submission', now)).toMatchObject({
      useCount: 1,
      status: 'used',
    });
  });

  it('normalizes a valid answer using server time and canonical question identity', () => {
    const result = validateAndNormalizePublicAssessmentAnswers(
      sections,
      { q_encrypt: validAnswer() },
      now
    );

    expect(result.valid).toBe(true);
    expect(result.normalizedAnswers.q_encrypt).toEqual({
      questionId: 'q_encrypt',
      questionCode: 'SEC-01',
      sectionId: 'sec_security',
      value: true,
      attachedEvidenceIds: [],
      updatedAt: now,
    });
  });

  it.each([
    ['whitespace-only required text', 'text', '   '],
    ['empty required multi-select', 'multi_select', []],
  ] as const)('rejects %s as unanswered', (_name, questionType, value) => {
    const question = {
      ...sections[0]!.questions[0]!,
      id: `q_${questionType}`,
      code: `REQ-${questionType}`,
      questionType,
      required: false,
      ...(questionType === 'multi_select'
        ? { options: [{ label: 'One', value: 'one', score: 100 }] }
        : { options: undefined }),
    };
    const result = validateAnswer(
      question,
      {
        questionId: question.id,
        questionCode: question.code,
        sectionId: question.sectionId,
        value,
        attachedEvidenceIds: [],
        updatedAt: now,
      },
      // Models a conditional rule making an otherwise optional question required.
      { checkRequired: true }
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('mandatory');
  });

  it.each([
    ['unknown question injection', { q_admin_override: { ...validAnswer(), questionId: 'q_admin_override' } }],
    ['mismatched question identity', { q_encrypt: { ...validAnswer(), questionCode: 'FORGED-01' } }],
    ['wrong answer value type', { q_encrypt: validAnswer({ malicious: true } as unknown as string) }],
    ['server-owned score injection', { q_encrypt: { ...validAnswer(), calculatedScore: 100 } }],
    [
      'unverified storage metadata',
      {
        q_encrypt: {
          ...validAnswer(),
          attachedFileMetadata: [
            {
              fileName: 'fake.pdf',
              fileSizeBytes: 10,
              mimeType: 'application/pdf',
              storagePath: `tenants/${tenantId}/evidence/admin-secret.pdf`,
              fileHashSha256: 'forged',
              uploadedAt: now,
            },
          ],
        },
      },
    ],
    ['unverified evidence ID', { q_encrypt: { ...validAnswer(), attachedEvidenceIds: ['ev_internal'] } }],
  ])('rejects %s', (_name, payload) => {
    const result = validateAndNormalizePublicAssessmentAnswers(sections, payload, now);
    expect(result.valid).toBe(false);
  });

  it('strips scoring, risk rules, ownership, and option scores from the public questionnaire', () => {
    const publicSections = sanitizePublicQuestionnaireSections(sections);
    const serialized = JSON.stringify(publicSections);

    expect(serialized).not.toContain('internal_user_123');
    expect(serialized).not.toContain('tenant_alpha');
    expect(serialized).not.toContain('scoring');
    expect(serialized).not.toContain('riskTriggers');
    expect(serialized).not.toContain('passingThresholdScore');
    expect(serialized).not.toContain('"score"');
    expect(publicSections[0]?.questions[1]?.options).toEqual([
      { label: 'European Union', value: 'eu' },
      { label: 'Other', value: 'other' },
    ]);
  });

  it('strips reviewer and attachment fields from an existing public draft', () => {
    const request = {
      id: requestId,
      tenantId,
      title: 'Supplier assessment',
      templateId: 'tmpl_001',
      templateSnapshot: {
        title: 'Supplier questionnaire',
        description: 'Complete the questionnaire.',
        sections,
      },
      thirdPartyName: 'Supplier Ltd',
      respondent: {
        name: 'Supplier Security',
        email: 'security@supplier.example',
      },
      dueDate: '2026-09-21T12:00:00.000Z',
      status: 'in_progress',
      updatedAt: now,
    } as unknown as ThirdPartyAssessmentRequest;
    const existing = {
      q_encrypt: {
        ...validAnswer(),
        reviewerFlag: 'critical_finding',
        reviewerComment: 'Internal-only finding',
        calculatedScore: 0,
        attachedEvidenceIds: ['ev_internal'],
        attachedFileMetadata: [
          {
            fileName: 'secret.pdf',
            fileSizeBytes: 10,
            mimeType: 'application/pdf',
            storagePath: 'tenants/tenant_alpha/evidence/secret.pdf',
            uploadedAt: now,
          },
        ],
      },
    } as unknown as Record<string, QuestionnaireAnswer>;

    const publicView = createSanitizedPublicAssessmentView(request, tokenRecord(), existing);
    const serialized = JSON.stringify(publicView.existingAnswers);
    expect(serialized).not.toContain('Internal-only finding');
    expect(serialized).not.toContain('secret.pdf');
    expect(serialized).not.toContain('ev_internal');
    expect(serialized).not.toContain('calculatedScore');
  });

  it('ships a fixed static page and reads the secret only from the URL fragment', () => {
    const workspaceRoot = resolve(process.cwd(), '../..');
    const fixedPage = readFileSync(
      resolve(workspaceRoot, 'apps/web/src/app/portal/assessments/page.tsx'),
      'utf8'
    );
    const client = readFileSync(
      resolve(workspaceRoot, 'apps/web/src/app/portal/assessments/[id]/portal-client.tsx'),
      'utf8'
    );

    expect(fixedPage).toContain('ExternalAssessmentPortalClient');
    expect(client).toContain('window.location.hash');
    expect(client).toContain("searchParams.get('requestId')");
    expect(client).toContain("searchParams.get('tokenId')");
    expect(client).not.toContain("searchParams.get('token')");
  });

  it('uses the canonical answer-presence predicate for draft required counts', () => {
    const workspaceRoot = resolve(process.cwd(), '../..');
    const handler = readFileSync(
      resolve(workspaceRoot, 'functions/src/handlers/assessment-access-tokens.ts'),
      'utf8'
    );
    const draftStart = handler.indexOf('export const savePublicAssessmentDraft');
    const submitStart = handler.indexOf('export const submitPublicAssessment', draftStart);
    const draftHandler = handler.slice(draftStart, submitStart);

    expect(draftStart).toBeGreaterThanOrEqual(0);
    expect(submitStart).toBeGreaterThan(draftStart);
    expect(draftHandler).toContain(
      'visibility.isRequired && !isQuestionnaireAnswerValuePresent(value)'
    );
  });
});
