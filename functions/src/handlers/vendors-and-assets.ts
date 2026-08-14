import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Vendor,
  VendorRiskTier,
  SystemAsset,
  SystemCriticality,
  ProcessorProfile,
  ProcessorRole,
  ProcessorCriticality,
  ProcessorReviewCadence,
  ProcessorStatus,
  validateProcessorProfile,
  computeNextReviewDate,
  TransferArrangement,
  TransferScopeType,
  TransferMechanismType,
  TransferMechanismStatus,
  EEATransferStatus,
  validateTransferArrangement,
} from '@eurogovernance/shared-types';

export interface CreateVendorInput {
  tenantId: string;
  name: string;
  category: 'cloud_provider' | 'saas_service' | 'ai_model_provider' | 'subprocessor' | 'consultancy';
  riskTier: VendorRiskTier;
  primaryContactName: string;
  primaryContactEmail: string;
  dpaSigned?: boolean;
  dpaDate?: string | null;
  securityAssessmentDate?: string | null;
  nextAssessmentDueDate?: string | null;
  countryOfIncorporation: string;
  dataHostingRegions?: string[];
  subprocessorsListed?: string[];
  ownerId?: string;
  status?: string;
}

export interface UpdateVendorInput {
  tenantId: string;
  vendorId: string;
  name?: string;
  category?: 'cloud_provider' | 'saas_service' | 'ai_model_provider' | 'subprocessor' | 'consultancy';
  riskTier?: VendorRiskTier;
  primaryContactName?: string;
  primaryContactEmail?: string;
  dpaSigned?: boolean;
  dpaDate?: string | null;
  securityAssessmentDate?: string | null;
  nextAssessmentDueDate?: string | null;
  countryOfIncorporation?: string;
  dataHostingRegions?: string[];
  subprocessorsListed?: string[];
  status?: string;
  ownerId?: string;
}

export interface DeleteVendorInput {
  tenantId: string;
  vendorId: string;
}

export interface ListVendorsInput {
  tenantId: string;
  category?: string;
  riskTier?: VendorRiskTier;
  dpaSigned?: boolean;
}

export interface CreateSystemAssetInput {
  tenantId: string;
  name: string;
  assetType: 'cloud_infrastructure' | 'internal_software' | 'database' | 'ai_model' | 'endpoint' | 'network';
  criticality: SystemCriticality;
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted_personal';
  hostingLocation: string;
  vendorId?: string | null;
  containsPersonalData?: boolean;
  containsSpecialCategoryData?: boolean;
  containsTrainingData?: boolean;
  ownerId?: string;
  status?: string;
}

export interface UpdateSystemAssetInput {
  tenantId: string;
  assetId: string;
  name?: string;
  assetType?: 'cloud_infrastructure' | 'internal_software' | 'database' | 'ai_model' | 'endpoint' | 'network';
  criticality?: SystemCriticality;
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted_personal';
  hostingLocation?: string;
  vendorId?: string | null;
  containsPersonalData?: boolean;
  containsSpecialCategoryData?: boolean;
  containsTrainingData?: boolean;
  status?: string;
  ownerId?: string;
}

export interface DeleteSystemAssetInput {
  tenantId: string;
  assetId: string;
}

export interface ListSystemAssetsInput {
  tenantId: string;
  assetType?: string;
  criticality?: SystemCriticality;
  dataClassification?: string;
  vendorId?: string;
  containsPersonalData?: boolean;
}

