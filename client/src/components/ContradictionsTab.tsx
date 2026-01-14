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
      <div className="flex items-start gap-4 mb-8 pb-6 border-b border-border">
        <div className="text-[32px] leading-none shrink-0">
          <AlertTriangle size={32} color={tokens.warning} />
        </div>
        <div>
          <h2 className="text-2xl font-bold m-0 mb-2 text-foreground">
            Conceptual Tensions
          </h2>
          <p className="text-[15px] text-muted-foreground m-0 leading-normal max-w-[600px]">
            These tensions highlight places where accurate facts pull in different directions.
            They are presented for awareness only and are not resolved here.
          </p>
        </div>
      </div>

      {contradictionClusters.length === 0 ? (
        <div className="text-center py-[60px] px-6 text-muted-foreground">
          <CheckCircle size={48} className="opacity-50 mb-4" />
          <h3 className="text-lg font-semibold text-foreground m-0 mb-2">
            No Contradictions Found
          </h3>
          <p className="m-0 text-sm">
            All facts in this brainlift are logically consistent.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {contradictionClusters.map((cluster, index) => (
            <div
              key={index}
              className="rounded-xl p-6 shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
                border: '1px solid #FDBA74',
                borderLeft: '4px solid #F97316'
              }}
            >
              {/* Cluster Header */}
              <div className="flex items-center gap-3 mb-4">
                <Zap size={20} color="#F97316" />
                <h3 className="text-lg font-semibold m-0 text-foreground">{cluster.name}</h3>
              </div>

              {/* Fact Badges */}
              <div className="flex flex-wrap gap-2 mb-5">
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
                    className="bg-white rounded-full px-3 py-1 text-[13px] font-medium cursor-pointer"
                    style={{
                      border: '1px solid #F97316',
                      color: '#C2410C'
                    }}
                    data-testid={`badge-fact-${factId}`}
                  >
                    {factId}
                  </button>
                ))}
              </div>

              {/* Section Label */}
              <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#6B7280' }}>
                Competing Claims
              </div>

              {/* Claims Grid */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 mb-5">
                {cluster.claims.map((claim, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg p-3 px-4 flex items-start gap-2.5"
                    style={{ border: '1px solid #E5E7EB' }}
                  >
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-semibold font-mono shrink-0"
                      style={{
                        background: '#F3F4F6',
                        color: '#6B7280'
                      }}
                    >
                      {cluster.factIds[i] || (i + 1)}
                    </span>
                    <p className="m-0 text-sm leading-normal" style={{ color: '#374151' }}>{claim}</p>
                  </div>
                ))}
              </div>

              {/* Tension Insight Box */}
              <div
                className="rounded-lg p-4"
                style={{
                  background: '#F0FDFA',
                  border: '1px solid #0D9488'
                }}
              >
                <div
                  className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2"
                  style={{ color: '#0D9488' }}
                >
                  <Lightbulb size={14} />
                  Interpretive Tension
                </div>
                <p className="m-0 text-sm leading-normal" style={{ color: '#115E59' }}>{cluster.tension}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
