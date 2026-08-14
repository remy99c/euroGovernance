import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  TenantScopeProfile,
  TenantScopeFact,
  ScopeProfileType,
  ScopeProfileStatus,
  ScopeFactCategory,
  ScopeFactDataType,
  QuestionResponseType,
  ScopeQuestionnaire,
  ScopeQuestion,
  TenantScopeAnswer,
  validateScopeProfile,
  validateScopeFactValue,
  calculateScopeCompleteness,
  validateScopeAnswer,
  mapAnswerToScopeFact,
  calculateQuestionnaireProgress,
  composeTenantQuestionnaire,
  CANONICAL_SCOPE_QUESTIONNAIRES,
  CANONICAL_SCOPE_QUESTIONS,
} from '@eurogovernance/shared-types';

const SCOPING_ADMIN_ROLES = [
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
] as const;

export interface CreateScopeProfileInput {
  tenantId: string;
  title: string;
  description: string;
  profileType: ScopeProfileType;
  version?: string;
  narrativeStatement?: string;
  applicableFrameworkIds?: string[];
  includedLegalEntities?: string[];
  includedBusinessUnits?: string[];
  includedLocations?: string[];
  includedJurisdictions?: string[];
  processesPersonalData?: boolean;
  processesSpecialCategoryData?: boolean;
  deploysAISystems?: boolean;
  deploysHighRiskAI?: boolean;
  hasInternationalTransfers?: boolean;
  cloudProviders?: string[];
  inScopeAssetIds?: string[];
  inScopeVendorIds?: string[];
  inScopeAISystemIds?: string[];
  inScopeRopaIds?: string[];
  excludedOperations?: string[];
  exclusionsJustification?: string;
  frameworkSpecificFacts?: Record<string, unknown>;
  reviewFrequencyDays?: number;
}

export interface UpdateScopeProfileInput {
  tenantId: string;
  profileId: string;
  title?: string;
  description?: string;
  narrativeStatement?: string;
  revisionRationale?: string;
  includedLegalEntities?: string[];
  includedBusinessUnits?: string[];
  includedLocations?: string[];
  includedJurisdictions?: string[];
  processesPersonalData?: boolean;
  processesSpecialCategoryData?: boolean;
  deploysAISystems?: boolean;
  deploysHighRiskAI?: boolean;
  hasInternationalTransfers?: boolean;
  cloudProviders?: string[];
  inScopeAssetIds?: string[];
  inScopeVendorIds?: string[];
  inScopeAISystemIds?: string[];
  inScopeRopaIds?: string[];
  excludedOperations?: string[];
  exclusionsJustification?: string;
  frameworkSpecificFacts?: Record<string, unknown>;
  status?: ScopeProfileStatus;
}

export interface ApproveScopeProfileInput {
  tenantId: string;
  profileId: string;
  approvalNotes?: string;
}

export interface RecordScopeFactInput {
  tenantId: string;
  scopeProfileId?: string | null;
  frameworkId?: string | null;
  factKey: string;
  factTitle?: string;
  category: ScopeFactCategory;
  dataType: ScopeFactDataType;
  valueBoolean?: boolean | null;
  valueString?: string | null;
  valueNumber?: number | null;
  valueArray?: string[] | null;
  source?: 'questionnaire' | 'manual_entry' | 'system_detected' | 'api_sync';
  sourceQuestionId?: string | null;
  confidence?: 'verified' | 'self_declared' | 'inferred';
  verificationEvidenceId?: string | null;
}

export interface BatchRecordScopeFactsInput {
  tenantId: string;
  facts: RecordScopeFactInput[];
}

/**
 * 1. Create a Structured Scope Profile
 */
