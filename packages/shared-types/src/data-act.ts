import { BaseEntity } from './core.js';

export type DataActRole = 'data_holder' | 'data_recipient' | 'user' | 'third_party_service';
export type DataAssetType = 'connected_device_iot' | 'cloud_service_telemetry' | 'industrial_sensor_data' | 'application_usage_data';
export type SharingRequestType = 'user_access' | 'third_party_transfer' | 'public_sector_exceptional_need' | 'interoperability_request';
export type SharingRequestStatus = 'submitted' | 'validating_entitlement' | 'approved_pending_transfer' | 'fulfilled' | 'denied';

/**
 * EU Data Act Connected Product or Service Data Register (/tenants/{tenantId}/data_act_assets/{dataAssetId})
 */
export interface DataActAsset extends BaseEntity {
  productOrServiceName: string;
  assetType: DataAssetType;
  role: DataActRole;
  dataCategoriesGenerated: string[];
  isRealTimeAccessible: boolean;
  metadataDescriptionUrl: string;
  defaultDataFormat: string; // e.g. 'JSON-LD', 'Apache Parquet', 'CSV'
  tradeSecretProtectionMeasures: string;
  technicalAccessInterfaceType: 'rest_api' | 'stream_mqtt' | 'direct_download' | 'sftp';
  linkedSystemAssetId: string | null;
}

/**
 * EU Data Act Sharing and Access Request (/tenants/{tenantId}/data_sharing_requests/{requestId})
 */
export interface DataSharingRequest extends BaseEntity {
  requestReference: string;
  dataActAssetId: string;
  requestType: SharingRequestType;
  status: SharingRequestStatus;
  requesterOrganization: string;
  requesterContactEmail: string;
  frandTermsSummary: string; // Fair, Reasonable, And Non-Discriminatory terms
  compensationFeeEur: number | null;
  tradeSecretSafeguardsAgreed: boolean;
  decisionRationale: string;
  decisionDate: string | null;
  transferCompletedAt: string | null;
  fulfillmentEvidenceId: string | null;
}

/**
 * Cloud Switching & Interoperability Record (EU Data Act Chapter VI)
 */
export interface SwitchingDependency extends BaseEntity {
  cloudServiceProviderName: string;
  serviceCategory: 'iaas' | 'paas' | 'saas';
  currentDataEgressFormat: string;
  switchingAssistanceTermsDocumented: boolean;
  maximumSwitchingNoticeDays: number;
  dataPortabilityVerified: boolean;
  functionalEquivalenceAssessment: string;
  nextReviewDate: string;
}
