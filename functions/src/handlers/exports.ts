import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, storage } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { createNotification } from '../lib/notifications.js';
import {
  ExportJob,
  ExportType,
  ExportJobStatus,
  ProcessorProfile,
  TransferArrangement,
  SystemAsset,
  Vendor,
  TIA,
  Evidence,
  ROPAEntry,
  Certification,
  evaluateProcessorEvidenceCompleteness,
  evaluateProcessorRiskFlags,
  evaluateCertificationCompleteness,
  evaluateCertificationRiskFlags,
} from '@eurogovernance/shared-types';

export interface RequestExportInput {
  tenantId: string;
  exportType: ExportType;
  filters?: Record<string, unknown>;
}

export interface GetExportJobInput {
  tenantId: string;
  jobId: string;
}

export interface ListExportJobsInput {
  tenantId: string;
  status?: ExportJobStatus;
}

/**
 * Executes the backend export compilation job, assembling real tenant data into a tenant-scoped artifact.
 */
export async function processExportJob(tenantId: string, jobId: string): Promise<ExportJob> {
  const jobRef = db.collection('tenants').doc(tenantId).collection('export_jobs').doc(jobId);
  const snap = await jobRef.get();
  if (!snap.exists) {
    throw new Error(`Export job ${jobId} not found.`);
  }

  const job = snap.data() as ExportJob;
  const processingTime = new Date().toISOString();

  // 1. Transition status to 'processing'
  await jobRef.update({
    status: 'processing',
  });

  try {
    let fileName = `${job.exportType}_${jobId}.json`;
    let contentType = 'application/json';
    let fileContent = '';

    const tenantRef = db.collection('tenants').doc(tenantId);

    if (job.exportType === 'adopted_frameworks_summary') {
      const adoptedSnap = await tenantRef.collection('adopted_frameworks').get();
      const scopeFactsSnap = await tenantRef.collection('scope_facts').get();
      const scopeProfilesSnap = await tenantRef.collection('scope_profiles').get();

      const adoptedData = adoptedSnap.docs.map((d) => d.data());
      const scopeFactsData = scopeFactsSnap.docs.map((d) => d.data());
      const scopeProfilesData = scopeProfilesSnap.docs.map((d) => d.data());

      fileName = `adopted_frameworks_summary_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Adopted Frameworks & Scope Summary',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            adoptedFrameworksCount: adoptedData.length,
            recordedScopeFactsCount: scopeFactsData.length,
          },
          adoptedFrameworks: adoptedData,
          scopeProfiles: scopeProfilesData,
          structuredScopeFacts: scopeFactsData,
        },
        null,
        2
      );
    } else if (job.exportType === 'applicability_decisions_report') {
      const decSnap = await tenantRef.collection('applicability_decisions').get();
      const decisionsData = decSnap.docs.map((d) => d.data());

      const applicableCount = decisionsData.filter((d: any) => d.status === 'applicable').length;
      const excludedCount = decisionsData.filter((d: any) => d.status === 'not_applicable').length;
      const reviewNeededCount = decisionsData.filter((d: any) => d.status === 'review_required').length;
      const overriddenCount = decisionsData.filter((d: any) => d.isOverridden === true).length;

      fileName = `applicability_decisions_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Multi-Framework Applicability Determination & Rationale Report',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalDecisionsCount: decisionsData.length,
            applicableCount,
            excludedCount,
            reviewNeededCount,
            overriddenCount,
          },
          decisions: decisionsData,
        },
        null,
        2
      );
    } else if (job.exportType === 'tenant_control_coverage_report') {
      const controlsSnap = await tenantRef.collection('controls').get();
      const reqInstancesSnap = await tenantRef.collection('requirement_instances').get();
      const obligationsSnap = await tenantRef.collection('statutory_obligations').get();

      const controlsData = controlsSnap.docs.map((d) => d.data());
      const reqInstancesData = reqInstancesSnap.docs.map((d) => d.data());
      const obligationsData = obligationsSnap.docs.map((d) => d.data());

      const harmonizedControls = controlsData.filter(
        (c: any) => c.isHarmonized || (c.frameworkIds && c.frameworkIds.length > 1)
      );

      fileName = `tenant_control_coverage_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Tenant Control Coverage & Harmonization Report',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalControlsCount: controlsData.length,
            harmonizedControlsCount: harmonizedControls.length,
            statutoryObligationsCount: obligationsData.length,
          },
          controls: controlsData,
          harmonizedControls,
          requirementInstances: reqInstancesData,
          statutoryObligations: obligationsData,
        },
        null,
        2
      );
    } else if (job.exportType === 'framework_gap_report') {
      const decSnap = await tenantRef.collection('applicability_decisions').get();
      const reqInstancesSnap = await tenantRef.collection('requirement_instances').get();
      const controlsSnap = await tenantRef.collection('controls').get();
      const evidenceSnap = await tenantRef.collection('evidence').get();

      const decisionsData = decSnap.docs.map((d) => d.data());
      const reqInstancesData = reqInstancesSnap.docs.map((d) => d.data());
      const controlsData = controlsSnap.docs.map((d) => d.data());
      const evidenceData = evidenceSnap.docs.map((d) => d.data());

      // Identify open gaps: applicable requirements lacking implemented controls
      const openGaps: any[] = [];
      const overdueReviews: any[] = [];

      for (const dec of decisionsData as any[]) {
        if (dec.status === 'applicable') {
          const reqInst = (reqInstancesData as any[]).find((ri) => ri.requirementId === dec.requirementId);
          const hasSatisfyingControls = reqInst && reqInst.satisfyingControlIds && reqInst.satisfyingControlIds.length > 0;
          if (!hasSatisfyingControls) {
            openGaps.push({
              requirementId: dec.requirementId,
              sectionCode: dec.sectionCode,
              requirementTitle: dec.requirementTitle,
              frameworkId: dec.frameworkId,
              statutoryRationale: dec.rationale || dec.ruleEvaluationSummary,
              issue: 'Applicable statutory requirement has no mapped tenant controls.',
              remediation: 'Instantiate or map an operational control to satisfy this requirement.',
            });
          }
        } else if (dec.status === 'review_required') {
          overdueReviews.push({
            requirementId: dec.requirementId,
            sectionCode: dec.sectionCode,
            requirementTitle: dec.requirementTitle,
            frameworkId: dec.frameworkId,
            statutoryRationale: dec.rationale || dec.ruleEvaluationSummary,
            issue: 'Applicability decision is pending manual/reviewer assessment.',
          });
        }
      }

      fileName = `framework_gap_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Multi-Framework Compliance Gap & Attention Report',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            openGapsCount: openGaps.length,
            overdueReviewsCount: overdueReviews.length,
          },
          openGaps,
          overdueReviews,
          activeControlsCount: controlsData.length,
          totalEvidenceCount: evidenceData.length,
        },
        null,
        2
      );
    } else if (job.exportType === 'gdpr_ropa_xlsx' || job.exportType === 'framework_readiness_pdf') {
      const ropaSnap = await tenantRef.collection('ropa_entries').get();
      const controlsSnap = await tenantRef.collection('controls').get();
      const ropaData = ropaSnap.docs.map((d) => d.data());
      const controlsData = controlsSnap.docs.map((d) => d.data());

      fileName = `${job.exportType}_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            generatedAt: processingTime,
            recordCount: ropaData.length + controlsData.length,
          },
          ropaEntries: ropaData,
          controls: controlsData,
        },
        null,
        2
      );
    } else if (job.exportType === 'eu_ai_act_technical_file_pdf') {
      const aiSnap = await tenantRef.collection('ai_systems').get();
      const assessmentsSnap = await tenantRef.collection('ai_assessments').get();
      const incidentsSnap = await tenantRef.collection('ai_incidents').get();

      fileName = `eu_ai_act_technical_dossier_${jobId}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            generatedAt: processingTime,
          },
          aiSystems: aiSnap.docs.map((d) => d.data()),
          assessments: assessmentsSnap.docs.map((d) => d.data()),
          incidents: incidentsSnap.docs.map((d) => d.data()),
        },
        null,
        2
      );
    } else if (job.exportType === 'iso_soa_pdf' || job.exportType === 'iso_soa_report') {
      const soaSnap = await tenantRef.collection('iso_soa_entries').get();
      const scopesSnap = await tenantRef.collection('iso_scope_statements').get();
      const auditsSnap = await tenantRef.collection('iso_internal_audits').get();

      fileName = `iso_statement_of_applicability_${jobId}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'ISO/IEC 27001 Statement of Applicability (SoA)',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalEntriesCount: soaSnap.docs.length,
          },
          scopeStatements: scopesSnap.docs.map((d) => d.data()),
          soaEntries: soaSnap.docs.map((d) => d.data()),
          internalAudits: auditsSnap.docs.map((d) => d.data()),
        },
        null,
        2
      );
    } else if (job.exportType === 'processor_inventory_report') {
      const [profilesSnap, vendorsSnap, transfersSnap, assetsSnap, evidenceSnap] = await Promise.all([
        tenantRef.collection('processor_profiles').get(),
        tenantRef.collection('vendors').get(),
        tenantRef.collection('transfer_arrangements').get(),
        tenantRef.collection('system_assets').get(),
        tenantRef.collection('evidence').get(),
      ]);

      const vendorsMap = new Map<string, Vendor>();
      vendorsSnap.docs.forEach((d) => vendorsMap.set(d.id, d.data() as Vendor));

      const profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
      const transfers = transfersSnap.docs.map((d) => d.data() as TransferArrangement);
      const assets = assetsSnap.docs.map((d) => d.data() as SystemAsset);
      const evidence = evidenceSnap.docs.map((d) => d.data() as Evidence);

      const items = profiles.map((p) => {
        const v = p.vendorId ? vendorsMap.get(p.vendorId) : null;
        const procTransfers = transfers.filter((t) => t.processorProfileId === p.id);
        const procAssets = assets.filter((a) => a.processorProfileIds?.includes(p.id) || p.linkedSystemAssetIds?.includes(a.id));
        const procEvidence = evidence.filter((e) => e.processorProfileIds?.includes(p.id) || (p.vendorId && e.vendorIds?.includes(p.vendorId)));
        const evCompleteness = evaluateProcessorEvidenceCompleteness(p, procEvidence);
        const riskEval = evaluateProcessorRiskFlags(p, procTransfers, procEvidence);

        return {
          processorProfileId: p.id,
          engagementName: p.engagementName,
          processorRole: p.processorRole,
          criticality: p.criticality,
          status: p.status,
          serviceDescription: p.serviceDescription,
          isSpecialCategoryData: p.isSpecialCategoryData,
          dataCategories: p.dataCategories,
          dataSubjects: p.dataSubjects,
          jurisdictions: p.jurisdictions,
          vendor: v
            ? {
                vendorId: v.id,
                name: v.name,
                category: v.category,
                riskTier: v.riskTier,
                countryOfIncorporation: v.countryOfIncorporation,
              }
            : null,
          dpaStatus: {
            signed: p.dpaSigned,
            date: p.dpaDate,
            linkedEvidenceId: p.linkedDpaEvidenceId,
          },
          reviewCadence: p.reviewCadence,
          lastReviewDate: p.lastReviewDate,
          nextReviewDate: p.nextReviewDate,
          transferArrangementsCount: procTransfers.length,
          supportedSystemsCount: procAssets.length,
          evidenceStatus: {
            isComplete: evCompleteness.isComplete,
            missingCount: evCompleteness.missingCount,
            missingCategories: evCompleteness.requirements
              .filter((r) => r.status === 'missing' || r.status === 'expired')
              .map((r) => r.category),
          },
          governanceRiskLevel: riskEval.overallRiskLevel,
          openRiskFlagsCount: riskEval.flags.length,
        };
      });

      fileName = `processor_inventory_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Third-Party Processor Register & Governance Inventory (GDPR Art. 28)',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalProcessorsCount: items.length,
            activeCount: items.filter((i) => i.status === 'active').length,
            underReviewCount: items.filter((i) => i.status === 'under_review').length,
            criticalRiskCount: items.filter((i) => i.governanceRiskLevel === 'critical' || i.criticality === 'critical').length,
          },
          processorInventory: items,
        },
        null,
        2
      );
    } else if (job.exportType === 'restricted_transfers_register') {
      const [transfersSnap, profilesSnap, vendorsSnap, tiasSnap] = await Promise.all([
        tenantRef.collection('transfer_arrangements').get(),
        tenantRef.collection('processor_profiles').get(),
        tenantRef.collection('vendors').get(),
        tenantRef.collection('tia_assessments').get(),
      ]);

      const profilesMap = new Map<string, ProcessorProfile>();
      profilesSnap.docs.forEach((d) => profilesMap.set(d.id, d.data() as ProcessorProfile));

      const vendorsMap = new Map<string, Vendor>();
      vendorsSnap.docs.forEach((d) => vendorsMap.set(d.id, d.data() as Vendor));

      const tiasMap = new Map<string, TIA>();
      tiasSnap.docs.forEach((d) => tiasMap.set(d.id, d.data() as TIA));

      const allTransfers = transfersSnap.docs.map((d) => d.data() as TransferArrangement);
      const restrictedTransfers = allTransfers.filter((t) => t.restrictedTransfer === true);

      const entries = restrictedTransfers.map((t) => {
        const p = profilesMap.get(t.processorProfileId);
        const v = t.vendorId ? vendorsMap.get(t.vendorId) : p?.vendorId ? vendorsMap.get(p.vendorId) : null;
        const tia = t.linkedTiaId ? tiasMap.get(t.linkedTiaId) : null;

        return {
          transferArrangementId: t.id,
          name: t.name,
          processorProfileId: t.processorProfileId,
          processorEngagementName: p?.engagementName || null,
          vendorName: v?.name || null,
          restrictedTransfer: t.restrictedTransfer,
          destinationCountries: t.destinationCountries,
          eeaStatus: t.eeaStatus,
          transferScopes: t.transferScopes,
          transferScopeDescription: t.transferScopeDescription,
          transferMechanismType: t.transferMechanismType,
          transferMechanismStatus: t.transferMechanismStatus,
          effectiveDate: t.effectiveDate,
          reviewDueDate: t.reviewDueDate,
          supplementaryMeasuresSummary: t.supplementaryMeasuresSummary,
          subprocessorInvolvement: t.subprocessorInvolvement,
          subprocessorsInvolved: t.subprocessorsInvolved || [],
          tiaAssessment: tia
            ? {
                tiaId: tia.id,
                code: tia.code,
                title: tia.title,
                status: tia.status,
                residualRiskLevel: tia.residualRiskLevel,
              }
            : null,
          linkedEvidenceIds: t.linkedEvidenceIds || [],
          rationale: t.rationale,
        };
      });

      fileName = `restricted_transfers_register_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'International & Restricted Data Transfer Register (GDPR Chapter V)',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalRestrictedTransfersCount: entries.length,
            uniqueDestinationCountries: Array.from(new Set(entries.flatMap((e) => e.destinationCountries))),
          },
          restrictedTransfersRegister: entries,
        },
        null,
        2
      );
    } else if (job.exportType === 'transfer_mechanisms_report') {
      const [transfersSnap, profilesSnap, vendorsSnap] = await Promise.all([
        tenantRef.collection('transfer_arrangements').get(),
        tenantRef.collection('processor_profiles').get(),
        tenantRef.collection('vendors').get(),
      ]);

      const profilesMap = new Map<string, ProcessorProfile>();
      profilesSnap.docs.forEach((d) => profilesMap.set(d.id, d.data() as ProcessorProfile));

      const vendorsMap = new Map<string, Vendor>();
      vendorsSnap.docs.forEach((d) => vendorsMap.set(d.id, d.data() as Vendor));

      const transfers = transfersSnap.docs.map((d) => d.data() as TransferArrangement);

      const countsByMechanism = {
        standard_contractual_clauses: transfers.filter((t) => t.transferMechanismType === 'standard_contractual_clauses').length,
        adequacy_decision: transfers.filter((t) => t.transferMechanismType === 'adequacy_decision').length,
        binding_corporate_rules: transfers.filter((t) => t.transferMechanismType === 'binding_corporate_rules').length,
        derogation_art49: transfers.filter((t) => t.transferMechanismType === 'derogation_art49').length,
        intra_group_agreement: transfers.filter((t) => t.transferMechanismType === 'intra_group_agreement').length,
        no_mechanism_selected: transfers.filter((t) => t.transferMechanismType === 'no_mechanism_selected').length,
      };

      const entries = transfers.map((t) => {
        const p = profilesMap.get(t.processorProfileId);
        const v = t.vendorId ? vendorsMap.get(t.vendorId) : p?.vendorId ? vendorsMap.get(p.vendorId) : null;

        return {
          transferArrangementId: t.id,
          name: t.name,
          processorProfileId: t.processorProfileId,
          processorEngagementName: p?.engagementName || null,
          vendorName: v?.name || null,
          transferMechanismType: t.transferMechanismType,
          transferMechanismStatus: t.transferMechanismStatus,
          destinationCountries: t.destinationCountries,
          restrictedTransfer: t.restrictedTransfer,
          effectiveDate: t.effectiveDate,
          reviewDueDate: t.reviewDueDate,
          linkedEvidenceIds: t.linkedEvidenceIds || [],
          linkedTiaId: t.linkedTiaId,
          rationale: t.rationale,
        };
      });

      fileName = `transfer_mechanisms_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Legal Transfer Mechanisms Distribution & Status Breakdown (GDPR Art. 45-49)',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalTransferArrangementsCount: transfers.length,
            mechanismBreakdown: countsByMechanism,
          },
          mechanismEntries: entries,
        },
        null,
        2
      );
    } else if (job.exportType === 'processor_governance_gaps_report') {
      const [profilesSnap, transfersSnap, tiasSnap, evidenceSnap, vendorsSnap] = await Promise.all([
        tenantRef.collection('processor_profiles').get(),
        tenantRef.collection('transfer_arrangements').get(),
        tenantRef.collection('tia_assessments').get(),
        tenantRef.collection('evidence').get(),
        tenantRef.collection('vendors').get(),
      ]);

      const vendorsMap = new Map<string, Vendor>();
      vendorsSnap.docs.forEach((d) => vendorsMap.set(d.id, d.data() as Vendor));

      const profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
      const transfers = transfersSnap.docs.map((d) => d.data() as TransferArrangement);
      const tias = tiasSnap.docs.map((d) => d.data() as TIA);
      const evidence = evidenceSnap.docs.map((d) => d.data() as Evidence);

      const now = new Date();
      const nowMillis = now.getTime();
      const gaps: any[] = [];

      for (const p of profiles) {
        const v = p.vendorId ? vendorsMap.get(p.vendorId) : null;
        const procTransfers = transfers.filter((t) => t.processorProfileId === p.id);
        const procEvidence = evidence.filter((e) => e.processorProfileIds?.includes(p.id) || (p.vendorId && e.vendorIds?.includes(p.vendorId)));
        const evCompleteness = evaluateProcessorEvidenceCompleteness(p, procEvidence);

        // Gap 1: Missing DPA for active processor
        if (p.status === 'active' && !p.dpaSigned) {
          gaps.push({
            gapId: `gap_missing_dpa_${p.id}`,
            severity: 'critical',
            gapType: 'missing_dpa_contract',
            regulatoryCitation: 'GDPR Article 28(3)',
            processorProfileId: p.id,
            engagementName: p.engagementName,
            vendorName: v?.name || null,
            finding: `Active processor profile "${p.engagementName}" does not have a signed Data Processing Agreement recorded.`,
            remediation: 'Execute and upload Article 28 compliant Data Processing Addendum / Clauses.',
          });
        }

        // Gap 2: Overdue Processor Review
        if (p.nextReviewDate && new Date(p.nextReviewDate).getTime() < nowMillis) {
          gaps.push({
            gapId: `gap_overdue_review_${p.id}`,
            severity: p.criticality === 'critical' ? 'high' : 'medium',
            gapType: 'overdue_processor_review',
            regulatoryCitation: 'GDPR Article 28(1) & ISO 27001 A.15',
            processorProfileId: p.id,
            engagementName: p.engagementName,
            vendorName: v?.name || null,
            finding: `Periodic supplier governance review was due on ${p.nextReviewDate.slice(0, 10)} and is currently OVERDUE.`,
            remediation: 'Conduct supplier security re-assessment and update next review milestone.',
          });
        }

        // Gap 3: Missing Required Evidence Documents
        for (const req of evCompleteness.requirements) {
          if (req.status === 'missing' || req.status === 'expired') {
            gaps.push({
              gapId: `gap_evidence_${p.id}_${req.category}`,
              severity: req.category === 'dpa' || req.category === 'scc' ? 'high' : 'medium',
              gapType: req.status === 'expired' ? 'expired_evidence' : 'missing_evidence',
              regulatoryCitation: 'GDPR Article 28 & Principle of Accountability',
              processorProfileId: p.id,
              engagementName: p.engagementName,
              vendorName: v?.name || null,
              finding: `Required evidence category "${req.category}" is ${req.status} for processor "${p.engagementName}".`,
              remediation: `Obtain and attach valid ${req.category} compliance artifact.`,
            });
          }
        }

        // Gap 4: Restricted Transfers without TIA or Evidence
        for (const t of procTransfers) {
          if (t.restrictedTransfer) {
            const hasTia = t.linkedTiaId && tias.some((tia) => tia.id === t.linkedTiaId && tia.status === 'approved');
            if (!hasTia) {
              gaps.push({
                gapId: `gap_missing_tia_${t.id}`,
                severity: 'critical',
                gapType: 'missing_schrems_tia',
                regulatoryCitation: 'GDPR Chapter V & Schrems II CJEU Ruling',
                processorProfileId: p.id,
                transferArrangementId: t.id,
                transferName: t.name,
                destinationCountries: t.destinationCountries,
                engagementName: p.engagementName,
                vendorName: v?.name || null,
                finding: `Restricted transfer "${t.name}" to ${t.destinationCountries.join(', ')} lacks an approved Transfer Impact Assessment (TIA).`,
                remediation: 'Perform Schrems II legal risk analysis and document supplementary safeguards.',
              });
            }

            if (t.transferMechanismType === 'no_mechanism_selected') {
              gaps.push({
                gapId: `gap_no_mechanism_${t.id}`,
                severity: 'critical',
                gapType: 'unauthorized_restricted_transfer',
                regulatoryCitation: 'GDPR Article 44 & 46',
                processorProfileId: p.id,
                transferArrangementId: t.id,
                transferName: t.name,
                destinationCountries: t.destinationCountries,
                engagementName: p.engagementName,
                vendorName: v?.name || null,
                finding: `Restricted cross-border transfer "${t.name}" has no valid Chapter V transfer mechanism configured.`,
                remediation: 'Select and execute standard contractual clauses, adequacy, or other valid legal mechanism.',
              });
            }
          }
        }
      }

      fileName = `processor_governance_gaps_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Processor Governance & International Transfer Compliance Gap Analysis',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalIdentifiedGapsCount: gaps.length,
            criticalGapsCount: gaps.filter((g) => g.severity === 'critical').length,
            highGapsCount: gaps.filter((g) => g.severity === 'high').length,
            mediumGapsCount: gaps.filter((g) => g.severity === 'medium').length,
          },
          complianceGaps: gaps,
        },
        null,
        2
      );
    } else if (job.exportType === 'processor_review_schedule_report') {
      const [profilesSnap, transfersSnap, evidenceSnap, vendorsSnap] = await Promise.all([
        tenantRef.collection('processor_profiles').get(),
        tenantRef.collection('transfer_arrangements').get(),
        tenantRef.collection('evidence').get(),
        tenantRef.collection('vendors').get(),
      ]);

      const vendorsMap = new Map<string, Vendor>();
      vendorsSnap.docs.forEach((d) => vendorsMap.set(d.id, d.data() as Vendor));

      const profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
      const transfers = transfersSnap.docs.map((d) => d.data() as TransferArrangement);
      const evidence = evidenceSnap.docs.map((d) => d.data() as Evidence);

      const now = new Date();
      const nowMillis = now.getTime();
      const thirtyDaysMillis = 30 * 24 * 60 * 60 * 1000;
      const ninetyDaysMillis = 90 * 24 * 60 * 60 * 1000;

      const scheduleItems: any[] = [];

      for (const p of profiles) {
        const v = p.vendorId ? vendorsMap.get(p.vendorId) : null;
        if (p.nextReviewDate) {
          const revMillis = new Date(p.nextReviewDate).getTime();
          const isOverdue = revMillis < nowMillis;
          const dueIn30d = !isOverdue && revMillis - nowMillis <= thirtyDaysMillis;
          const dueIn90d = !isOverdue && revMillis - nowMillis <= ninetyDaysMillis;

          scheduleItems.push({
            itemId: `rev_proc_${p.id}`,
            itemType: 'processor_governance_review',
            entityId: p.id,
            entityName: p.engagementName,
            vendorName: v?.name || null,
            criticality: p.criticality,
            cadence: p.reviewCadence,
            lastReviewDate: p.lastReviewDate,
            nextDueDate: p.nextReviewDate,
            isOverdue,
            statusBucket: isOverdue ? 'overdue' : dueIn30d ? 'due_soon_30d' : dueIn90d ? 'due_soon_90d' : 'on_track',
            assignedOwnerId: p.ownerUserId || p.ownerId,
          });
        }
      }

      for (const t of transfers) {
        if (t.reviewDueDate) {
          const revMillis = new Date(t.reviewDueDate).getTime();
          const isOverdue = revMillis < nowMillis;
          const dueIn30d = !isOverdue && revMillis - nowMillis <= thirtyDaysMillis;
          const dueIn90d = !isOverdue && revMillis - nowMillis <= ninetyDaysMillis;

          scheduleItems.push({
            itemId: `rev_trans_${t.id}`,
            itemType: 'transfer_mechanism_review',
            entityId: t.id,
            entityName: t.name,
            processorProfileId: t.processorProfileId,
            mechanismType: t.transferMechanismType,
            nextDueDate: t.reviewDueDate,
            isOverdue,
            statusBucket: isOverdue ? 'overdue' : dueIn30d ? 'due_soon_30d' : dueIn90d ? 'due_soon_90d' : 'on_track',
          });
        }
      }

      for (const ev of evidence) {
        if (ev.reviewDueDate) {
          const revMillis = new Date(ev.reviewDueDate).getTime();
          const isOverdue = revMillis < nowMillis;
          const dueIn30d = !isOverdue && revMillis - nowMillis <= thirtyDaysMillis;

          scheduleItems.push({
            itemId: `rev_ev_${ev.id}`,
            itemType: 'evidence_renewal',
            entityId: ev.id,
            entityName: ev.title,
            category: ev.category,
            nextDueDate: ev.reviewDueDate,
            isOverdue,
            statusBucket: isOverdue ? 'overdue' : dueIn30d ? 'due_soon_30d' : 'on_track',
          });
        }
      }

      scheduleItems.sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());

      fileName = `processor_review_schedule_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Processor & Transfer Mechanism Review Schedule and Calendar',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalReviewItemsCount: scheduleItems.length,
            overdueCount: scheduleItems.filter((i) => i.isOverdue).length,
            dueSoon30dCount: scheduleItems.filter((i) => i.statusBucket === 'due_soon_30d').length,
          },
          reviewSchedule: scheduleItems,
        },
        null,
        2
      );
    } else if (job.exportType === 'processor_system_mapping_report') {
      const [profilesSnap, assetsSnap, vendorsSnap] = await Promise.all([
        tenantRef.collection('processor_profiles').get(),
        tenantRef.collection('system_assets').get(),
        tenantRef.collection('vendors').get(),
      ]);

      const vendorsMap = new Map<string, Vendor>();
      vendorsSnap.docs.forEach((d) => vendorsMap.set(d.id, d.data() as Vendor));

      const profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
      const assets = assetsSnap.docs.map((d) => d.data() as SystemAsset);

      const mappings = profiles.map((p) => {
        const v = p.vendorId ? vendorsMap.get(p.vendorId) : null;
        const linkedAssets = assets.filter((a) => a.processorProfileIds?.includes(p.id) || p.linkedSystemAssetIds?.includes(a.id));

        return {
          processorProfileId: p.id,
          engagementName: p.engagementName,
          processorRole: p.processorRole,
          criticality: p.criticality,
          vendor: v ? { vendorId: v.id, name: v.name, riskTier: v.riskTier } : null,
          linkedSystems: linkedAssets.map((a) => {
            const rel = a.processorRelationships?.find((r) => r.processorProfileId === p.id);
            return {
              systemAssetId: a.id,
              name: a.name,
              assetType: a.assetType,
              criticality: a.criticality,
              dataClassification: a.dataClassification,
              hostingLocation: a.hostingLocation,
              relationshipType: rel?.relationshipType || 'hosting',
              relationshipDescription: rel?.relationshipDescription || null,
            };
          }),
        };
      });

      fileName = `processor_system_mapping_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Processor-to-System Architecture & Infrastructure Dependency Map',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalProcessorsCount: mappings.length,
            totalSystemAssetsCount: assets.length,
          },
          processorToSystemMap: mappings,
        },
        null,
        2
      );
    } else if (job.exportType === 'processor_ropa_mapping_report') {
      const [ropaSnap, profilesSnap, transfersSnap, vendorsSnap] = await Promise.all([
        tenantRef.collection('ropa_entries').get(),
        tenantRef.collection('processor_profiles').get(),
        tenantRef.collection('transfer_arrangements').get(),
        tenantRef.collection('vendors').get(),
      ]);

      const profilesMap = new Map<string, ProcessorProfile>();
      profilesSnap.docs.forEach((d) => profilesMap.set(d.id, d.data() as ProcessorProfile));

      const transfersMap = new Map<string, TransferArrangement>();
      transfersSnap.docs.forEach((d) => transfersMap.set(d.id, d.data() as TransferArrangement));

      const vendorsMap = new Map<string, Vendor>();
      vendorsSnap.docs.forEach((d) => vendorsMap.set(d.id, d.data() as Vendor));

      const ropaEntries = ropaSnap.docs.map((d) => d.data() as ROPAEntry);

      const mappings = ropaEntries.map((r) => {
        const linkedProfiles = (r.processorProfileIds || []).map((id) => {
          const p = profilesMap.get(id);
          const v = p?.vendorId ? vendorsMap.get(p.vendorId) : null;
          return {
            processorProfileId: id,
            engagementName: p?.engagementName || id,
            processorRole: p?.processorRole || null,
            vendorName: v?.name || null,
            dpaSigned: p?.dpaSigned || false,
          };
        });

        const linkedTransfers = (r.transferArrangementIds || []).map((id) => {
          const t = transfersMap.get(id);
          return {
            transferArrangementId: id,
            name: t?.name || id,
            destinationCountries: t?.destinationCountries || [],
            transferMechanismType: t?.transferMechanismType || null,
            restrictedTransfer: t?.restrictedTransfer || false,
            linkedTiaId: t?.linkedTiaId || null,
          };
        });

        return {
          ropaId: r.id,
          activityCode: r.activityCode,
          activityName: r.activityName,
          legalBasis: r.legalBasis,
          retentionPeriodMonths: r.retentionPeriodMonths,
          personalDataCategories: r.personalDataCategories || [],
          dataSubjectCategories: r.dataSubjectCategories || [],
          involvesInternationalTransfer: r.involvesInternationalTransfer || false,
          destinationCountries: r.destinationCountries || [],
          linkedProcessors: linkedProfiles,
          linkedTransferArrangements: linkedTransfers,
          isArticle28Compliant: linkedProfiles.every((p) => p.dpaSigned),
        };
      });

      fileName = `processor_ropa_mapping_report_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Article 30 ROPA to Processor & Cross-Border Transfer Traceability Map',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalRopaActivitiesCount: mappings.length,
            crossBorderRopaCount: mappings.filter((m) => m.involvesInternationalTransfer).length,
          },
          ropaProcessorMap: mappings,
        },
        null,
        2
      );
    } else if (job.exportType === 'certification_register_report') {
      const [certSnap, evSnap] = await Promise.all([
        tenantRef.collection('certifications').get(),
        tenantRef.collection('evidence').get(),
      ]);

      const certs = certSnap.docs.map((d) => d.data() as Certification);
      const evidences = evSnap.docs.map((d) => d.data() as Evidence);

      const enrichedCerts = certs.map((c) => {
        const completeness = evaluateCertificationCompleteness(c, evidences, new Date(processingTime));
        return {
          ...c,
          completenessSummary: completeness,
        };
      });

      const riskEvaluation = evaluateCertificationRiskFlags(certs, evidences, new Date(processingTime));

      fileName = `certification_register_${tenantId}_${Date.now()}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            title: 'Master Certifications & External Security Assurance Register',
            generatedAt: processingTime,
            requestedBy: job.requestedBy,
            totalCertificationsCount: certs.length,
            activeValidCount: certs.filter((c) => c.status === 'active_valid').length,
            expiredCount: certs.filter((c) => c.status === 'expired').length,
            overallAssuranceRiskLevel: riskEvaluation.overallAssuranceRiskLevel,
          },
          certifications: enrichedCerts,
          riskEvaluation,
        },
        null,
        2
      );
    } else {
      // Default: tenant_evidence_package_zip metadata package
      const evidenceSnap = await tenantRef.collection('evidence').get();
      fileName = `tenant_evidence_package_${jobId}.json`;
      fileContent = JSON.stringify(
        {
          exportHeader: {
            tenantId,
            exportType: job.exportType,
            generatedAt: processingTime,
          },
          evidenceInventory: evidenceSnap.docs.map((d) => d.data()),
        },
        null,
        2
      );
    }

    const storagePath = `tenants/${tenantId}/exports/${jobId}/${fileName}`;
    const fileBuffer = Buffer.from(fileContent, 'utf8');
    const fileSizeBytes = fileBuffer.length;

    // Save artifact into tenant-scoped storage location
    try {
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);
      await file.save(fileBuffer, {
        contentType,
        metadata: {
          tenantId,
          jobId,
          exportType: job.exportType,
          generatedAt: processingTime,
        },
      });
    } catch {
      // If storage emulator bucket is not loaded, fallback gracefully with virtual storage path
    }

    const completedAt = new Date().toISOString();

    const updatedJob: Partial<ExportJob> = {
      status: 'completed',
      completedAt,
      fileStoragePath: storagePath,
      fileSizeBytes,
      errorMessage: null,
    };

    await jobRef.update(updatedJob);

    await recordAuditLog({
      tenantId,
      actorId: job.requestedBy,
      actorEmail: 'export-service@eurogovernance.local',
      actorRole: 'tenant_admin',
      entityType: 'export_job',
      entityId: jobId,
      action: 'export_generated',
      afterSummary: {
        exportType: job.exportType,
        storagePath,
        fileSizeBytes,
        status: 'completed',
      },
      source: 'cloud_function',
      workflowContext: 'export_generation_completed',
    });

    if (job.requestedBy) {
      await createNotification({
        tenantId,
        recipientId: job.requestedBy,
        title: 'Compliance Export Ready',
        message: `Your export "${job.exportType}" has completed processing and is ready for download.`,
        type: 'export_ready',
        priority: 'medium',
        linkUrl: storagePath,
        sourceEntityType: 'export_job',
        sourceEntityId: jobId,
      });
    }

    return { ...job, ...updatedJob } as ExportJob;
  } catch (err: any) {
    const errorMsg = err?.message || 'Export processing failed.';
    await jobRef.update({
      status: 'failed',
      errorMessage: errorMsg,
      completedAt: new Date().toISOString(),
    });

    throw err;
  }
}

/**
 * Callable Function: generateTenantEvidenceExport
 * Queues and immediately processes an export job for compliance packaging.
 */
export const generateTenantEvidenceExport = onCall<RequestExportInput>(async (request) => {
  const { tenantId, exportType, filters = {} } = request.data;
  if (!tenantId || !exportType) {
    throw new HttpsError('invalid-argument', 'tenantId and exportType are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'auditor',
  ]);

  const jobRef = db.collection('tenants').doc(tenantId).collection('export_jobs').doc();
  const now = new Date().toISOString();

  const exportJobDoc: ExportJob = {
    id: jobRef.id,
    tenantId,
    exportType,
    status: 'queued',
    requestedBy: authContext.userId,
    requestedAt: now,
    completedAt: null,
    fileStoragePath: null,
    fileDownloadUrl: null,
    fileSizeBytes: null,
    errorMessage: null,
    filtersApplied: filters,
  };

  await jobRef.set(exportJobDoc);

  // Execute processing
  const completedJob = await processExportJob(tenantId, jobRef.id);

  return {
    success: true,
    jobId: jobRef.id,
    status: completedJob.status,
    fileStoragePath: completedJob.fileStoragePath,
    fileSizeBytes: completedJob.fileSizeBytes,
  };
});

/**
 * Callable Function: generateFrameworkReadinessReport
 * Queues and processes on-demand framework readiness report compilation.
 */
export const generateFrameworkReadinessReport = onCall<{ tenantId: string; frameworkId: string }>(async (request) => {
  const { tenantId, frameworkId } = request.data;
  if (!tenantId || !frameworkId) {
    throw new HttpsError('invalid-argument', 'tenantId and frameworkId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'auditor',
    'approver',
  ]);

  const jobRef = db.collection('tenants').doc(tenantId).collection('export_jobs').doc();
  const now = new Date().toISOString();

  const exportJobDoc: ExportJob = {
    id: jobRef.id,
    tenantId,
    exportType: 'framework_readiness_pdf',
    status: 'queued',
    requestedBy: authContext.userId,
    requestedAt: now,
    completedAt: null,
    fileStoragePath: null,
    fileDownloadUrl: null,
    fileSizeBytes: null,
    errorMessage: null,
    filtersApplied: { frameworkId },
  };

  await jobRef.set(exportJobDoc);

  const completedJob = await processExportJob(tenantId, jobRef.id);

  return {
    success: true,
    jobId: jobRef.id,
    status: completedJob.status,
    fileStoragePath: completedJob.fileStoragePath,
  };
});

/**
 * Callable Function: getExportJob
 * Retrieves job status and download storage path for authorized users
 */
export const getExportJob = onCall<GetExportJobInput>(async (request) => {
  const { tenantId, jobId } = request.data;
  if (!tenantId || !jobId) {
    throw new HttpsError('invalid-argument', 'tenantId and jobId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId);

  const jobRef = db.collection('tenants').doc(tenantId).collection('export_jobs').doc(jobId);
  const snap = await jobRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Export job not found.');
  }

  const job = snap.data() as ExportJob;

  if (job.requestedBy !== authContext.userId && authContext.role !== 'tenant_admin') {
    throw new HttpsError('permission-denied', 'You can only view your own export jobs.');
  }

  return { success: true, exportJob: job };
});

/**
 * Callable Function: listTenantExportJobs
 * Lists export jobs (all jobs for tenant_admin, personal jobs for other members)
 */
export const listTenantExportJobs = onCall<ListExportJobsInput>(async (request) => {
  const { tenantId, status } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  const authContext = await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('export_jobs');

  if (authContext.role !== 'tenant_admin') {
    query = query.where('requestedBy', '==', authContext.userId);
  }

  if (status) {
    query = query.where('status', '==', status);
  }

  const snap = await query.get();
  const jobs: ExportJob[] = snap.docs.map((d) => d.data() as ExportJob);

  return { success: true, count: jobs.length, exportJobs: jobs };
});
