import { useState } from 'react';
import { Link } from 'wouter';
import { Check, AlertTriangle, RefreshCw, Download, Share2, History } from 'lucide-react';
import { BrainliftData, BrainliftVersion } from '@shared/schema';
import { tokens } from '@/lib/colors';
import type { UseMutationResult } from '@tanstack/react-query';

interface DashboardHeaderProps {
  data: BrainliftData;
  isSharedView: boolean;
  isNotBrainlift: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  versions: BrainliftVersion[];
  copied: boolean;
  editingAuthor: boolean;
  setEditingAuthor: (editing: boolean) => void;
  authorInput: string;
  setAuthorInput: (input: string) => void;
  updateAuthorMutation: UseMutationResult<any, Error, string>;
  setShowUpdateModal: (show: boolean) => void;
  setShowHistoryModal: (show: boolean) => void;
  handleDownloadPDF: () => void;
  handleCopyLink: () => void;
}

export function DashboardHeader({
  data,
  isSharedView,
  isNotBrainlift,
  activeTab,
  setActiveTab,
  versions,
  copied,
  editingAuthor,
  setEditingAuthor,
  authorInput,
  setAuthorInput,
  updateAuthorMutation,
  setShowUpdateModal,
  setShowHistoryModal,
  handleDownloadPDF,
  handleCopyLink,
}: DashboardHeaderProps) {
  const { title, description } = data;

  return (
    <header
      className="px-4 pt-4 sm:px-8 md:px-12"
      style={{ backgroundColor: tokens.surface }}
    >
      {/* Row 1: Back Link */}
      {!isSharedView && (
        <Link href="/" style={{
          color: tokens.textSecondary,
          textDecoration: 'none',
          fontSize: '13px',
          display: 'inline-block',
          marginBottom: '8px',
        }}>
          ← All Brainlifts
        </Link>
      )}

      {/* Row 2: Identity Block - Title only, no buttons */}
      <h1 style={{
        fontSize: '26px',
        fontWeight: 700,
        margin: 0,
        color: tokens.textPrimary,
        letterSpacing: '-0.02em',
        lineHeight: 1.3,
      }}>{title}</h1>

      {/* Row 3: Subtitle */}
      <p style={{
        color: tokens.textSecondary,
        fontSize: '14px',
        margin: '6px 0 0 0',
      }}>{description}</p>

      {/* Row 4: Author */}
      <div
        style={{
          margin: '4px 0 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: editingAuthor ? 'text' : 'pointer',
        }}
        onClick={() => {
          if (!editingAuthor) {
            setAuthorInput(data.author || '');
            setEditingAuthor(true);
          }
        }}
        title={editingAuthor ? undefined : "Click to set owner name"}
      >
        <span style={{ color: tokens.textMuted, fontSize: '13px' }}>By</span>
        {editingAuthor ? (
          <input
            type="text"
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && authorInput.trim()) {
                updateAuthorMutation.mutate(authorInput.trim());
              }
              if (e.key === 'Escape') setEditingAuthor(false);
            }}
            onBlur={() => {
              if (authorInput.trim()) {
                updateAuthorMutation.mutate(authorInput.trim());
              } else {
                setEditingAuthor(false);
              }
            }}
            autoFocus
            placeholder="Enter name..."
            style={{
              border: 'none',
              borderBottom: '1px solid #D1D5DB',
              background: 'transparent',
              padding: '2px 0',
              fontSize: '13px',
              width: '150px',
              outline: 'none',
              color: tokens.textPrimary,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="owner-name-hover"
            style={{
              color: data.author ? tokens.textMuted : '#9CA3AF',
              fontStyle: data.author ? 'normal' : 'italic',
              borderBottom: data.author ? 'none' : '1px dashed #D1D5DB',
              paddingBottom: data.author ? 0 : '1px',
              transition: 'all 0.15s ease',
            }}
          >
            {data.author || 'Set Owner Name...'}
          </span>
        )}
      </div>

      {/* Row 5: Status Rail - Classification badge with checkmark */}
      <div style={{ marginTop: '12px' }}>
            {data.classification === 'brainlift' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                backgroundColor: tokens.successSoft,
                color: tokens.success,
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                <Check size={14} />
                Brainlift · DOK1 Graded
              </span>
            ) : data.classification === 'partial' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                backgroundColor: tokens.warningSoft,
                color: tokens.warning,
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                <AlertTriangle size={14} />
                Partial Brainlift
              </span>
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                backgroundColor: tokens.warningSoft,
                color: tokens.warning,
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                <AlertTriangle size={14} />
                Not a Brainlift
              </span>
            )}
      </div>

      {/* Row 6: Navigation Tabs (left) + Actions (right) */}
      <div
        className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 sm:gap-0"
        style={{
          marginTop: '16px',
          borderBottom: `1px solid ${tokens.border}`,
        }}
      >
        {/* Navigation Tabs - Left aligned, flat underline style */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {!isNotBrainlift && ['brainlift', 'grading', 'contradictions', 'reading'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
              style={{
                padding: '12px 20px',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? `2px solid ${tokens.primary}` : '2px solid transparent',
                color: activeTab === tab ? tokens.primary : tokens.textSecondary,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'color 0.15s ease',
                marginBottom: '-1px',
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.color = tokens.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.color = tokens.textSecondary;
                }
              }}
            >
              {tab === 'brainlift' && 'Brainlift'}
              {tab === 'grading' && 'Fact Grading'}
              {tab === 'verification' && 'AI Verification'}
              {tab === 'analytics' && 'Analytics'}
              {tab === 'contradictions' && 'Contradictions'}
              {tab === 'reading' && 'Reading List'}
            </button>
          ))}
        </div>

        {/* Action Cluster - Right aligned */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingBottom: '8px', flexWrap: 'wrap' }}>
          {/* Primary Action: Update */}
          {!isSharedView && !isNotBrainlift && (
            <button
              data-testid="button-update-brainlift"
              onClick={() => setShowUpdateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: tokens.primary,
                color: tokens.surface,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <RefreshCw size={14} />
              Update
            </button>
          )}

          {/* Secondary Actions: Ghost buttons */}
          {!isNotBrainlift && (
            <button
              data-testid="button-download-pdf"
              onClick={handleDownloadPDF}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: tokens.textSecondary,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = tokens.textPrimary}
              onMouseLeave={(e) => e.currentTarget.style.color = tokens.textSecondary}
            >
              <Download size={14} />
              PDF
            </button>
          )}

          <button
            data-testid="button-copy-link"
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: copied ? tokens.success : 'transparent',
              color: copied ? tokens.surface : tokens.textSecondary,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = tokens.textPrimary; }}
            onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = tokens.textSecondary; }}
          >
            {copied ? <Check size={14} /> : <Share2 size={14} />}
            {copied ? 'Copied!' : 'Share'}
          </button>

          {/* History button */}
          {!isSharedView && !isNotBrainlift && versions.length > 0 && (
            <button
              data-testid="button-view-history"
              onClick={() => setShowHistoryModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'transparent',
                color: tokens.textSecondary,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = tokens.textPrimary}
              onMouseLeave={(e) => e.currentTarget.style.color = tokens.textSecondary}
            >
              <History size={14} />
              History
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