export const createScopeProfile = onCall<CreateScopeProfileInput>(async (request) => {
  const {
    tenantId,
    title,
    description,
    profileType,
    version = '1.0',
    narrativeStatement = '',
    applicableFrameworkIds = [],
    includedLegalEntities = [],
    includedBusinessUnits = [],
    includedLocations = [],
    includedJurisdictions = [],
    processesPersonalData = false,
    processesSpecialCategoryData = false,
    deploysAISystems = false,
    deploysHighRiskAI = false,
    hasInternationalTransfers = false,
    cloudProviders = [],
    inScopeAssetIds = [],
    inScopeVendorIds = [],
    inScopeAISystemIds = [],
    inScopeRopaIds = [],
    excludedOperations = [],
    exclusionsJustification = '',
    frameworkSpecificFacts = {},
    reviewFrequencyDays = 180,
  } = request.data || {};

  if (!tenantId || !title || !profileType) {
    throw new HttpsError('invalid-argument', 'tenantId, title, and profileType are required.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...SCOPING_ADMIN_ROLES]);

  const rawProfile: Partial<TenantScopeProfile> = {
    title: title.trim(),
    description: description ? description.trim() : '',
    profileType,
    version: version.trim(),
    narrativeStatement: narrativeStatement.trim(),
    includedLegalEntities,
    includedBusinessUnits,
    includedLocations,
    includedJurisdictions,
    processesPersonalData,
    processesSpecialCategoryData,
    deploysAISystems,
    deploysHighRiskAI,
    hasInternationalTransfers,
    cloudProviders,
    inScopeAssetIds,
    inScopeVendorIds,
    inScopeAISystemIds,
    inScopeRopaIds,
    excludedOperations,
    exclusionsJustification: exclusionsJustification.trim(),
    frameworkSpecificFacts,
  };

  const validation = validateScopeProfile(rawProfile);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', validation.error || 'Scope profile validation failed.');
  }

  const completeness = calculateScopeCompleteness(rawProfile);
  const now = new Date().toISOString();
  const nextReviewDate = new Date(Date.now() + reviewFrequencyDays * 24 * 60 * 60 * 1000).toISOString();

  const profileRef = db.collection('tenants').doc(tenantId).collection('scope_profiles').doc();

  const scopeProfileDoc: TenantScopeProfile = {
    id: profileRef.id,
    tenantId,
    ownerId: authCtx.userId,
    title: rawProfile.title!,
    description: rawProfile.description!,
    profileType,
    status: 'draft',
    version: rawProfile.version!,
    revisionNumber: 1,
    revisionRationale: 'Initial scope profile creation',
    supersededProfileId: null,
    applicableFrameworkIds,
    narrativeStatement: rawProfile.narrativeStatement!,
    includedLegalEntities,
    includedBusinessUnits,
    includedLocations,
    includedJurisdictions,
    processesPersonalData,
    processesSpecialCategoryData,
    deploysAISystems,
    deploysHighRiskAI,
    hasInternationalTransfers,
    cloudProviders,
    inScopeAssetIds,
    inScopeVendorIds,
    inScopeAISystemIds,
    inScopeRopaIds,
    excludedOperations,
    exclusionsJustification: rawProfile.exclusionsJustification!,
    frameworkSpecificFacts,
    completenessPercentage: completeness.completenessPercentage,
    isComplete: completeness.isComplete,
    missingFactKeys: completeness.missingFactKeys,
    approvedBy: null,
    approvedAt: null,
    reviewFrequencyDays,
    nextReviewDate,
    createdAt: now,
    updatedAt: now,
    createdBy: authCtx.userId,
    updatedBy: authCtx.userId,
  };

  await profileRef.set(scopeProfileDoc);

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'scope_profile',
    entityId: profileRef.id,
    action: 'create',
    afterSummary: {
      title: scopeProfileDoc.title,
      profileType,
      version: scopeProfileDoc.version,
      completenessPercentage: completeness.completenessPercentage,
    },
    source: 'cloud_function',
    workflowContext: `Created scope profile '${scopeProfileDoc.title}' (${profileType})`,
  });

  return { success: true, profileId: profileRef.id, scopeProfile: scopeProfileDoc };
});

/**
 * 2. Update a Scope Profile
 */
