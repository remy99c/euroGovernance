import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  Certification,
  CertificationType,
  CertificationStatus,
  ContinuousComplianceStatus,
  CertificationScope,
  evaluateCertificationCompleteness,
  evaluateCertificationRiskFlags,
  Evidence,
} from '@eurogovernance/shared-types';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';

export interface CreateCertificationInput {
  tenantId: string;
  certificationName: string;
  certificationType: CertificationType;
  issuingBody: string;
  certificateNumber: string;
  scopeDescription: string;
  scopeDetails?: CertificationScope;
  applicableStandardVersion: string;
  issueDate: string;
  expiryDate: string;
  status?: CertificationStatus;
  surveillanceAuditDueDate?: string | null;
  leadAuditorName?: string | null;
  leadAuditorContact?: string | null;
  frameworkIds?: string[];
  linkedControlIds?: string[];
  linkedEvidenceIds?: string[];
  linkedVendorIds?: string[];
  linkedProcessorProfileIds?: string[];
  linkedSystemAssetIds?: string[];
  continuousComplianceStatus?: ContinuousComplianceStatus;
  unresolvedFindingsCount?: number;
  notes?: string | null;
}

export interface UpdateCertificationInput {
  tenantId: string;
  certificationId: string;
  certificationName?: string;
  certificationType?: CertificationType;
  issuingBody?: string;
  certificateNumber?: string;
  scopeDescription?: string;
  scopeDetails?: CertificationScope;
  applicableStandardVersion?: string;
  issueDate?: string;
  expiryDate?: string;
  status?: CertificationStatus;
  surveillanceAuditDueDate?: string | null;
  leadAuditorName?: string | null;
  leadAuditorContact?: string | null;
  frameworkIds?: string[];
  linkedControlIds?: string[];
  linkedEvidenceIds?: string[];
  linkedVendorIds?: string[];
  linkedProcessorProfileIds?: string[];
  linkedSystemAssetIds?: string[];
  continuousComplianceStatus?: ContinuousComplianceStatus;
  unresolvedFindingsCount?: number;
  notes?: string | null;
}

export interface DeleteCertificationInput {
  tenantId: string;
  certificationId: string;
}

export interface ListCertificationsInput {
  tenantId: string;
  certificationType?: CertificationType;
  status?: CertificationStatus;
}

export interface LinkEvidenceToCertificationInput {
  tenantId: string;
  certificationId: string;
  evidenceId: string;
}

export interface GetCertificationCompletenessInput {
  tenantId: string;
  certificationId: string;
}

/**
 * 1. Create Structured Certification Record
 */