// -----------------------------------------------------------------------------
// VENDORS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantVendor = onCall<CreateVendorInput>(async (request) => {
  const {
    tenantId,
    name,
    category,
    riskTier,
    primaryContactName,
    primaryContactEmail,
    dpaSigned = false,
    dpaDate = null,
    securityAssessmentDate = null,
    nextAssessmentDueDate = null,
    countryOfIncorporation,
    dataHostingRegions = ['europe-west3'],
    subprocessorsListed = [],
    ownerId,
    status = 'active',
  } = request.data;

  if (!tenantId || !name || !category || !riskTier || !primaryContactEmail || !countryOfIncorporation) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, name, category, riskTier, primaryContactEmail, and countryOfIncorporation are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const vendorRef = db.collection('tenants').doc(tenantId).collection('vendors').doc();
  const now = new Date().toISOString();

  const vendorDoc: Vendor = {
    id: vendorRef.id,
    tenantId,
    name: name.trim(),
    category,
    riskTier,
    primaryContactName: primaryContactName.trim(),
    primaryContactEmail: primaryContactEmail.trim().toLowerCase(),
    dpaSigned,
    dpaDate,
    securityAssessmentDate,
    nextAssessmentDueDate,
    countryOfIncorporation: countryOfIncorporation.trim().toUpperCase(),
    dataHostingRegions,
    subprocessorsListed,
    status,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await vendorRef.set(vendorDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'vendor',
    entityId: vendorRef.id,
    action: 'create',
    afterSummary: { name: vendorDoc.name, category, riskTier, dpaSigned },
    source: 'cloud_function',
    workflowContext: 'vendor_onboarding',
  });

  return { success: true, vendorId: vendorRef.id, vendor: vendorDoc };
});

export const updateTenantVendor = onCall<UpdateVendorInput>(async (request) => {
  const { tenantId, vendorId, ...updates } = request.data;
  if (!tenantId || !vendorId) {
    throw new HttpsError('invalid-argument', 'tenantId and vendorId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const vendorRef = db.collection('tenants').doc(tenantId).collection('vendors').doc(vendorId);
  const snap = await vendorRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Vendor not found.');
  }

  const prev = snap.data() as Vendor;
  const now = new Date().toISOString();

  const payload: Partial<Vendor> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await vendorRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'vendor',
    entityId: vendorId,
    action: 'update',
    beforeSummary: { riskTier: prev.riskTier, dpaSigned: prev.dpaSigned },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'vendor_update',
  });

  return { success: true, vendorId, updatedFields: payload };
});

export const deleteTenantVendor = onCall<DeleteVendorInput>(async (request) => {
  const { tenantId, vendorId } = request.data;
  if (!tenantId || !vendorId) {
    throw new HttpsError('invalid-argument', 'tenantId and vendorId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const vendorRef = db.collection('tenants').doc(tenantId).collection('vendors').doc(vendorId);
  const snap = await vendorRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Vendor not found.');
  }

  const prev = snap.data() as Vendor;
  await vendorRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'vendor',
    entityId: vendorId,
    action: 'delete',
    beforeSummary: { name: prev.name, category: prev.category },
    source: 'cloud_function',
    workflowContext: 'vendor_deletion',
  });

  return { success: true, vendorId, deleted: true };
});

export const listTenantVendors = onCall<ListVendorsInput>(async (request) => {
  const { tenantId, category, riskTier, dpaSigned } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('vendors');
  if (category) query = query.where('category', '==', category);
  if (riskTier) query = query.where('riskTier', '==', riskTier);
  if (dpaSigned !== undefined) query = query.where('dpaSigned', '==', dpaSigned);

  const snap = await query.get();
  const vendors: Vendor[] = snap.docs.map((d) => d.data() as Vendor);

  return { success: true, count: vendors.length, vendors };
});