export const updateScopeProfile = onCall<UpdateScopeProfileInput>(async (request) => {
  const { tenantId, profileId, ...updates } = request.data || {};

  if (!tenantId || !profileId) {
    throw new HttpsError('invalid-argument', 'tenantId and profileId are required.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...SCOPING_ADMIN_ROLES]);

  const profileRef = db.collection('tenants').doc(tenantId).collection('scope_profiles').doc(profileId);
  const snap = await profileRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Scope profile '${profileId}' not found.`);
  }

  const prev = snap.data() as TenantScopeProfile;
  const merged: Partial<TenantScopeProfile> = {
    ...prev,
    ...updates,
  };

  const completeness = calculateScopeCompleteness(merged);
  const now = new Date().toISOString();

  const payload: Partial<TenantScopeProfile> = {
    ...updates,
    revisionNumber: (prev.revisionNumber || 1) + 1,
    completenessPercentage: completeness.completenessPercentage,
    isComplete: completeness.isComplete,
    missingFactKeys: completeness.missingFactKeys,
    updatedAt: now,
    updatedBy: authCtx.userId,
  };

  await profileRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'scope_profile',
    entityId: profileId,
    action: 'update',
    beforeSummary: prev as any,
    afterSummary: payload as any,
    source: 'cloud_function',
    workflowContext: `Updated scope profile '${prev.title}' (Revision ${payload.revisionNumber})`,
  });

  return { success: true, profileId, updatedProfile: { ...prev, ...payload } };
});

/**
 * 3. Approve a Scope Profile
 */
export const approveScopeProfile = onCall<ApproveScopeProfileInput>(async (request) => {
  const { tenantId, profileId, approvalNotes = '' } = request.data || {};

  if (!tenantId || !profileId) {
    throw new HttpsError('invalid-argument', 'tenantId and profileId are required.');
  }

  const authCtx = await requireTenantMember(request, tenantId, ['tenant_admin', 'compliance_manager']);

  const profileRef = db.collection('tenants').doc(tenantId).collection('scope_profiles').doc(profileId);
  const snap = await profileRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Scope profile '${profileId}' not found.`);
  }

  const prev = snap.data() as TenantScopeProfile;
  const now = new Date().toISOString();

  const payload: Partial<TenantScopeProfile> = {
    status: 'approved',
    approvedBy: authCtx.userId,
    approvedAt: now,
    updatedAt: now,
    updatedBy: authCtx.userId,
  };

  await profileRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'scope_profile',
    entityId: profileId,
    action: 'status_transition',
    beforeSummary: { status: prev.status },
    afterSummary: { status: 'approved', approvedBy: authCtx.userId, approvedAt: now, approvalNotes },
    source: 'cloud_function',
    workflowContext: `Approved scope profile '${prev.title}'`,
  });

  return { success: true, profileId, status: 'approved' };
});

/**
 * 4. Record a Single Scope Fact
 */
export const recordScopeFact = onCall<RecordScopeFactInput>(async (request) => {
  const {
    tenantId,
    scopeProfileId = null,
    frameworkId = null,
    factKey,
    factTitle,
    category,
    dataType,
    valueBoolean = null,
    valueString = null,
    valueNumber = null,
    valueArray = null,
    source = 'manual_entry',
    sourceQuestionId = null,
    confidence = 'verified',
    verificationEvidenceId = null,
  } = request.data || {};

  if (!tenantId || !factKey || !category || !dataType) {
    throw new HttpsError('invalid-argument', 'tenantId, factKey, category, and dataType are required.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [
    ...SCOPING_ADMIN_ROLES,
    'contributor',
  ]);

  const rawFact: Partial<TenantScopeFact> = {
    factKey: factKey.trim(),
    dataType,
    valueBoolean,
    valueString,
    valueNumber,
    valueArray,
  };

  const validation = validateScopeFactValue(rawFact);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', validation.error || 'Scope fact value validation failed.');
  }

  const now = new Date().toISOString();
  const factRef = db.collection('tenants').doc(tenantId).collection('scope_facts').doc(factKey.trim());
  const existingSnap = await factRef.get();

  const factDoc: TenantScopeFact = {
    id: factKey.trim(),
    tenantId,
    ownerId: authCtx.userId,
    scopeProfileId,
    frameworkId,
    factKey: factKey.trim(),
    factTitle: factTitle ? factTitle.trim() : factKey.trim(),
    category,
    dataType,
    valueBoolean,
    valueString,
    valueNumber,
    valueArray,
    source,
    sourceQuestionId,
    confidence,
    verificationEvidenceId,
    assessedBy: authCtx.userId,
    assessedAt: now,
    status: 'active',
    createdAt: existingSnap.exists ? (existingSnap.data()?.createdAt || now) : now,
    updatedAt: now,
    createdBy: existingSnap.exists ? (existingSnap.data()?.createdBy || authCtx.userId) : authCtx.userId,
    updatedBy: authCtx.userId,
  };

  await factRef.set(factDoc, { merge: true });

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'scope_fact',
    entityId: factKey.trim(),
    action: existingSnap.exists ? 'update' : 'create',
    afterSummary: {
      factKey,
      category,
      dataType,
      value: valueBoolean ?? valueString ?? valueNumber ?? valueArray,
    },
    source: 'cloud_function',
    workflowContext: `Recorded scope fact '${factKey}'`,
  });

  return { success: true, fact: factDoc };
});

/**
 * 5. Batch Record Scope Facts
 */
