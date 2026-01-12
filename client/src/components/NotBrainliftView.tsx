import { useState } from 'react';
import { Link } from 'wouter';
import { BrainliftData } from '@shared/schema';
import { Share2, ChevronDown, AlertTriangle, FileText, Lightbulb } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface NotBrainliftViewProps {
  data: BrainliftData;
  isSharedView: boolean;
  toast: any;
}

export const NotBrainliftView = ({ data, isSharedView, toast }: NotBrainliftViewProps) => {
  const [debugExpanded, setDebugExpanded] = useState(false);

  return (
    <div
      className="p-6 sm:p-12 mt-6 rounded-xl"
      style={{ backgroundColor: tokens.surfaceAlt }}
    >
      <div className="flex flex-col items-center text-center mb-10">
        <div style={{
          padding: '20px',
          borderRadius: '50%',
          backgroundColor: tokens.warningSoft,
          marginBottom: '16px',
        }}>
          <AlertTriangle size={40} style={{ color: tokens.warning }} />
        </div>
        <h2 style={{
          fontSize: '28px',
          fontWeight: 600,
          color: tokens.textPrimary,
          marginBottom: '8px',
        }}>
          Not a Brainlift
        </h2>
        <p style={{ fontSize: '15px', color: tokens.textSecondary, maxWidth: '500px' }}>
          This document isn't a brainlift yet, but it can be converted
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ maxWidth: '900px', margin: '0 auto' }}>
        {data.rejectionSubtype && (
          <div style={{
            padding: '24px',
            backgroundColor: tokens.surface,
            borderRadius: '12px',
            border: `1px solid ${tokens.border}`,
          }}>
            <div style={{
              fontSize: '11px',
              color: tokens.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '12px',
              fontWeight: 600,
            }}>
              What It Is
            </div>
            <div style={{
              fontSize: '16px',
              color: tokens.textPrimary,
              fontWeight: 500,
              lineHeight: 1.5,
            }}>
              {data.rejectionSubtype}
            </div>
          </div>
        )}

        {data.rejectionReason && (
          <div style={{
            padding: '24px',
            backgroundColor: tokens.surface,
            borderRadius: '12px',
            border: `1px solid ${tokens.border}`,
          }}>
            <div style={{
              fontSize: '11px',
              color: tokens.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '12px',
              fontWeight: 600,
            }}>
              Why It Can't Be Graded
            </div>
            <div style={{
              fontSize: '14px',
              color: tokens.textPrimary,
              lineHeight: 1.7,
            }}>
              {data.rejectionReason}
            </div>
          </div>
        )}

        {data.rejectionRecommendation && (
          <div
            className="lg:col-span-2"
            style={{
              padding: '24px',
              backgroundColor: tokens.successSoft,
              borderRadius: '12px',
              border: `2px solid ${tokens.success}`,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={18} style={{ color: tokens.success }} />
              <div style={{
                fontSize: '11px',
                color: tokens.success,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}>
                How to Fix
              </div>
            </div>
            <div style={{
              fontSize: '14px',
              color: tokens.textPrimary,
              lineHeight: 1.7,
            }}>
              {data.rejectionRecommendation}
            </div>
          </div>
        )}

        {/* DEBUG Section for Not a Brainlift */}
        <div
          className="lg:col-span-2 mt-4 p-6 rounded-xl border transition-all duration-200"
          style={{
            backgroundColor: tokens.surface,
            borderColor: tokens.border
          }}
        >
          <button
            data-testid="button-toggle-debug-content-not-brainlift"
            onClick={() => setDebugExpanded(!debugExpanded)}
            className="w-full flex items-center justify-between group"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: debugExpanded ? tokens.primarySoft : tokens.surfaceAlt }}
              >
                <FileText
                  size={20}
                  style={{ color: debugExpanded ? tokens.primary : tokens.textSecondary }}
                />
              </div>
              <div className="text-left">
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: tokens.textPrimary, margin: 0 }}>
                  DEBUG: Extracted Raw Content
                </h3>
                <p style={{ fontSize: '12px', color: tokens.textSecondary, margin: '2px 0 0 0' }}>
                  {data.sourceType || 'Workflowy'} extraction result • {data.originalContent?.length || 0} characters
                </p>
              </div>
            </div>
            <div
              className="p-2 rounded-full transition-transform duration-200"
              style={{
                backgroundColor: tokens.surfaceAlt,
                transform: debugExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ChevronDown size={18} style={{ color: tokens.textSecondary }} />
            </div>
          </button>

          {debugExpanded && (
            <div className="mt-6 pt-6 border-t animate-in fade-in slide-in-from-top-2 duration-200" style={{ borderTop: `1px solid ${tokens.border}` }}>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(data.originalContent || '');
                    toast({ title: 'Copied to clipboard', description: 'Raw content has been copied.' });
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium hover-elevate"
                  style={{ backgroundColor: tokens.surfaceAlt, color: tokens.textSecondary, border: 'none', cursor: 'pointer' }}
                >
                  <Share2 size={14} />
                  Copy Raw Text
                </button>
              </div>
              <div
                className="p-4 rounded-lg overflow-x-auto font-mono text-xs leading-relaxed"
                style={{
                  backgroundColor: tokens.surfaceAlt,
                  color: tokens.textPrimary,
                  maxHeight: '400px',
                  overflowY: 'auto',
                  border: `1px solid ${tokens.border}`
                }}
              >
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'monospace' }}>
                  {data.originalContent || 'No raw content available.'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-10 pt-6" style={{ borderTop: `1px solid ${tokens.border}` }}>
        <Link href="/grading/knowledge-rich-curriculum">
          <button
            data-testid="button-view-example"
            className="hover-elevate active-elevate-2"
            style={{
              padding: '12px 24px',
              backgroundColor: tokens.surface,
              color: tokens.primary,
              borderRadius: '8px',
              border: `1px solid ${tokens.primary}`,
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <FileText size={16} />
            View Example Brainlift
          </button>
        </Link>
        {!isSharedView && (
          <Link href="/">
            <button
              data-testid="button-back-to-list"
              className="hover-elevate active-elevate-2"
              style={{
                padding: '12px 24px',
                backgroundColor: tokens.primary,
                color: tokens.onPrimary,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Back to List
            </button>
          </Link>
        )}
      </div>
    </div>
  );
};
