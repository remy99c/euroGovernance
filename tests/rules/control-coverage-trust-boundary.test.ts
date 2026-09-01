import { readFileSync } from 'node:fs';
import {
  buildControlCoverageSummary,
  computeTenantFrameworkCoverage,
  Framework,
  Requirement,
  TenantApplicabilityDecision,
  TenantControlInstance,
  TenantRequirementInstance,
} from '@eurogovernance/shared-types';

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const now = '2026-08-30T12:00:00.000Z';
const framework: Framework = {
  id: 'iso_27001',
  code: 'ISO 27001',
  name: 'ISO/IEC 27001',
  version: '2022',
  category: 'security',
  jurisdiction: 'International',
  type: 'international_standard',
  status: 'active',
  description: 'Information security management',
  officialReferenceUrl: 'https://www.iso.org/',
  totalRequirementsCount: 2,
  totalMasterControlsCount: 1,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
};

const requirements: Requirement[] = [
  {
    id: 'req_access',
    frameworkId: framework.id,
    sectionCode: 'A.5.15',
    title: 'Access control',
    description: 'Control logical and physical access.',
    guidanceText: 'Operate access control.',
    category: 'security',
    isMandatory: true,
    parentRequirementId: null,
    sortOrder: 1,
  },
  {
    id: 'req_supplier',
    frameworkId: framework.id,
    sectionCode: 'A.5.19',
    title: 'Supplier relationships',
    description: 'Manage supplier security risks.',
    guidanceText: 'Operate supplier controls.',
    category: 'security',
    isMandatory: true,
    parentRequirementId: null,
    sortOrder: 2,
  },
];

function control(
  id: string,
  requirementIds: string[],
  overrides: Partial<TenantControlInstance> = {}
): TenantControlInstance {
  return {
    id,
    tenantId: 'tenant_coverage_boundary',
    ownerId: 'manager_01',
    masterControlId: null,
    code: id.toUpperCase(),
    title: `Control ${id}`,
    description: 'A sufficiently detailed control description for coverage testing.',
    domain: 'security',
    frameworkIds: [framework.id],
    requirementIds,
    status: 'implemented',
    healthScore: 100,
    enforcementMechanism: 'hybrid',
    reviewFrequencyDays: 90,
    lastReviewDate: '2026-08-01T00:00:00.000Z',
    nextReviewDate: '2999-01-01T00:00:00.000Z',
    implementationNotes: 'Implemented and tested.',
    isHarmonized: false,
    canonicalMappingIds: [],
    createdAt: now,
    updatedAt: now,
    createdBy: 'manager_01',
    updatedBy: 'manager_01',
    workflowTrust: 'authoritative',
    assuranceStatus: 'effective',
    currentArtifactVerified: true,
    assuranceTrusted: true,
    lastReviewId: 'review_01',
    lastReviewDecisionCommandId: 'command_01',
    ...overrides,
  } as TenantControlInstance;
}