// -----------------------------------------------------------------------------
// SYSTEM ASSETS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantSystemAsset = onCall<CreateSystemAssetInput>(async (request) => {
  const {
    tenantId,
    name,
    assetType,
    criticality,
    dataClassification,
    hostingLocation,
    vendorId = null,
    containsPersonalData = false,
    containsSpecialCategoryData = false,
    containsTrainingData = false,
    ownerId,
    status = 'active',
  } = request.data;

  if (!tenantId || !name || !assetType || !criticality || !dataClassification || !hostingLocation) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, name, assetType, criticality, dataClassification, and hostingLocation are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const assetRef = db.collection('tenants').doc(tenantId).collection('system_assets').doc();
  const now = new Date().toISOString();

  const assetDoc: SystemAsset = {
    id: assetRef.id,
    tenantId,
    name: name.trim(),
    assetType,
    criticality,
    dataClassification,
    hostingLocation: hostingLocation.trim(),
    vendorId,
    containsPersonalData,
    containsSpecialCategoryData,
    containsTrainingData,
    status,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await assetRef.set(assetDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'system_asset',
    entityId: assetRef.id,
    action: 'create',
    afterSummary: { name: assetDoc.name, assetType, criticality, dataClassification, vendorId },
    source: 'cloud_function',
    workflowContext: 'asset_registration',
  });

  return { success: true, assetId: assetRef.id, asset: assetDoc };
});

export const updateTenantSystemAsset = onCall<UpdateSystemAssetInput>(async (request) => {
  const { tenantId, assetId, ...updates } = request.data;
  if (!tenantId || !assetId) {
    throw new HttpsError('invalid-argument', 'tenantId and assetId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const assetRef = db.collection('tenants').doc(tenantId).collection('system_assets').doc(assetId);
  const snap = await assetRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'System asset not found.');
  }

  const prev = snap.data() as SystemAsset;
  const now = new Date().toISOString();

  const payload: Partial<SystemAsset> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await assetRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'system_asset',
    entityId: assetId,
    action: 'update',
    beforeSummary: { criticality: prev.criticality, dataClassification: prev.dataClassification },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'asset_update',
  });

  return { success: true, assetId, updatedFields: payload };
});

export const deleteTenantSystemAsset = onCall<DeleteSystemAssetInput>(async (request) => {
  const { tenantId, assetId } = request.data;
  if (!tenantId || !assetId) {
    throw new HttpsError('invalid-argument', 'tenantId and assetId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const assetRef = db.collection('tenants').doc(tenantId).collection('system_assets').doc(assetId);
  const snap = await assetRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'System asset not found.');
  }

  const prev = snap.data() as SystemAsset;
  await assetRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'system_asset',
    entityId: assetId,
    action: 'delete',
    beforeSummary: { name: prev.name, assetType: prev.assetType },
    source: 'cloud_function',
    workflowContext: 'asset_deletion',
  });

  return { success: true, assetId, deleted: true };
});

export const listTenantSystemAssets = onCall<ListSystemAssetsInput>(async (request) => {
  const { tenantId, assetType, criticality, dataClassification, vendorId, containsPersonalData } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('system_assets');
  if (assetType) query = query.where('assetType', '==', assetType);
  if (criticality) query = query.where('criticality', '==', criticality);
  if (dataClassification) query = query.where('dataClassification', '==', dataClassification);
  if (vendorId) query = query.where('vendorId', '==', vendorId);
  if (containsPersonalData !== undefined) query = query.where('containsPersonalData', '==', containsPersonalData);

  const snap = await query.get();
  const assets: SystemAsset[] = snap.docs.map((d) => d.data() as SystemAsset);

  return { success: true, count: assets.length, assets };
});

// -----------------------------------------------------------------------------
// 3. PROCESSOR PROFILES (PRIVACY & DATA-PROCESSING OVERLAY)
// -----------------------------------------------------------------------------

