import {
  DynamicQuestionnaireQuestion,
  QuestionnaireAnswer,
  validateQuestionDefinition,
  validateAnswer,
  evaluateQuestionVisibility,
  evaluateQuestionScore,
  evaluateQuestionRiskFlags,
} from '@eurogovernance/shared-types';

describe('Third-Party Questionnaire Question Model Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. QUESTION SCHEMA VALIDATION
  // ---------------------------------------------------------------------------
  describe('1. Question Schema Validation', () => {
    it('validates supported question types (yes_no, single_select, multi_select, numeric, date, file_upload, rating_scale)', () => {
      const yesNoQ: DynamicQuestionnaireQuestion = {
        id: 'q_dpo',
        tenantId: 'tenant_a',
        templateId: 'tmpl_1',
        sectionId: 'sec_1',
        code: 'GOV-01',
        title: 'Has your organization appointed a Data Protection Officer (DPO)?',
        questionType: 'yes_no',
        required: true,
        sortOrder: 1,
        scoring: { weight: 5, maxPoints: 100, passingThresholdScore: 70 },
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: now,
        updatedAt: now,
      };

      const selectQ: DynamicQuestionnaireQuestion = {
        id: 'q_hosting_loc',
        tenantId: 'tenant_a',
        templateId: 'tmpl_1',
        sectionId: 'sec_1',
        code: 'INFRA-01',
        title: 'Primary Data Hosting Region',
        questionType: 'single_select',
        required: true,
        sortOrder: 2,
        scoring: { weight: 8, maxPoints: 100 },
        options: [
          { label: 'European Union (EEA)', value: 'eu_eea', score: 100 },
          { label: 'Adequate Third Country (e.g. Switzerland, UK)', value: 'adequate', score: 90 },
          { label: 'Non-Adequate Country without SCCs', value: 'non_adequate', score: 0, isRiskTrigger: true },
        ],
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: now,
        updatedAt: now,
      };

      const numericQ: DynamicQuestionnaireQuestion = {
        id: 'q_breach_sla',
        tenantId: 'tenant_a',
        templateId: 'tmpl_1',
        sectionId: 'sec_1',
        code: 'INC-01',
        title: 'Confirmed Security Incident Notification SLA (Hours)',
        questionType: 'numeric',
        required: true,
        sortOrder: 3,
        scoring: {
          weight: 10,
          maxPoints: 100,
          numericRanges: [
            { min: 0, max: 24, score: 100, label: 'Excellent (<24h)' },
            { min: 25, max: 72, score: 90, label: 'Compliant with GDPR Art. 33 (<=72h)' },
            { min: 73, score: 0, label: 'Non-compliant (>72h)' },
          ],
        },
        numericConstraints: { min: 1, max: 720, unit: 'hours' },
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: now,
        updatedAt: now,
      };

      const fileQ: DynamicQuestionnaireQuestion = {
        id: 'q_soc2_upload',
        tenantId: 'tenant_a',
        templateId: 'tmpl_1',
        sectionId: 'sec_1',
        code: 'CERT-01',
        title: 'Upload Current SOC 2 Type II or ISO 27001 Certificate',
        questionType: 'file_upload',
        required: false,
        sortOrder: 4,
        scoring: { weight: 10, maxPoints: 100, evidenceBonusPoints: 10 },
        requiresEvidence: true,
        acceptedEvidenceCategories: ['soc_report', 'iso_certificate'],
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: now,
        updatedAt: now,
      };

      expect(validateQuestionDefinition(yesNoQ).valid).toBe(true);
      expect(validateQuestionDefinition(selectQ).valid).toBe(true);
      expect(validateQuestionDefinition(numericQ).valid).toBe(true);
      expect(validateQuestionDefinition(fileQ).valid).toBe(true);
    });

    it('rejects questions missing required fields or invalid select option counts', () => {
      const invalidSelect: Partial<DynamicQuestionnaireQuestion> = {
        id: 'q_bad',
        code: 'BAD-01',
        title: 'Incomplete Question',
        questionType: 'single_select',
        options: [{ label: 'Only One Option', value: 'one', score: 100 }], // Needs >= 2 options
      };

      const res = validateQuestionDefinition(invalidSelect);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('at least 2 options'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. CONDITIONAL VISIBILITY & DYNAMIC FOLLOW-UP LOGIC
  // ---------------------------------------------------------------------------
  describe('2. Conditional Visibility & Dynamic Follow-up Logic', () => {
    const parentHoldCertsQ: DynamicQuestionnaireQuestion = {
      id: 'q_holds_iso27001',
      tenantId: 'tenant_a',
      templateId: 'tmpl_1',
      sectionId: 'sec_1',
      code: 'CERT-ISO',
      title: 'Do you hold an active, accredited ISO/IEC 27001 certification?',
      questionType: 'yes_no',
      required: true,
      sortOrder: 1,
      scoring: { weight: 5 },
      createdBy: 'user_1',
      updatedBy: 'user_1',
      createdAt: now,
      updatedAt: now,
    };

    // Follow-up question 1: Upload certificate (Only visible if holds_iso27001 is true)
    const childUploadCertQ: DynamicQuestionnaireQuestion = {
      id: 'q_upload_iso_cert',
      tenantId: 'tenant_a',
      templateId: 'tmpl_1',
      sectionId: 'sec_1',
      code: 'CERT-ISO-DOC',
      title: 'Upload your accredited ISO 27001 Certificate & Statement of Applicability',
      questionType: 'file_upload',
      required: true,
      sortOrder: 2,
      scoring: { weight: 10 },
      requiresEvidence: true,
      conditionalRules: [
        {
          dependsOnQuestionId: 'q_holds_iso27001',
          operator: 'is_truthy',
          action: 'show',
        },
      ],
      createdBy: 'user_1',
      updatedBy: 'user_1',
      createdAt: now,
      updatedAt: now,
    };

    // Follow-up question 2: Deep-dive manual TOMs review (Only required if holds_iso27001 is NO)
    const childDeepDiveTomsQ: DynamicQuestionnaireQuestion = {
      id: 'q_deep_dive_toms',
      tenantId: 'tenant_a',
      templateId: 'tmpl_1',
      sectionId: 'sec_1',
      code: 'TOM-MANUAL',
      title: 'Provide detailed architectural breakdown of encryption and physical security measures',
      questionType: 'textarea',
      required: false,
      sortOrder: 3,
      scoring: { weight: 10 },
      conditionalRules: [
        {
          dependsOnQuestionId: 'q_holds_iso27001',
          operator: 'is_falsy',
          action: 'require',
        },
        {
          dependsOnQuestionId: 'q_holds_iso27001',
          operator: 'is_truthy',
          action: 'hide',
        },
      ],
      createdBy: 'user_1',
      updatedBy: 'user_1',
      createdAt: now,
      updatedAt: now,
    };

    it('shows certificate upload follow-up and hides manual TOMs deep-dive when ISO 27001 is YES', () => {
      expect(validateQuestionDefinition(parentHoldCertsQ).valid).toBe(true);
      const answers: Record<string, QuestionnaireAnswer> = {
        q_holds_iso27001: {
          questionId: 'q_holds_iso27001',
          questionCode: 'CERT-ISO',
          sectionId: 'sec_1',
          value: true,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
      };

      const certVis = evaluateQuestionVisibility(childUploadCertQ, answers);
      expect(certVis.isVisible).toBe(true);
      expect(certVis.isRequired).toBe(true);

      const tomsVis = evaluateQuestionVisibility(childDeepDiveTomsQ, answers);
      expect(tomsVis.isVisible).toBe(false);
    });

    it('hides certificate upload and makes manual TOMs deep-dive mandatory when ISO 27001 is NO', () => {
      const answers: Record<string, QuestionnaireAnswer> = {
        q_holds_iso27001: {
          questionId: 'q_holds_iso27001',
          questionCode: 'CERT-ISO',
          sectionId: 'sec_1',
          value: false,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
      };

      const certVis = evaluateQuestionVisibility(childUploadCertQ, answers);
      expect(certVis.isVisible).toBe(false);

      const tomsVis = evaluateQuestionVisibility(childDeepDiveTomsQ, answers);
      expect(tomsVis.isVisible).toBe(true);
      expect(tomsVis.isRequired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ANSWER VALIDATION
  // ---------------------------------------------------------------------------
  describe('3. Answer Validation', () => {
    const multiSelectQ: DynamicQuestionnaireQuestion = {
      id: 'q_certs_multi',
      tenantId: 'tenant_a',
      templateId: 'tmpl_1',
      sectionId: 'sec_1',
      code: 'CERTS-01',
      title: 'Select all certifications maintained',
      questionType: 'multi_select',
      required: true,
      sortOrder: 1,
      scoring: { weight: 5 },
      options: [
        { label: 'ISO/IEC 27001', value: 'iso_27001', score: 100 },
        { label: 'SOC 2 Type II', value: 'soc2_type2', score: 100 },
        { label: 'ISO 27701 (Privacy)', value: 'iso_27701', score: 100 },
      ],
      createdBy: 'user_1',
      updatedBy: 'user_1',
      createdAt: now,
      updatedAt: now,
    };

    const dateQ: DynamicQuestionnaireQuestion = {
      id: 'q_audit_date',
      tenantId: 'tenant_a',
      templateId: 'tmpl_1',
      sectionId: 'sec_1',
      code: 'DATE-01',
      title: 'Last Independent Third-Party Audit Date',
      questionType: 'date',
      required: true,
      sortOrder: 2,
      scoring: { weight: 5 },
      createdBy: 'user_1',
      updatedBy: 'user_1',
      createdAt: now,
      updatedAt: now,
    };

    it('validates correct multi-select and date answers', () => {
      const validMultiAns: QuestionnaireAnswer = {
        questionId: 'q_certs_multi',
        questionCode: 'CERTS-01',
        sectionId: 'sec_1',
        value: ['iso_27001', 'soc2_type2'],
        attachedEvidenceIds: [],
        updatedAt: now,
      };

      const validDateAns: QuestionnaireAnswer = {
        questionId: 'q_audit_date',
        questionCode: 'DATE-01',
        sectionId: 'sec_1',
        value: '2026-06-15',
        attachedEvidenceIds: [],
        updatedAt: now,
      };

      expect(validateAnswer(multiSelectQ, validMultiAns, { checkRequired: true }).valid).toBe(true);
      expect(validateAnswer(dateQ, validDateAns, { checkRequired: true }).valid).toBe(true);
    });

    it('rejects unrecognized multi-select options and invalid date formats', () => {
      const invalidMultiAns = {
        value: ['invalid_unlisted_cert'],
      };

      const invalidDateAns = {
        value: 'not-a-valid-date',
      };

      const multiRes = validateAnswer(multiSelectQ, invalidMultiAns);
      expect(multiRes.valid).toBe(false);
      expect(multiRes.errors.some((e) => e.includes('not a valid option'))).toBe(true);

      const dateRes = validateAnswer(dateQ, invalidDateAns);
      expect(dateRes.valid).toBe(false);
      expect(dateRes.errors.some((e) => e.includes('valid ISO date'))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SCORING & WEIGHTING METADATA INTEGRITY
  // ---------------------------------------------------------------------------
  describe('4. Scoring & Weighting Engine', () => {
    it('scores numeric threshold questions based on ranges (e.g. breach notice SLA)', () => {
      const breachSlaQ: DynamicQuestionnaireQuestion = {
        id: 'q_sla',
        tenantId: 'tenant_a',
        templateId: 'tmpl_1',
        sectionId: 'sec_1',
        code: 'INC-01',
        title: 'Incident Notification SLA',
        questionType: 'numeric',
        required: true,
        sortOrder: 1,
        scoring: {
          weight: 10,
          maxPoints: 100,
          passingThresholdScore: 75,
          numericRanges: [
            { min: 0, max: 24, score: 100 },
            { min: 25, max: 72, score: 85 },
            { min: 73, score: 0 },
          ],
        },
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: now,
        updatedAt: now,
      };

      const ansUnder24h: QuestionnaireAnswer = {
        questionId: 'q_sla',
        questionCode: 'INC-01',
        sectionId: 'sec_1',
        value: 12,
        attachedEvidenceIds: [],
        updatedAt: now,
      };

      const ans48h: QuestionnaireAnswer = {
        questionId: 'q_sla',
        questionCode: 'INC-01',
        sectionId: 'sec_1',
        value: 48,
        attachedEvidenceIds: [],
        updatedAt: now,
      };

      const ans96h: QuestionnaireAnswer = {
        questionId: 'q_sla',
        questionCode: 'INC-01',
        sectionId: 'sec_1',
        value: 96,
        attachedEvidenceIds: [],
        updatedAt: now,
      };

      const score24 = evaluateQuestionScore(breachSlaQ, ansUnder24h);
      expect(score24.scorePercent).toBe(100);
      expect(score24.isPassing).toBe(true);

      const score48 = evaluateQuestionScore(breachSlaQ, ans48h);
      expect(score48.scorePercent).toBe(85);
      expect(score48.isPassing).toBe(true);

      const score96 = evaluateQuestionScore(breachSlaQ, ans96h);
      expect(score96.scorePercent).toBe(0);
      expect(score96.isPassing).toBe(false);
    });

    it('awards bonus points for attached evidence verification', () => {
      const certEvidenceQ: DynamicQuestionnaireQuestion = {
        id: 'q_cert',
        tenantId: 'tenant_a',
        templateId: 'tmpl_1',
        sectionId: 'sec_1',
        code: 'CERT-01',
        title: 'Certifications',
        questionType: 'single_select',
        required: true,
        sortOrder: 1,
        scoring: {
          weight: 5,
          maxPoints: 100,
          evidenceBonusPoints: 15,
        },
        options: [
          { label: 'ISO 27001 Certified', value: 'iso', score: 85 },
          { label: 'Self-Assessed Only', value: 'self', score: 40 },
        ],
        requiresEvidence: true,
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: now,
        updatedAt: now,
      };

      const ansWithEvidence: QuestionnaireAnswer = {
        questionId: 'q_cert',
        questionCode: 'CERT-01',
        sectionId: 'sec_1',
        value: 'iso',
        attachedEvidenceIds: ['ev_cert_iso_pdf'],
        updatedAt: now,
      };

      const ansWithoutEvidence: QuestionnaireAnswer = {
        questionId: 'q_cert',
        questionCode: 'CERT-01',
        sectionId: 'sec_1',
        value: 'iso',
        attachedEvidenceIds: [],
        updatedAt: now,
      };

      const scoreBonus = evaluateQuestionScore(certEvidenceQ, ansWithEvidence);
      expect(scoreBonus.scorePercent).toBe(100); // 85 + 15 bonus = 100

      const scoreNoBonus = evaluateQuestionScore(certEvidenceQ, ansWithoutEvidence);
      expect(scoreNoBonus.scorePercent).toBe(85);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. RISK FLAGS DERIVATION
  // ---------------------------------------------------------------------------
  describe('5. Risk Flags Derivation Engine', () => {
    it('triggers risk flag when non-compliant or high-risk options are chosen', () => {
      const encryptionQ: DynamicQuestionnaireQuestion = {
        id: 'q_enc',
        tenantId: 'tenant_a',
        templateId: 'tmpl_1',
        sectionId: 'sec_1',
        code: 'TOM-ENC',
        title: 'Data Encryption at Rest',
        questionType: 'single_select',
        required: true,
        sortOrder: 1,
        scoring: { weight: 10 },
        options: [
          { label: 'AES-256 Enabled for all customer data', value: 'aes256', score: 100 },
          {
            label: 'No encryption at rest configured',
            value: 'no_encryption',
            score: 0,
            isRiskTrigger: true,
            riskCode: 'RISK_NO_ENCRYPTION_AT_REST',
            riskSeverity: 'critical',
            riskRationale: 'Processor does not implement encryption of personal data at rest.',
          },
        ],
        statutoryCitations: ['GDPR Art. 32(1)(a)', 'ISO 27001 A.8.24'],
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: now,
        updatedAt: now,
      };

      const deficientAns: QuestionnaireAnswer = {
        questionId: 'q_enc',
        questionCode: 'TOM-ENC',
        sectionId: 'sec_1',
        value: 'no_encryption',
        attachedEvidenceIds: [],
        updatedAt: now,
      };

      const flags = evaluateQuestionRiskFlags(encryptionQ, deficientAns);
      expect(flags.length).toBe(1);
      expect(flags[0]?.riskCode).toBe('RISK_NO_ENCRYPTION_AT_REST');
      expect(flags[0]?.riskSeverity).toBe('critical');
      expect(flags[0]?.statutoryCitation).toBe('GDPR Art. 32(1)(a)');
    });
  });
});