export const createTenantCertification = onCall<CreateCertificationInput>(async (request) => {
  const { data } = request;
  if (!data.tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  const authContext = await requireTenantMember(request, data.tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  if (!data.certificationName?.trim()) {
    throw new HttpsError('invalid-argument', 'Certification name is required.');
  }
  if (!data.certificationType) {
    throw new HttpsError('invalid-argument', 'Certification type is required.');
  }
  if (!data.issuingBody?.trim()) {
    throw new HttpsError('invalid-argument', 'Issuing body / registrar is required.');
  }
  if (!data.certificateNumber?.trim()) {
    throw new HttpsError('invalid-argument', 'Certificate number / identifier is required.');
  }
  if (!data.issueDate || !data.expiryDate) {
    throw new HttpsError('invalid-argument', 'Issue date and expiry date are required.');
  }

  const certRef = db.collection(`tenants/${data.tenantId}/certifications`).doc();
  const now = new Date().toISOString();

  const newCert: Certification = {
    id: certRef.id,
    tenantId: data.tenantId,
    certificationName: data.certificationName.trim(),
    certificationType: data.certificationType,
    issuingBody: data.issuingBody.trim(),
    certificateNumber: data.certificateNumber.trim(),
    scopeDescription: data.scopeDescription?.trim() || '',
    scopeDetails: data.scopeDetails || {
      sites: [],
      products: [],
      cloudEnvironments: [],
      organizationalUnits: [],
    },
    applicableStandardVersion: data.applicableStandardVersion?.trim() || '2022',
    issueDate: data.issueDate,
    expiryDate: data.expiryDate,
    status: data.status || 'active_valid',
    surveillanceAuditDueDate: data.surveillanceAuditDueDate || null,
    leadAuditorName: data.leadAuditorName?.trim() || null,
    leadAuditorContact: data.leadAuditorContact?.trim() || null,
    frameworkIds: data.frameworkIds || [],
    linkedControlIds: data.linkedControlIds || [],
    linkedEvidenceIds: data.linkedEvidenceIds || [],
    linkedVendorIds: data.linkedVendorIds || [],
    linkedProcessorProfileIds: data.linkedProcessorProfileIds || [],
    linkedSystemAssetIds: data.linkedSystemAssetIds || [],
    continuousComplianceStatus: data.continuousComplianceStatus || 'compliant',
    unresolvedFindingsCount: data.unresolvedFindingsCount ?? 0,
    notes: data.notes?.trim() || null,
    ownerId: authContext.userId,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
    createdAt: now,
    updatedAt: now,
  };

  await certRef.set(newCert);

  await recordAuditLog({
    tenantId: data.tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'create',
    entityType: 'certification',
    entityId: certRef.id,
    beforeSummary: null,
    afterSummary: {
      certificationName: newCert.certificationName,
      certificationType: newCert.certificationType,
      issuingBody: newCert.issuingBody,
      certificateNumber: newCert.certificateNumber,
    },
    source: 'cloud_function',
    workflowContext: 'certification_created',
  });

  return { success: true, certificationId: certRef.id, certification: newCert };
});

/**
 * 2. Update Structured Certification Record
 */
export const updateTenantCertification = onCall<UpdateCertificationInput>(async (request) => {
  const { data } = request;
  if (!data.tenantId || !data.certificationId?.trim()) {
    throw new HttpsError('invalid-argument', 'tenantId and certificationId are required.');
  }

  const authContext = await requireTenantMember(request, data.tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'approver',
  ]);

  const certRef = db.doc(`tenants/${data.tenantId}/certifications/${data.certificationId}`);
  const snap = await certRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Certification "${data.certificationId}" does not exist.`);
  }

  const before = snap.data() as Certification;
  const now = new Date().toISOString();

  const updates: Partial<Certification> = {
    updatedBy: authContext.userId,
    updatedAt: now,
  };

  if (data.certificationName !== undefined) updates.certificationName = data.certificationName.trim();
  if (data.certificationType !== undefined) updates.certificationType = data.certificationType;
  if (data.issuingBody !== undefined) updates.issuingBody = data.issuingBody.trim();
  if (data.certificateNumber !== undefined) updates.certificateNumber = data.certificateNumber.trim();
  if (data.scopeDescription !== undefined) updates.scopeDescription = data.scopeDescription.trim();
  if (data.scopeDetails !== undefined) updates.scopeDetails = data.scopeDetails;
  if (data.applicableStandardVersion !== undefined) updates.applicableStandardVersion = data.applicableStandardVersion.trim();
  if (data.issueDate !== undefined) updates.issueDate = data.issueDate;
  if (data.expiryDate !== undefined) updates.expiryDate = data.expiryDate;
  if (data.status !== undefined) updates.status = data.status;
  if (data.surveillanceAuditDueDate !== undefined) updates.surveillanceAuditDueDate = data.surveillanceAuditDueDate;
  if (data.leadAuditorName !== undefined) updates.leadAuditorName = data.leadAuditorName?.trim() || null;
  if (data.leadAuditorContact !== undefined) updates.leadAuditorContact = data.leadAuditorContact?.trim() || null;
  if (data.frameworkIds !== undefined) updates.frameworkIds = data.frameworkIds;
  if (data.linkedControlIds !== undefined) updates.linkedControlIds = data.linkedControlIds;
  if (data.linkedEvidenceIds !== undefined) updates.linkedEvidenceIds = data.linkedEvidenceIds;
  if (data.linkedVendorIds !== undefined) updates.linkedVendorIds = data.linkedVendorIds;
  if (data.linkedProcessorProfileIds !== undefined) updates.linkedProcessorProfileIds = data.linkedProcessorProfileIds;
  if (data.linkedSystemAssetIds !== undefined) updates.linkedSystemAssetIds = data.linkedSystemAssetIds;
  if (data.continuousComplianceStatus !== undefined) updates.continuousComplianceStatus = data.continuousComplianceStatus;
  if (data.unresolvedFindingsCount !== undefined) updates.unresolvedFindingsCount = data.unresolvedFindingsCount;
  if (data.notes !== undefined) updates.notes = data.notes?.trim() || null;

  await certRef.update(updates);
  const after = { ...before, ...updates };

  await recordAuditLog({
    tenantId: data.tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'update',
    entityType: 'certification',
    entityId: data.certificationId,
    beforeSummary: {
      certificationName: before.certificationName,
      status: before.status,
    },
    afterSummary: {
      certificationName: after.certificationName,
      status: after.status,
    },
    source: 'cloud_function',
    workflowContext: 'certification_updated',
  });

  return { success: true, certification: after };
});

/**
 * 3. Delete Structured Certification Record
 */
export const deleteTenantCertification = onCall<DeleteCertificationInput>(async (request) => {
  const { data } = request;
  if (!data.tenantId || !data.certificationId?.trim()) {
    throw new HttpsError('invalid-argument', 'tenantId and certificationId are required.');
  }

  const authContext = await requireTenantMember(request, data.tenantId, ['tenant_admin', 'compliance_manager']);

  const certRef = db.doc(`tenants/${data.tenantId}/certifications/${data.certificationId}`);
  const snap = await certRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Certification "${data.certificationId}" does not exist.`);
  }

  const before = snap.data() as Certification;
  await certRef.delete();

  await recordAuditLog({
    tenantId: data.tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'delete',
    entityType: 'certification',
    entityId: data.certificationId,
    beforeSummary: {
      certificationName: before.certificationName,
      certificateNumber: before.certificateNumber,
    },
    afterSummary: null,
    source: 'cloud_function',
    workflowContext: 'certification_deleted',
  });

  return { success: true, deletedId: data.certificationId };
});

