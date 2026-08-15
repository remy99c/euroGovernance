'use client';

import React, { useState } from 'react';

export interface FrameworkReadinessItem {
  id: string;
  name: string;
  badgeCode: string;
  badgeColor?: string;
  readyPercentage: number;
  requirementsCount: number;
  readyRequirementsCount: number;
  controlsCount: number;
  domain: string;
}

interface ComplianceOverviewCardsProps {
  frameworks?: FrameworkReadinessItem[];
  onSelectFramework?: (frameworkId: string) => void;
  title?: string;
}

export const DEFAULT_FRAMEWORKS: FrameworkReadinessItem[] = [
  {
    id: 'soc_2',
    name: 'SOC 2',
    badgeCode: 'AICPA\nSOC 2',
    badgeColor: '#2563eb',
    readyPercentage: 63,
    requirementsCount: 61,
    readyRequirementsCount: 38,
    controlsCount: 85,
    domain: 'Trust Services Criteria (Security, Availability, Confidentiality)',
  },
  {
    id: 'iso_27001',
    name: 'ISO 27001',
    badgeCode: 'ISO\n27001',
    badgeColor: '#2563eb',
    readyPercentage: 100,
    requirementsCount: 117,
    readyRequirementsCount: 117,
    controlsCount: 83,
    domain: 'Information Security Management System (ISMS)',
  },
  {
    id: 'gdpr',
    name: 'GDPR',
    badgeCode: '★ ★ ★\nGDPR\n★ ★ ★',
    badgeColor: '#2563eb',
    readyPercentage: 79,
    requirementsCount: 31,
    readyRequirementsCount: 24,
    controlsCount: 30,
    domain: 'EU General Data Protection Regulation (2016/679)',
  },
  {
    id: 'eu_ai_act',
    name: 'EU AI Act',
    badgeCode: 'EU AI\n2024',
    badgeColor: '#6366f1',
    readyPercentage: 71,
    requirementsCount: 48,
    readyRequirementsCount: 34,
    controlsCount: 42,
    domain: 'High-Risk AI System Conformity & Governance (2024/1689)',
  },
  {
    id: 'nis2',
    name: 'NIS2 Directive',
    badgeCode: 'NIS 2\nSUPPLY',
    badgeColor: '#0ea5e9',
    readyPercentage: 85,
    requirementsCount: 38,
    readyRequirementsCount: 32,
    controlsCount: 36,
    domain: 'Essential & Important Entity Cybersecurity (EU 2022/2555)',
  },
  {
    id: 'eu_data_act',
    name: 'EU Data Act',
    badgeCode: 'DATA\nACT',
    badgeColor: '#059669',
    readyPercentage: 60,
    requirementsCount: 25,
    readyRequirementsCount: 15,
    controlsCount: 22,
    domain: 'B2B/B2C Data Access & Switching Barriers (EU 2023/2854)',
  },
];

export default function ComplianceOverviewCards({
  frameworks = DEFAULT_FRAMEWORKS,
  onSelectFramework,
  title = 'Compliance Overview',
}: ComplianceOverviewCardsProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 3;
  const totalPages = Math.ceil(frameworks.length / itemsPerPage);

  const startIndex = currentPage * itemsPerPage;
  const currentItems = frameworks.slice(startIndex, startIndex + itemsPerPage);
  const rangeDisplay = `${startIndex + 1}-${Math.min(startIndex + itemsPerPage, frameworks.length)} of ${frameworks.length}`;

  const handlePrev = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages - 1) setCurrentPage(currentPage + 1);
  };

  const handleFirst = () => setCurrentPage(0);
  const handleLast = () => setCurrentPage(totalPages - 1);

  return (
    <div style={{ marginBottom: '28px' }}>
      {/* Header with Title & Navigation Pagination */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <h2
          style={{
            fontSize: '17px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>

        {/* Top Right Pagination Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', marginRight: '4px' }}>{rangeDisplay}</span>
          <button
            onClick={handleFirst}
            disabled={currentPage === 0}
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              color: currentPage === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 0 ? 0.4 : 1,
            }}
            title="First Page"
          >
            ««
          </button>
          <button
            onClick={handlePrev}
            disabled={currentPage === 0}
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              color: currentPage === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 0 ? 0.4 : 1,
            }}
            title="Previous Page"
          >
            ‹
          </button>
          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages - 1}
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              color: currentPage >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage >= totalPages - 1 ? 0.4 : 1,
            }}
            title="Next Page"
          >
            ›
          </button>
          <button
            onClick={handleLast}
            disabled={currentPage >= totalPages - 1}
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              color: currentPage >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage >= totalPages - 1 ? 0.4 : 1,
            }}
            title="Last Page"
          >
            »»
          </button>
        </div>
      </div>

      {/* Grid of 3 Framework Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
        }}
      >
        {currentItems.map((fw) => {
          const isComplete = fw.readyPercentage === 100;
          return (
            <div
              key={fw.id}
              onClick={() => onSelectFramework?.(fw.id)}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: onSelectFramework ? 'pointer' : 'default',
                transition: 'border-color 0.15s ease, transform 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-blue)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
            >
              <div>
                {/* Header: Badge Icon & Framework Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: fw.badgeColor || '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: '9px',
                      fontWeight: 700,
                      textAlign: 'center',
                      lineHeight: 1.1,
                      whiteSpace: 'pre-line',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      flexShrink: 0,
                    }}
                  >
                    {fw.badgeCode}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      {fw.name}
                    </h3>
                  </div>
                </div>

                {/* Progress Bar (Drata Green #10b981 on dark track) */}
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#1f2937',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: `${fw.readyPercentage}%`,
                      height: '100%',
                      backgroundColor: isComplete ? '#10b981' : '#10b981',
                      borderRadius: '9999px',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>

                {/* Metrics Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Ready Requirements</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {fw.readyPercentage}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Requirements</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {fw.requirementsCount}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Controls</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {fw.controlsCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