export const batchRecordScopeFacts = onCall<BatchRecordScopeFactsInput>(async (request) => {
  const { tenantId, facts } = request.data || {};

  if (!tenantId || !Array.isArray(facts) || facts.length === 0) {
    throw new HttpsError('invalid-argument', 'tenantId and non-empty facts array are required.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [
    ...SCOPING_ADMIN_ROLES,
    'contributor',
  ]);

  const batch = db.batch();
  const now = new Date().toISOString();

  for (const item of facts) {
    const rawFact: Partial<TenantScopeFact> = {
      factKey: item.factKey.trim(),
      dataType: item.dataType,
      valueBoolean: item.valueBoolean ?? null,
      valueString: item.valueString ?? null,
      valueNumber: item.valueNumber ?? null,
      valueArray: item.valueArray ?? null,
    };

    const validation = validateScopeFactValue(rawFact);
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', `Fact '${item.factKey}': ${validation.error}`);
    }

    const ref = db.collection('tenants').doc(tenantId).collection('scope_facts').doc(item.factKey.trim());
    const factDoc: TenantScopeFact = {
      id: item.factKey.trim(),
      tenantId,
      ownerId: authCtx.userId,
      scopeProfileId: item.scopeProfileId || null,
      frameworkId: item.frameworkId || null,
      factKey: item.factKey.trim(),
      factTitle: item.factTitle ? item.factTitle.trim() : item.factKey.trim(),
      category: item.category,
      dataType: item.dataType,
      valueBoolean: item.valueBoolean ?? null,
      valueString: item.valueString ?? null,
      valueNumber: item.valueNumber ?? null,
      valueArray: item.valueArray ?? null,
      source: item.source || 'questionnaire',
      sourceQuestionId: item.sourceQuestionId || null,
      confidence: item.confidence || 'verified',
      verificationEvidenceId: item.verificationEvidenceId || null,
      assessedBy: authCtx.userId,
      assessedAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: authCtx.userId,
      updatedBy: authCtx.userId,
    };

    batch.set(ref, factDoc, { merge: true });
  }

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'scope_fact',
    entityId: 'batch',
    action: 'create',
    afterSummary: { factsRecorded: facts.length },
    source: 'cloud_function',
    workflowContext: `Batch recorded ${facts.length} scope facts`,
  });

  return { success: true, count: facts.length };
});

/**
 * 6. List Tenant Scope Profiles
 */
