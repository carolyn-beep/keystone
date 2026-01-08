import { AlertTriangle, Eye, Copy } from 'lucide-react';
import { tokens } from '@/lib/colors';

export interface RedundancyGroup {
  id: number;
  groupName: string;
  factIds: number[];
  primaryFactId: number | null;
  similarityScore: string;
  reason: string;
  status: string;
  facts: Array<{ id: number; originalId: string; fact: string; score: number }>;
}

export interface RedundancyGroupCardProps {
  group: RedundancyGroup;
  children: React.ReactNode;
  onReview: () => void;
}

export function RedundancyGroupCard({
  group,
  children,
  onReview,
}: RedundancyGroupCardProps) {
  return (
    <div style={{
      marginBottom: '28px',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    }}>
      {/* Alert Banner */}
      <div style={{
        background: `linear-gradient(135deg, ${tokens.warning} 0%, #d97706 100%)`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            backgroundColor: 'rgba(255,255,255,0.25)',
            borderRadius: '6px',
          }}>
            <Copy size={16} color="#fff" />
          </div>
          <div>
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Redundancy Found
            </span>
            <span style={{
              marginLeft: '10px',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.85)',
            }}>
              {group.facts.length} similar facts • {group.similarityScore} match
            </span>
          </div>
        </div>

        {/* Review Button */}
        <button
          onClick={onReview}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            backgroundColor: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#b45309',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fefce8';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <Eye size={14} />
          Review & Resolve
        </button>
      </div>

      {/* Reason Box */}
      <div style={{
        padding: '10px 16px',
        backgroundColor: tokens.warningSoft,
        borderLeft: `3px solid ${tokens.warning}`,
        borderBottom: `1px solid ${tokens.warning}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}>
        <AlertTriangle size={14} color={tokens.warning} style={{ marginTop: '2px', flexShrink: 0 }} />
        <p style={{
          margin: 0,
          fontSize: '13px',
          color: tokens.textSecondary,
          lineHeight: 1.5,
        }}>
          {group.reason}
        </p>
      </div>

      {/* Facts Container */}
      <div style={{
        backgroundColor: tokens.surface,
        borderLeft: `3px solid ${tokens.warning}`,
        borderRight: `1px solid ${tokens.border}`,
        borderBottom: `1px solid ${tokens.border}`,
        borderRadius: '0 0 12px 12px',
      }}>
        {children}
      </div>
    </div>
  );
}
