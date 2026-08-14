import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Vendor,
  VendorRiskTier,
  SystemAsset,
  SystemCriticality,
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
