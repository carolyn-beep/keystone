import { AlertTriangle, CheckCircle, Zap, Lightbulb } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface ContradictionCluster {
  name: string;
  tension: string;
  status: string;
  factIds: string[];
  claims: string[];
}

interface ContradictionsTabProps {
  contradictionClusters: ContradictionCluster[];
  setActiveTab: (tab: string) => void;
}

export function ContradictionsTab({ contradictionClusters, setActiveTab }: ContradictionsTabProps) {
  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Page Header with icon */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        marginBottom: '32px',
        paddingBottom: '24px',
        borderBottom: `1px solid ${tokens.border}`,
      }}>
        <div style={{ fontSize: '32px', lineHeight: 1, flexShrink: 0 }}>
          <AlertTriangle size={32} color={tokens.warning} />
        </div>
        <div>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 700,
            margin: '0 0 8px 0',
            color: tokens.textPrimary,
          }}>
            Conceptual Tensions
          </h2>
          <p style={{
            fontSize: '15px',
            color: tokens.textSecondary,
            margin: 0,
            lineHeight: 1.6,
            maxWidth: '600px',
          }}>
            These tensions highlight places where accurate facts pull in different directions.
            They are presented for awareness only and are not resolved here.
          </p>
        </div>
      </div>

      {contradictionClusters.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 24px',
          color: tokens.textMuted,
        }}>
          <CheckCircle size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: tokens.textPrimary, margin: '0 0 8px 0' }}>
            No Contradictions Found
          </h3>
          <p style={{ margin: 0, fontSize: '14px' }}>
            All facts in this brainlift are logically consistent.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {contradictionClusters.map((cluster, index) => (
            <div
              key={index}
              style={{
                background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
                border: '1px solid #FDBA74',
                borderLeft: '4px solid #F97316',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              }}
            >
              {/* Cluster Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <Zap size={20} color="#F97316" />
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  margin: 0,
                  color: tokens.textPrimary,
                }}>{cluster.name}</h3>
              </div>

              {/* Fact Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {cluster.factIds.map((factId, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveTab('grading');
                      setTimeout(() => {
                        const el = document.getElementById(`fact-${factId}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 100);
                    }}
                    style={{
                      background: 'white',
                      border: '1px solid #F97316',
                      color: '#C2410C',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                    data-testid={`badge-fact-${factId}`}
                  >
                    {factId}
                  </button>
                ))}
              </div>

              {/* Section Label */}
              <div style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#6B7280',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '12px',
              }}>
                Competing Claims
              </div>

              {/* Claims Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}>
                {cluster.claims.map((claim, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <span style={{
                      background: '#F3F4F6',
                      color: '#6B7280',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      flexShrink: 0,
                    }}>
                      {cluster.factIds[i] || (i + 1)}
                    </span>
                    <p style={{
                      margin: 0,
                      fontSize: '14px',
                      color: '#374151',
                      lineHeight: 1.5,
                    }}>{claim}</p>
                  </div>
                ))}
              </div>

              {/* Tension Insight Box */}
              <div style={{
                background: '#F0FDFA',
                border: '1px solid #0D9488',
                borderRadius: '8px',
                padding: '16px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0D9488',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '8px',
                }}>
                  <Lightbulb size={14} />
                  Interpretive Tension
                </div>
                <p style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#115E59',
                  lineHeight: 1.6,
                }}>{cluster.tension}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