export interface CreateProcessorProfileInput {
  tenantId: string;
  vendorId: string;
  processorRole: ProcessorRole;
  serviceDescription: string;
  dataCategories: string[];
  dataSubjects: string[];
  isSpecialCategoryData: boolean;
  specialCategoryTypes?: string[] | null;
  jurisdictions: string[];
  linkedSystemAssetIds?: string[];
  criticality: ProcessorCriticality;
  ownerUserId: string;
  reviewCadence: ProcessorReviewCadence;
  lastReviewDate?: string | null;
  status?: ProcessorStatus;
  notes?: string | null;
  dpaSigned?: boolean;
  dpaDate?: string | null;
  linkedDpaEvidenceId?: string | null;
  linkedTiaId?: string | null;
  linkedRopaIds?: string[];
  article28Checklist?: {
    writtenInstructionsMandate: boolean;
    confidentialityDuty: boolean;
    securityMeasuresTOMs: boolean;
    subprocessorAuthorization: boolean;
    dataSubjectRightsAssistance: boolean;
    breachAssistance: boolean;
    dataReturnOrDeletion: boolean;
    auditInspectionRights: boolean;
  } | null;
}

export interface UpdateProcessorProfileInput {
  tenantId: string;
  profileId: string;
  processorRole?: ProcessorRole;
  serviceDescription?: string;
  dataCategories?: string[];
  dataSubjects?: string[];
  isSpecialCategoryData?: boolean;
  specialCategoryTypes?: string[] | null;
  jurisdictions?: string[];
  linkedSystemAssetIds?: string[];
  criticality?: ProcessorCriticality;
  ownerUserId?: string;
  reviewCadence?: ProcessorReviewCadence;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
  status?: ProcessorStatus;
  notes?: string | null;
  dpaSigned?: boolean;
  dpaDate?: string | null;
  linkedDpaEvidenceId?: string | null;
  linkedTiaId?: string | null;
  linkedRopaIds?: string[];
  article28Checklist?: {
    writtenInstructionsMandate: boolean;
    confidentialityDuty: boolean;
    securityMeasuresTOMs: boolean;
    subprocessorAuthorization: boolean;
    dataSubjectRightsAssistance: boolean;
    breachAssistance: boolean;
    dataReturnOrDeletion: boolean;
    auditInspectionRights: boolean;
  } | null;
}

export interface DeleteProcessorProfileInput {
  tenantId: string;
  profileId: string;
}

export interface ListProcessorProfilesInput {
  tenantId: string;
  vendorId?: string;
  processorRole?: ProcessorRole;
  criticality?: ProcessorCriticality;
  status?: ProcessorStatus;
  isSpecialCategoryData?: boolean;
}

