'use client';

import React from 'react';
import { UIEmptyState } from './ui-empty-state';

export interface ColumnDefinition {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface PaginationConfig {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export interface UIDataTableProps {
  columns: ColumnDefinition[];
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  pagination?: PaginationConfig;
  stickyHeader?: boolean;
  minWidth?: string;
}

export function UIDataTable({
  columns,
  children,
  isEmpty = false,
  emptyState,
  isLoading = false,
  pagination,
  stickyHeader = true,
  minWidth = '800px',
}: UIDataTableProps) {
  return (
    <div
      className="card-modern"
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Table Container */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className="table-modern" style={{ minWidth, width: '100%' }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    width: col.width,
                    textAlign: col.align || 'left',
                    position: stickyHeader ? 'sticky' : 'static',
                    top: 0,
                    zIndex: 10,
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}
                >
                  Loading compliance records...
                </td>
              </tr>
            ) : isEmpty ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 0 }}>
                  {emptyState || (
                    <UIEmptyState
                      icon="📊"
                      title="No Records Found"
                      description="No records match your active search or filter criteria."
                    />
                  )}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Summary Footer */}
      {pagination && !isEmpty && !isLoading && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--surface-subtle)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          <div className="font-tabular">
            Showing{' '}
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {Math.min((pagination.currentPage - 1) * pagination.pageSize + 1, pagination.totalItems)}
            </span>{' '}
            to{' '}
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)}
            </span>{' '}
            of{' '}
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {pagination.totalItems}
            </span>{' '}
            records
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage <= 1}
              className="btn-secondary"
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                opacity: pagination.currentPage <= 1 ? 0.5 : 1,
                cursor: pagination.currentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            <span className="font-tabular" style={{ fontWeight: 600, color: 'var(--text-primary)', padding: '0 4px' }}>
              Page {pagination.currentPage} of {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= pagination.totalPages}
              className="btn-secondary"
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                opacity: pagination.currentPage >= pagination.totalPages ? 0.5 : 1,
                cursor: pagination.currentPage >= pagination.totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
