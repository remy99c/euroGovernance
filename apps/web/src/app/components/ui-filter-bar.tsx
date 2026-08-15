'use client';

import React from 'react';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterDefinition {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export interface FilterTabItem {
  id: string;
  label: string;
  count?: number;
}

export interface UIFilterBarProps {
  // Tabs above toolbar
  tabs?: FilterTabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;

  // Search
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;

  // Filters Dropdowns
  filters?: FilterDefinition[];

  // Quick reset
  onResetFilters?: () => void;
  hasActiveFilters?: boolean;

  // Right-aligned custom actions
  actions?: React.ReactNode;
}

export function UIFilterBar({
  tabs,
  activeTab,
  onTabChange,
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search records by name, ID, or tag...',
  filters = [],
  onResetFilters,
  hasActiveFilters,
  actions,
}: UIFilterBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
      {/* 1. Optional Tabs Above Table */}
      {tabs && tabs.length > 0 && onTabChange && (
        <div
          style={{
            display: 'flex',
            gap: '6px',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '2px',
          }}
        >
          {tabs.map((tab) => {
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: isTabActive ? 700 : 500,
                  color: isTabActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottom: isTabActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'color 0.15s ease, border-color 0.15s ease',
                  marginBottom: '-1px',
                }}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className="font-tabular"
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: isTabActive ? 'var(--accent-primary-subtle)' : 'var(--surface-subtle)',
                      color: isTabActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                      border: `1px solid ${isTabActive ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. Compact Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left Side: Search + Dropdown Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
          {onSearchChange && (
            <div style={{ position: 'relative', minWidth: '260px', maxWidth: '380px', flex: 1 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="input-modern"
                style={{
                  width: '100%',
                  paddingLeft: '32px',
                  fontSize: '12.5px',
                  height: '36px',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              >
                🔍
              </span>
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Filter Dropdowns */}
          {filters.map((filter) => (
            <div key={filter.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <select
                value={filter.value}
                onChange={(e) => filter.onChange(e.target.value)}
                className="input-modern"
                style={{
                  height: '36px',
                  fontSize: '12px',
                  fontWeight: filter.value !== 'all' && filter.value !== 'ALL' && filter.value !== '' ? 700 : 500,
                  padding: '6px 10px',
                  backgroundColor:
                    filter.value !== 'all' && filter.value !== 'ALL' && filter.value !== ''
                      ? 'var(--surface-l3-elevated)'
                      : 'var(--surface-subtle)',
                  borderColor:
                    filter.value !== 'all' && filter.value !== 'ALL' && filter.value !== ''
                      ? 'var(--accent-primary)'
                      : 'var(--border-default)',
                }}
              >
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* Reset Filters Trigger */}
          {hasActiveFilters && onResetFilters && (
            <button
              onClick={onResetFilters}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--accent-primary)',
                background: 'none',
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Right Side Actions Slot */}
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
      </div>
    </div>
  );
}
