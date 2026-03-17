import { Lock, CheckCircle2, Circle } from 'lucide-react';
import type { NativePhaseProgress, BuilderPhaseStatus } from '@shared/schema';
import type { BuilderPhase } from '@/hooks/useBuilderNav';
import { tokens } from '@/lib/colors';

const PHASE_LABELS: Record<BuilderPhase, string> = {
  1: 'Topic & Purpose',
  2: 'Experts',
  3: 'Content',
  4: 'Structure',
  5: 'Review',
};

const STATUS_CONFIG: Record<BuilderPhaseStatus, {
  label: string;
  badgeClass: string;
  badgeStyle?: React.CSSProperties;
}> = {
  complete: {
    label: 'COMPLETE',
    badgeClass: 'bg-success-soft',
    badgeStyle: { color: tokens.success },
  },
  in_progress: {
    label: 'IN PROGRESS',
    badgeClass: 'bg-info-soft',
    badgeStyle: { color: tokens.info },
  },
  not_started: {
    label: 'NOT STARTED',
    badgeClass: 'bg-muted',
  },
  locked: {
    label: 'LOCKED',
    badgeClass: 'bg-muted',
  },
};

interface PhaseOverviewProps {
  phaseProgress: NativePhaseProgress;
  onSelectPhase: (phase: BuilderPhase) => void;
}

export function PhaseOverview({ phaseProgress, onSelectPhase }: PhaseOverviewProps) {
  const phases: BuilderPhase[] = [1, 2, 3, 4, 5];

  return (
    <div className="py-10 px-2">
      <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0 mb-2">
        Builder Overview
      </h2>
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-10">
        Your brainlift is built in five phases. Complete each phase to create a comprehensive knowledge base.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {phases.map((phase) => {
          const key = `phase${phase}` as keyof NativePhaseProgress;
          const status = phaseProgress[key];
          const isLocked = status === 'locked';
          const config = STATUS_CONFIG[status];

          return (
            <button
              key={phase}
              onClick={() => !isLocked && onSelectPhase(phase)}
              disabled={isLocked}
              className={`text-left rounded-xl p-0 border-none transition-all duration-300 ${
                isLocked
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:shadow-card-hover'
              } shadow-card bg-card-elevated`}
            >
              <div className="px-8 py-8">
                {/* Phase number */}
                <div className="flex items-center justify-between mb-6">
                  <span className="font-serif text-[42px] leading-none text-muted-light font-normal tracking-wide">
                    {phase}
                  </span>
                  {isLocked && (
                    <Lock size={16} className="text-muted-foreground" />
                  )}
                  {status === 'complete' && (
                    <CheckCircle2 size={16} style={{ color: tokens.success }} />
                  )}
                  {(status === 'in_progress' || status === 'not_started') && (
                    <Circle size={16} style={{ color: tokens.info }} />
                  )}
                </div>

                {/* Phase label */}
                <div className="text-[15px] font-semibold text-foreground mb-3">
                  {PHASE_LABELS[phase]}
                </div>

                {/* Status badge */}
                <span
                  className={`inline-block px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${config.badgeClass} ${
                    !config.badgeStyle ? 'text-muted-foreground' : ''
                  }`}
                  style={config.badgeStyle}
                >
                  {config.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