export const createTenantProcessorProfile = onCall<CreateProcessorProfileInput>(async (request) => {
  const {
    tenantId,
    vendorId,
    processorRole,
    serviceDescription,
    dataCategories,
    dataSubjects,
    isSpecialCategoryData = false,
    specialCategoryTypes = null,
    jurisdictions,
    linkedSystemAssetIds = [],
    criticality,
    ownerUserId,
    reviewCadence,
    lastReviewDate = null,
    status = 'active',
    notes = null,
    dpaSigned = false,
    dpaDate = null,
    linkedDpaEvidenceId = null,
    linkedTiaId = null,
    linkedRopaIds = [],
    article28Checklist = null,
  } = request.data;

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  // 1. Verify Vendor exists in the tenant
  const vendorRef = db.collection('tenants').doc(tenantId).collection('vendors').doc(vendorId);
  const vendorSnap = await vendorRef.get();
  if (!vendorSnap.exists) {
    throw new HttpsError('not-found', `Vendor with ID ${vendorId} does not exist in tenant.`);
  }

  // 2. Compute Next Review Date
  const now = new Date().toISOString();
  let computedNextReview: string | null = null;
  if (lastReviewDate) {
    computedNextReview = computeNextReviewDate(lastReviewDate, reviewCadence);
  } else {
    computedNextReview = computeNextReviewDate(now, reviewCadence);
  }

  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc();
  const profileId = profileRef.id;

  const payload: ProcessorProfile = {
    id: profileId,
    tenantId,
    vendorId,
    processorRole,
    serviceDescription,
    dataCategories,
    dataSubjects,
    isSpecialCategoryData,
    specialCategoryTypes,
    jurisdictions,
    linkedSystemAssetIds,
    criticality,
    ownerUserId: ownerUserId || authContext.userId,
    reviewCadence,
    lastReviewDate: lastReviewDate || now,
    nextReviewDate: computedNextReview,
    status,
    notes,
    article28Checklist,
    dpaSigned,
    dpaDate,
    linkedDpaEvidenceId,
    linkedTiaId,
    linkedRopaIds,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
    ownerId: ownerUserId || authContext.userId,
  };

  const validation = validateProcessorProfile(payload);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Validation failed: ${validation.errors.join('; ')}`);
  }

  await profileRef.set(payload);

  // 3. Update master Vendor to reflect active processor profile
  await vendorRef.update({
    hasProcessorProfile: true,
    activeProcessorProfileId: profileId,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'processor_profile',
    entityId: profileId,
    action: 'create',
    beforeSummary: null,
    afterSummary: { vendorId, processorRole, criticality, status },
    source: 'cloud_function',
    workflowContext: 'processor_profile_creation',
  });

  return { success: true, profileId, processorProfile: payload };
});

export const updateTenantProcessorProfile = onCall<UpdateProcessorProfileInput>(async (request) => {
  const {
    tenantId,
    profileId,
    processorRole,
    serviceDescription,
    dataCategories,
    dataSubjects,
    isSpecialCategoryData,
    specialCategoryTypes,
    jurisdictions,
    linkedSystemAssetIds,
    criticality,
    ownerUserId,
    reviewCadence,
    lastReviewDate,
    nextReviewDate,
    status,
    notes,
    dpaSigned,
    dpaDate,
    linkedDpaEvidenceId,
    linkedTiaId,
    linkedRopaIds,
    article28Checklist,
  } = request.data;

  if (!tenantId || !profileId) {
    throw new HttpsError('invalid-argument', 'tenantId and profileId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profileId);
  const snap = await profileRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Processor profile ${profileId} not found.`);
  }

  const prev = snap.data() as ProcessorProfile;
  const now = new Date().toISOString();

  const updates: Partial<ProcessorProfile> = {
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (processorRole !== undefined) updates.processorRole = processorRole;
  if (serviceDescription !== undefined) updates.serviceDescription = serviceDescription;
  if (dataCategories !== undefined) updates.dataCategories = dataCategories;
  if (dataSubjects !== undefined) updates.dataSubjects = dataSubjects;
  if (isSpecialCategoryData !== undefined) updates.isSpecialCategoryData = isSpecialCategoryData;
  if (specialCategoryTypes !== undefined) updates.specialCategoryTypes = specialCategoryTypes;
  if (jurisdictions !== undefined) updates.jurisdictions = jurisdictions;
  if (linkedSystemAssetIds !== undefined) updates.linkedSystemAssetIds = linkedSystemAssetIds;
  if (criticality !== undefined) updates.criticality = criticality;
  if (ownerUserId !== undefined) updates.ownerUserId = ownerUserId;
  if (reviewCadence !== undefined) updates.reviewCadence = reviewCadence;
  if (lastReviewDate !== undefined) updates.lastReviewDate = lastReviewDate;
  if (nextReviewDate !== undefined) {
    updates.nextReviewDate = nextReviewDate;
  } else if (lastReviewDate && reviewCadence) {
    updates.nextReviewDate = computeNextReviewDate(lastReviewDate, reviewCadence);
  }
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (dpaSigned !== undefined) updates.dpaSigned = dpaSigned;
  if (dpaDate !== undefined) updates.dpaDate = dpaDate;
  if (linkedDpaEvidenceId !== undefined) updates.linkedDpaEvidenceId = linkedDpaEvidenceId;
  if (linkedTiaId !== undefined) updates.linkedTiaId = linkedTiaId;
  if (linkedRopaIds !== undefined) updates.linkedRopaIds = linkedRopaIds;
  if (article28Checklist !== undefined) updates.article28Checklist = article28Checklist;

  const merged = { ...prev, ...updates };
  const validation = validateProcessorProfile(merged);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Validation failed: ${validation.errors.join('; ')}`);
  }

  await profileRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'processor_profile',
    entityId: profileId,
    action: 'update',
    beforeSummary: { status: prev.status, criticality: prev.criticality },
    afterSummary: updates as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'processor_profile_update',
  });

  return { success: true, profileId, updatedFields: updates };
});

export const deleteTenantProcessorProfile = onCall<DeleteProcessorProfileInput>(async (request) => {
  const { tenantId, profileId } = request.data;
  if (!tenantId || !profileId) {
    throw new HttpsError('invalid-argument', 'tenantId and profileId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profileId);
  const snap = await profileRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Processor profile not found.');
  }

  const prev = snap.data() as ProcessorProfile;
  await profileRef.delete();

  // If vendor references this profile, clear it
  const vendorRef = db.collection('tenants').doc(tenantId).collection('vendors').doc(prev.vendorId);
  const vendorSnap = await vendorRef.get();
  if (vendorSnap.exists && vendorSnap.data()?.activeProcessorProfileId === profileId) {
    await vendorRef.update({
      hasProcessorProfile: false,
      activeProcessorProfileId: null,
      updatedAt: new Date().toISOString(),
      updatedBy: authContext.userId,
    });
  }

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'processor_profile',
    entityId: profileId,
    action: 'delete',
    beforeSummary: { vendorId: prev.vendorId, processorRole: prev.processorRole },
    source: 'cloud_function',
    workflowContext: 'processor_profile_deletion',
  });

  return { success: true, profileId, deleted: true };
});

export const listTenantProcessorProfiles = onCall<ListProcessorProfilesInput>(async (request) => {
  const { tenantId, vendorId, processorRole, criticality, status, isSpecialCategoryData } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('processor_profiles');
  if (vendorId) query = query.where('vendorId', '==', vendorId);
  if (processorRole) query = query.where('processorRole', '==', processorRole);
  if (criticality) query = query.where('criticality', '==', criticality);
  if (status) query = query.where('status', '==', status);
  if (isSpecialCategoryData !== undefined) query = query.where('isSpecialCategoryData', '==', isSpecialCategoryData);

  const snap = await query.get();
  const profiles: ProcessorProfile[] = snap.docs.map((d) => d.data() as ProcessorProfile);

  return { success: true, count: profiles.length, profiles };
});

// -----------------------------------------------------------------------------
// 4. TRANSFER ARRANGEMENTS (CROSS-BORDER & LEGAL TRANSFER MECHANISMS)
// -----------------------------------------------------------------------------

export interface CreateTransferArrangementInput {
  tenantId: string;
  processorProfileId: string;
  vendorId?: string;
  name: string;
  restrictedTransfer: boolean;
  destinationCountries: string[];
  eeaStatus: EEATransferStatus;
  transferScopes: TransferScopeType[];
  transferScopeDescription?: string | null;
  transferMechanismType: TransferMechanismType;
  transferMechanismStatus: TransferMechanismStatus;
  effectiveDate: string;
  reviewDueDate?: string | null;
  supplementaryMeasuresSummary?: string | null;
  subprocessorInvolvement?: boolean;
  subprocessorsInvolved?: string[];
  linkedTiaId?: string | null;
  linkedEvidenceIds?: string[];
  rationale?: string | null;
  notes?: string | null;
}

export interface UpdateTransferArrangementInput {
  tenantId: string;
  arrangementId: string;
  name?: string;
  restrictedTransfer?: boolean;
  destinationCountries?: string[];
  eeaStatus?: EEATransferStatus;
  transferScopes?: TransferScopeType[];
  transferScopeDescription?: string | null;
  transferMechanismType?: TransferMechanismType;
  transferMechanismStatus?: TransferMechanismStatus;
  effectiveDate?: string;
  reviewDueDate?: string | null;
  supplementaryMeasuresSummary?: string | null;
  subprocessorInvolvement?: boolean;
  subprocessorsInvolved?: string[];
  linkedTiaId?: string | null;
  linkedEvidenceIds?: string[];
  rationale?: string | null;
  notes?: string | null;
}

export interface DeleteTransferArrangementInput {
  tenantId: string;
  arrangementId: string;
}

export interface ListTransferArrangementsInput {
  tenantId: string;
  processorProfileId?: string;
  vendorId?: string;
  restrictedTransfer?: boolean;
  transferMechanismType?: TransferMechanismType;
  transferMechanismStatus?: TransferMechanismStatus;
}

export const createTenantTransferArrangement = onCall<CreateTransferArrangementInput>(async (request) => {
  const {
    tenantId,
    processorProfileId,
    vendorId,
    name,
    restrictedTransfer,
    destinationCountries,
    eeaStatus,
    transferScopes,
    transferScopeDescription = null,
    transferMechanismType,
    transferMechanismStatus,
    effectiveDate,
    reviewDueDate = null,
    supplementaryMeasuresSummary = null,
    subprocessorInvolvement = false,
    subprocessorsInvolved = [],
    linkedTiaId = null,
    linkedEvidenceIds = [],
    rationale = null,
    notes = null,
  } = request.data;

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  // 1. Verify ProcessorProfile exists in tenant
  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(processorProfileId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    throw new HttpsError('not-found', `Processor profile with ID ${processorProfileId} does not exist in tenant.`);
  }

  const profileData = profileSnap.data() as ProcessorProfile;
  const resolvedVendorId = vendorId || profileData.vendorId;

  const arrangementRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc();
  const arrangementId = arrangementRef.id;
  const now = new Date().toISOString();

  const payload: TransferArrangement = {
    id: arrangementId,
    tenantId,
    processorProfileId,
    vendorId: resolvedVendorId,
    name,
    restrictedTransfer,
    destinationCountries,
    eeaStatus,
    transferScopes,
    transferScopeDescription,
    transferMechanismType,
    transferMechanismStatus,
    effectiveDate,
    reviewDueDate,
    supplementaryMeasuresSummary,
    subprocessorInvolvement,
    subprocessorsInvolved,
    linkedTiaId,
    linkedEvidenceIds,
    rationale,
    notes,
    status: transferMechanismStatus,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
    ownerId: authContext.userId,
  };

  const validation = validateTransferArrangement(payload);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Validation failed: ${validation.errors.join('; ')}`);
  }

  await arrangementRef.set(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'transfer_arrangement',
    entityId: arrangementId,
    action: 'create',
    beforeSummary: null,
    afterSummary: {
      processorProfileId,
      transferMechanismType,
      transferMechanismStatus,
      restrictedTransfer,
      destinationCountries,
    },
    source: 'cloud_function',
    workflowContext: 'transfer_arrangement_creation',
  });

  return { success: true, arrangementId, transferArrangement: payload };
});