/**
 * 4. List Tenant Certifications
 */
export const listTenantCertifications = onCall<ListCertificationsInput>(async (request) => {
  const { data } = request;
  if (!data.tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, data.tenantId);

  let query: FirebaseFirestore.Query = db.collection(`tenants/${data.tenantId}/certifications`);

  if (data.certificationType) {
    query = query.where('certificationType', '==', data.certificationType);
  }
  if (data.status) {
    query = query.where('status', '==', data.status);
  }

  const snap = await query.get();
  const certifications = snap.docs.map((d) => d.data() as Certification);

  return { certifications };
});

/**
 * 5. Link Evidence to Certification
 */
export const linkEvidenceToCertification = onCall<LinkEvidenceToCertificationInput>(async (request) => {
  const { data } = request;
  if (!data.tenantId || !data.certificationId?.trim() || !data.evidenceId?.trim()) {
    throw new HttpsError('invalid-argument', 'tenantId, certificationId, and evidenceId are required.');
  }

  const authContext = await requireTenantMember(request, data.tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const certRef = db.doc(`tenants/${data.tenantId}/certifications/${data.certificationId}`);
  const evRef = db.doc(`tenants/${data.tenantId}/evidence/${data.evidenceId}`);

  const [certSnap, evSnap] = await Promise.all([certRef.get(), evRef.get()]);

  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Certification "${data.certificationId}" not found.`);
  }
  if (!evSnap.exists) {
    throw new HttpsError('not-found', `Evidence "${data.evidenceId}" not found.`);
  }

  const now = new Date().toISOString();

  await Promise.all([
    certRef.update({
      linkedEvidenceIds: FieldValue.arrayUnion(data.evidenceId),
      updatedBy: authContext.userId,
      updatedAt: now,
    }),
    evRef.update({
      certificationIds: FieldValue.arrayUnion(data.certificationId),
      updatedBy: authContext.userId,
      updatedAt: now,
    }),
  ]);

  await recordAuditLog({
    tenantId: data.tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'link',
    entityType: 'certification',
    entityId: data.certificationId,
    beforeSummary: null,
    afterSummary: {
      linkedEvidenceId: data.evidenceId,
    },
    source: 'cloud_function',
    workflowContext: 'certification_evidence_linked',
  });

  return { success: true, certificationId: data.certificationId, evidenceId: data.evidenceId };
});

/**
 * 6. Get Certification Completeness & Gap Summary
 */
export const getCertificationCompletenessSummary = onCall<GetCertificationCompletenessInput>(async (request) => {
  const { data } = request;
  if (!data.tenantId || !data.certificationId?.trim()) {
    throw new HttpsError('invalid-argument', 'tenantId and certificationId are required.');
  }

  await requireTenantMember(request, data.tenantId);

  const certSnap = await db.doc(`tenants/${data.tenantId}/certifications/${data.certificationId}`).get();
  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Certification "${data.certificationId}" not found.`);
  }

  const cert = certSnap.data() as Certification;
  const evSnap = await db.collection(`tenants/${data.tenantId}/evidence`).get();
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);

  const completeness = evaluateCertificationCompleteness(cert, evidenceDocs);

  return { completeness };
});

/**
 * 7. Get Tenant Certification Risk Dashboard
 */
export const getTenantCertificationRiskDashboard = onCall<{ tenantId: string }>(async (request) => {
  const { data } = request;
  if (!data.tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, data.tenantId);

  const [certSnap, evSnap] = await Promise.all([
    db.collection(`tenants/${data.tenantId}/certifications`).get(),
    db.collection(`tenants/${data.tenantId}/evidence`).get(),
  ]);

  const certifications = certSnap.docs.map((d) => d.data() as Certification);
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);

  const riskSummary = evaluateCertificationRiskFlags(certifications, evidenceDocs);

  return { riskSummary };
});