describe('Control coverage trust boundary', () => {
  test('a mapping defaults to zero assured coverage without a server verification result', () => {
    const report = buildControlCoverageSummary(
      control('control_access', ['req_access']),
      requirements,
      undefined,
      [framework]
    );

    expect(report.totalObligationsMapped).toBe(1);
    expect(report.totalObligationsSatisfied).toBe(0);
    expect(report.currentArtifactVerified).toBe(false);
    expect(report.assuranceTrusted).toBe(false);
    expect(report.healthScore).toBe(0);
    expect(report.obligations[0]).toMatchObject({
      mappingCoverageRatio: 1,
      coverageRatio: 0,
      countsAsCovered: false,
      assuranceStatus: 'mapping_unverified',
    });
    expect(report.coverageSummaryExplanation).toContain('none count as covered');
  });

  test('a verified current assurance context can count an explicit mapping as covered', () => {
    const report = buildControlCoverageSummary(
      control('control_access', ['req_access']),
      requirements,
      undefined,
      [framework],
      {
        currentArtifactVerified: true,
        assuranceTrusted: true,
        assuranceReason: 'authoritative',
      }
    );

    expect(report.totalObligationsSatisfied).toBe(1);
    expect(report.obligations[0]).toMatchObject({
      coverageRatio: 1,
      countsAsCovered: true,
      assuranceStatus: 'assured_current',
    });
  });

  test('readiness counts covered requirements, not unrelated or duplicate controls', () => {
    const decisions = requirements.map(
      (requirement, index) =>
        ({
          id: `decision_${index}`,
          tenantId: 'tenant_coverage_boundary',
          ownerId: 'manager_01',
          requirementId: requirement.id,
          frameworkId: framework.id,
          sectionCode: requirement.sectionCode,
          requirementTitle: requirement.title,
          isApplicable: true,
          status: 'applicable',
          applicabilityType: 'rule_derived',
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'The adopted standard is in scope.',
          overrideReason: null,
          overrideRationale: null,
          previousStatus: null,
          assessedBy: 'manager_01',
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: 'manager_01',
          updatedBy: 'manager_01',
        }) as TenantApplicabilityDecision
    );
    const requirementInstances = requirements.map(
      (requirement, index) =>
        ({
          id: `instance_${index}`,
          tenantId: 'tenant_coverage_boundary',
          ownerId: 'manager_01',
          requirementId: requirement.id,
          frameworkId: framework.id,
          sectionCode: requirement.sectionCode,
          title: requirement.title,
          description: requirement.description,
          category: requirement.category,
          status: 'active',
          isMandatory: true,
          applicabilityDecisionId: `decision_${index}`,
          complianceStatus: 'compliant',
          // Deliberately forged legacy inverse links must not drive readiness.
          satisfyingControlIds: ['control_unrelated'],
          primaryAssigneeId: null,
          department: 'Compliance',
          lastAssessmentDate: null,
          nextAssessmentDate: null,
          assessmentNotes: '',
          createdAt: now,
          updatedAt: now,
          createdBy: 'manager_01',
          updatedBy: 'manager_01',
        }) as TenantRequirementInstance
    );
    const coverage = computeTenantFrameworkCoverage({
      tenantId: 'tenant_coverage_boundary',
      adoptedFrameworkIds: [framework.id],
      frameworks: [framework],
      requirements,
      decisions,
      requirementInstances,
      controls: [
        control('control_access', ['req_access']),
        control('control_access_duplicate', ['req_access']),
        control('control_unrelated', ['req_not_in_framework']),
        control('control_supplier_unassured', ['req_supplier'], {
          workflowTrust: 'legacy_unverified',
          assuranceStatus: 'untested',
        } as Partial<TenantControlInstance>),
      ],
    });

    const metrics = coverage.frameworks[0]!;
    expect(metrics.implementedControlsCount).toBe(3);
    expect(metrics.coveredRequirementsCount).toBe(1);
    expect(metrics.openGapsCount).toBe(1);
    expect(metrics.readinessPercentage).toBe(50);
    expect(coverage.totalCoveredRequirementsCount).toBe(1);
    expect(coverage.overallReadinessScore).toBe(50);
  });

  test('conditional and inherited obligations remain in the readiness denominator', () => {
    const decisions = requirements.map(
      (requirement, index) =>
        ({
          id: `decision_scope_${index}`,
          tenantId: 'tenant_coverage_boundary',
          ownerId: 'manager_01',
          requirementId: requirement.id,
          frameworkId: framework.id,
          sectionCode: requirement.sectionCode,
          requirementTitle: requirement.title,
          isApplicable: true,
          status: index === 0 ? 'conditionally_applicable' : 'inherited',
          applicabilityType: 'rule_derived',
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'The obligation remains in scope.',
          overrideReason: null,
          overrideRationale: null,
          previousStatus: null,
          assessedBy: 'manager_01',
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: 'manager_01',
          updatedBy: 'manager_01',
        }) as TenantApplicabilityDecision
    );
    const coverage = computeTenantFrameworkCoverage({
      tenantId: 'tenant_coverage_boundary',
      adoptedFrameworkIds: [framework.id],
      frameworks: [framework],
      requirements,
      decisions,
      requirementInstances: [],
      controls: [],
    });

    expect(coverage.totalApplicableCount).toBe(1);
    expect(coverage.frameworks[0]?.inheritedRequirementsCount).toBe(1);
    expect(coverage.totalOpenGapsCount).toBe(2);
    expect(coverage.overallReadinessScore).toBe(0);
  });

  test('authoritative-looking fields cannot count without an explicit server verification projection', () => {
    const decision = {
      id: 'decision_access',
      tenantId: 'tenant_coverage_boundary',
      ownerId: 'manager_01',
      requirementId: 'req_access',
      frameworkId: framework.id,
      sectionCode: 'A.5.15',
      requirementTitle: 'Access control',
      isApplicable: true,
      status: 'applicable',
      applicabilityType: 'rule_derived',
      matchedRuleId: null,
      ruleEvaluationSummary: null,
      rationale: 'The adopted standard is in scope.',
      overrideReason: null,
      overrideRationale: null,
      previousStatus: null,
      assessedBy: 'manager_01',
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: 'manager_01',
      updatedBy: 'manager_01',
    } as TenantApplicabilityDecision;
    const forgedShape = control('control_shape_only', ['req_access'], {
      workflowTrust: 'authoritative',
      assuranceStatus: 'effective',
      currentArtifactVerified: false,
      assuranceTrusted: false,
    } as Partial<TenantControlInstance>);
    const coverage = computeTenantFrameworkCoverage({
      tenantId: 'tenant_coverage_boundary',
      adoptedFrameworkIds: [framework.id],
      frameworks: [framework],
      requirements: [requirements[0]!],
      decisions: [decision],
      requirementInstances: [],
      controls: [forgedShape],
    });

    expect(coverage.totalCoveredRequirementsCount).toBe(0);
    expect(coverage.overallReadinessScore).toBe(0);
    expect(coverage.totalOpenGapsCount).toBe(1);
  });

  test('legacy callable projections are App Check protected, bounded, and fail closed', () => {
    const handler = source('functions/src/handlers/applicability.ts');
    const listStart = handler.indexOf('export const listTenantControlInstances');
    const reportStart = handler.indexOf('export const getTenantControlCoverageReport');
    const mappingsStart = handler.indexOf('export const listTenantControlMappings');
    const listSource = handler.slice(listStart, reportStart);
    const reportSource = handler.slice(reportStart, mappingsStart);
    const mappingSource = handler.slice(mappingsStart);

    expect(listSource).toContain('AUTHORITATIVE_CALLABLE_OPTIONS');
    expect(listSource).toContain('verifyControlCurrentArtifact');
    expect(listSource).toContain('.limit(pageSize + 1)');
    expect(listSource).toContain('truthfulControlProjection');
    expect(listSource).not.toContain('...document.data()');
    expect(reportSource).toContain('AUTHORITATIVE_CALLABLE_OPTIONS');
    expect(reportSource).toContain('verifyControlCurrentArtifact');
    expect(reportSource).toContain('assuranceTrusted: trust.assuranceTrusted');
    expect(mappingSource).toContain("verificationStatus: 'legacy_unverified'");
    expect(mappingSource).toContain('coverageRatio: 0');

    const frameworkGenerator = source('functions/src/handlers/frameworks.ts');
    const applicabilityGenerator = handler.slice(
      handler.indexOf('export const instantiateTenantFrameworkControls'),
      listStart
    );
    expect(frameworkGenerator).toContain('AUTHORITATIVE_CALLABLE_OPTIONS');
    expect(frameworkGenerator).toContain('await db.runTransaction');
    expect(frameworkGenerator).toContain('transaction.create(targetRef, control)');
    expect(frameworkGenerator).toContain('requirementIds: template.requirementIds');
    expect(frameworkGenerator).toContain("adoption.status === 'retired'");
    expect(frameworkGenerator).toContain("summary_metrics/current");
    expect(applicabilityGenerator).toContain('AUTHORITATIVE_CALLABLE_OPTIONS');
    expect(applicabilityGenerator).toContain('await db.runTransaction');
    expect(applicabilityGenerator).toContain('transaction.create(controlRefs[index]!, safeControl)');
    expect(applicabilityGenerator).toContain(
      'An adopted framework was retired or changed while controls were being generated.'
    );
    expect(applicabilityGenerator).toContain(
      'memberships/${ownerId}'
    );
    expect(applicabilityGenerator).toContain('summary_metrics/current');

    const metrics = source('functions/src/handlers/metrics.ts');
    expect(metrics).toContain(
      'const overallComplianceScore = coverage.overallReadinessScore'
    );
    expect(metrics).toContain('async function boundedSnapshot');
    expect(metrics).toContain('metricsSourceFingerprint(currentSources) !== sourceFingerprint');
    expect(metrics).toContain('MAX_MATERIALIZED_METRICS_AGE_MS');
    expect(metrics).toContain('verifyControlCurrentArtifact(tenantId, document, calculationAsOf)');
    expect(metrics).toContain("['in_scoping', 'adopted', 'active', 'under_audit']");
    expect(metrics).not.toContain("collection('risks').get()");

    const exportsHandler = source('functions/src/handlers/exports.ts');
    expect(exportsHandler).toContain(
      'control.requirementIds.includes(dec.requirementId)'
    );
    expect(exportsHandler).not.toContain(
      'satisfyingControlIds.includes(control.id)'
    );
    expect(exportsHandler).toContain('boundedExportSnapshot');
    expect(exportsHandler).toContain("dec.status === 'conditionally_applicable'");
    expect(exportsHandler).toContain("relationshipAuthority: 'verified_control_requirement_ids'");
    expect(exportsHandler).toContain('projectControlAssuranceSummary');
  });

  test('processor-control assurance cannot bypass governed linkage or legacy trust quarantine', () => {
    const handler = source(
      'functions/src/handlers/processor-certifications.ts'
    );
    expect(handler).toContain(
      'Control links must be changed through linkProcessorCertificationToControls.'
    );
    expect(handler).toContain("reviewStatus: 'pending'");
    expect(handler).toContain('boundedProcessorAssuranceSnapshot');
    expect(handler).toContain('AUTHORITATIVE_CALLABLE_OPTIONS');

    const processors = source('packages/shared-types/src/processors.ts');
    expect(processors).toContain('const workflowVerified = false');
    expect(processors).toContain(
      'e.processorCertificationIds.includes(cert.id)'
    );
    expect(processors).toContain('verification.storageGeneration.length > 0');
  });
});