export const updateTenantTransferArrangement = onCall<UpdateTransferArrangementInput>(async (request) => {
  const {
    tenantId,
    arrangementId,
    name,
    restrictedTransfer,
    destinationCountries,
    eeaStatus,
    transferScopes,
    transferScopeDescription,
    transferMechanismType,
    transferMechanismStatus,
    effectiveDate,
    reviewDueDate,
    supplementaryMeasuresSummary,
    subprocessorInvolvement,
    subprocessorsInvolved,
    linkedTiaId,
    linkedEvidenceIds,
    rationale,
    notes,
  } = request.data;

  if (!tenantId || !arrangementId) {
    throw new HttpsError('invalid-argument', 'tenantId and arrangementId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const arrangementRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(arrangementId);
  const snap = await arrangementRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Transfer arrangement ${arrangementId} not found.`);
  }

  const prev = snap.data() as TransferArrangement;
  const now = new Date().toISOString();

  const updates: Partial<TransferArrangement> = {
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (name !== undefined) updates.name = name;
  if (restrictedTransfer !== undefined) updates.restrictedTransfer = restrictedTransfer;
  if (destinationCountries !== undefined) updates.destinationCountries = destinationCountries;
  if (eeaStatus !== undefined) updates.eeaStatus = eeaStatus;
  if (transferScopes !== undefined) updates.transferScopes = transferScopes;
  if (transferScopeDescription !== undefined) updates.transferScopeDescription = transferScopeDescription;
  if (transferMechanismType !== undefined) updates.transferMechanismType = transferMechanismType;
  if (transferMechanismStatus !== undefined) {
    updates.transferMechanismStatus = transferMechanismStatus;
    updates.status = transferMechanismStatus;
  }
  if (effectiveDate !== undefined) updates.effectiveDate = effectiveDate;
  if (reviewDueDate !== undefined) updates.reviewDueDate = reviewDueDate;
  if (supplementaryMeasuresSummary !== undefined) updates.supplementaryMeasuresSummary = supplementaryMeasuresSummary;
  if (subprocessorInvolvement !== undefined) updates.subprocessorInvolvement = subprocessorInvolvement;
  if (subprocessorsInvolved !== undefined) updates.subprocessorsInvolved = subprocessorsInvolved;
  if (linkedTiaId !== undefined) updates.linkedTiaId = linkedTiaId;
  if (linkedEvidenceIds !== undefined) updates.linkedEvidenceIds = linkedEvidenceIds;
  if (rationale !== undefined) updates.rationale = rationale;
  if (notes !== undefined) updates.notes = notes;

  const merged = { ...prev, ...updates };
  const validation = validateTransferArrangement(merged);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Validation failed: ${validation.errors.join('; ')}`);
  }

  await arrangementRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'transfer_arrangement',
    entityId: arrangementId,
    action: 'update',
    beforeSummary: {
      transferMechanismType: prev.transferMechanismType,
      transferMechanismStatus: prev.transferMechanismStatus,
    },
    afterSummary: updates as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'transfer_arrangement_update',
  });

  return { success: true, arrangementId, updatedFields: updates };
});