export const listTenantScopeProfiles = onCall(async (request) => {
  const { tenantId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  const snap = await db.collection('tenants').doc(tenantId).collection('scope_profiles').get();
  const profiles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { profiles };
});

/**
 * 7. List Tenant Scope Facts
 */
export const listTenantScopeFacts = onCall(async (request) => {
  const { tenantId, category } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('scope_facts') as FirebaseFirestore.Query;
  if (category) {
    q = q.where('category', '==', category);
  }

  const snap = await q.get();
  const facts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { facts };
});

export interface SaveScopeAnswerItem {
  questionnaireId: string;
  questionId: string;
  factKey: string;
  responseType: QuestionResponseType;
  answerBoolean?: boolean | null;
  answerString?: string | null;
  answerNumber?: number | null;
  answerArray?: string[] | null;
  notes?: string;
}

export interface SaveScopeAnswersInput {
  tenantId: string;
  answers: SaveScopeAnswerItem[];
  updateScopeFacts?: boolean;
}

export interface GetComposedScopeQuestionnaireInput {
  tenantId: string;
  frameworkIds?: string[];
}

/**
 * 8. Get Composed Multi-Framework Scope Questionnaire
 */
export const getComposedScopeQuestionnaire = onCall<GetComposedScopeQuestionnaireInput>(async (request) => {
  const { tenantId, frameworkIds } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let targetFrameworkIds = frameworkIds;
  if (!targetFrameworkIds || targetFrameworkIds.length === 0) {
    const adoptedSnap = await db.collection('tenants').doc(tenantId).collection('adopted_frameworks').get();
    targetFrameworkIds = adoptedSnap.docs
      .filter((d) => d.data()?.status !== 'retired')
      .map((d) => d.id);
  }

  // Fetch questionnaires & questions from Firestore or fall back to canonical master
  const qnrSnap = await db.collection('scope_questionnaires').get();
  let questionnaires: ScopeQuestionnaire[] = [];
  let questions: ScopeQuestion[] = [];

  if (!qnrSnap.empty) {
    questionnaires = qnrSnap.docs.map((d) => d.data() as ScopeQuestionnaire);
    for (const qnrDoc of qnrSnap.docs) {
      const qSnap = await qnrDoc.ref.collection('questions').get();
      questions.push(...qSnap.docs.map((qd) => qd.data() as ScopeQuestion));
    }
  } else {
    questionnaires = CANONICAL_SCOPE_QUESTIONNAIRES;
    questions = CANONICAL_SCOPE_QUESTIONS;
  }

  const composed = composeTenantQuestionnaire(targetFrameworkIds, questionnaires, questions);
  return { composedQuestionnaire: composed };
});

/**
 * 9. Save / Update Tenant Scope Answers and Map to Scope Facts
 */
export const saveScopeAnswers = onCall<SaveScopeAnswersInput>(async (request) => {
  const { tenantId, answers, updateScopeFacts = true } = request.data || {};

  if (!tenantId || !Array.isArray(answers) || answers.length === 0) {
    throw new HttpsError('invalid-argument', 'tenantId and non-empty answers array are required.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [
    ...SCOPING_ADMIN_ROLES,
    'contributor',
  ]);

  // Fetch canonical questions for validation and mapping
  const qMap = new Map<string, ScopeQuestion>();
  for (const q of CANONICAL_SCOPE_QUESTIONS) {
    qMap.set(q.id, q);
  }

  const batch = db.batch();
  const now = new Date().toISOString();

  for (const item of answers) {
    const question = qMap.get(item.questionId);
    if (!question) {
      throw new HttpsError('not-found', `Question '${item.questionId}' not found.`);
    }

    const answerPayload: TenantScopeAnswer = {
      id: item.questionId,
      tenantId,
      ownerId: authCtx.userId,
      questionnaireId: item.questionnaireId || question.questionnaireId,
      questionId: item.questionId,
      factKey: item.factKey || question.factKey,
      responseType: item.responseType || question.responseType,
      answerBoolean: item.answerBoolean ?? null,
      answerString: item.answerString ?? null,
      answerNumber: item.answerNumber ?? null,
      answerArray: item.answerArray ?? null,
      notes: item.notes || '',
      answeredBy: authCtx.userId,
      answeredAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: authCtx.userId,
      updatedBy: authCtx.userId,
    };

    const validation = validateScopeAnswer(question, answerPayload);
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', `Question '${item.questionId}': ${validation.error}`);
    }

    // Save answer
    const ansRef = db.collection('tenants').doc(tenantId).collection('scope_answers').doc(item.questionId);
    batch.set(ansRef, answerPayload, { merge: true });

    // Map and save scope fact
    if (updateScopeFacts) {
      const factDoc = mapAnswerToScopeFact(tenantId, question, answerPayload, authCtx.userId);
      const factRef = db.collection('tenants').doc(tenantId).collection('scope_facts').doc(factDoc.factKey);
      batch.set(factRef, factDoc, { merge: true });
    }
  }

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'scope_answer',
    entityId: 'batch',
    action: 'update',
    afterSummary: { answersSubmitted: answers.length, updateScopeFacts },
    source: 'cloud_function',
    workflowContext: `Submitted ${answers.length} scope answers and synchronized scope facts`,
  });

  return { success: true, count: answers.length };
});

/**
 * 10. List Tenant Scope Answers
 */
export const listTenantScopeAnswers = onCall(async (request) => {
  const { tenantId, questionnaireId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('scope_answers') as FirebaseFirestore.Query;
  if (questionnaireId) {
    q = q.where('questionnaireId', '==', questionnaireId);
  }

  const snap = await q.get();
  const answers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { answers };
});

/**
 * 11. Get Scope Questionnaire Progress
 */
export const getScopeQuestionnaireProgress = onCall(async (request) => {
  const { tenantId, frameworkIds } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let targetFrameworkIds = frameworkIds;
  if (!targetFrameworkIds || targetFrameworkIds.length === 0) {
    const adoptedSnap = await db.collection('tenants').doc(tenantId).collection('adopted_frameworks').get();
    targetFrameworkIds = adoptedSnap.docs
      .filter((d) => d.data()?.status !== 'retired')
      .map((d) => d.id);
  }

  const composed = composeTenantQuestionnaire(
    targetFrameworkIds,
    CANONICAL_SCOPE_QUESTIONNAIRES,
    CANONICAL_SCOPE_QUESTIONS
  );

  const allComposedQuestions: ScopeQuestion[] = [];
  for (const s of composed.sections) {
    allComposedQuestions.push(...s.questions);
  }

  const answersSnap = await db.collection('tenants').doc(tenantId).collection('scope_answers').get();
  const answersMap: Record<string, Partial<TenantScopeAnswer>> = {};
  for (const doc of answersSnap.docs) {
    answersMap[doc.id] = doc.data() as TenantScopeAnswer;
  }

  const progress = calculateQuestionnaireProgress(allComposedQuestions, answersMap);
  return { progress, composedQuestionnaire: composed };
});