export const deleteTenantTransferArrangement = onCall<DeleteTransferArrangementInput>(async (request) => {
  const { tenantId, arrangementId } = request.data;
  if (!tenantId || !arrangementId) {
    throw new HttpsError('invalid-argument', 'tenantId and arrangementId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const arrangementRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(arrangementId);
  const snap = await arrangementRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Transfer arrangement not found.');
  }

  const prev = snap.data() as TransferArrangement;
  await arrangementRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'transfer_arrangement',
    entityId: arrangementId,
    action: 'delete',
    beforeSummary: { name: prev.name, processorProfileId: prev.processorProfileId },
    source: 'cloud_function',
    workflowContext: 'transfer_arrangement_deletion',
  });

  return { success: true, arrangementId, deleted: true };
});

export const listTenantTransferArrangements = onCall<ListTransferArrangementsInput>(async (request) => {
  const { tenantId, processorProfileId, vendorId, restrictedTransfer, transferMechanismType, transferMechanismStatus } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('transfer_arrangements');
  if (processorProfileId) query = query.where('processorProfileId', '==', processorProfileId);
  if (vendorId) query = query.where('vendorId', '==', vendorId);
  if (restrictedTransfer !== undefined) query = query.where('restrictedTransfer', '==', restrictedTransfer);
  if (transferMechanismType) query = query.where('transferMechanismType', '==', transferMechanismType);
  if (transferMechanismStatus) query = query.where('transferMechanismStatus', '==', transferMechanismStatus);

  const snap = await query.get();
  const arrangements: TransferArrangement[] = snap.docs.map((d) => d.data() as TransferArrangement);

  return { success: true, count: arrangements.length, arrangements };
});
