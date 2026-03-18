import { Pencil, Users, TreePine, Link2, Shield, Check, Lock } from 'lucide-react';
import type { NativePhaseProgress, BuilderPhaseStatus } from '@shared/schema';
import type { BuilderPhase } from '@/hooks/useBuilderNav';
import { tokens } from '@/lib/colors';

const PHASE_CONFIG: Record<BuilderPhase, {
  label: string;
  icon: typeof Pencil;
  description: string;
}> = {
  1: {
    label: 'You & Your Mission',
    icon: Pencil,
    description: 'Defining the core thesis and your personal alignment with it.',
  },
  2: {
    label: 'Your Experts',
    icon: Users,
    description: 'Identifying and cataloging the master figures within your domain.',
  },
  3: {
    label: 'Knowledge Tree',
    icon: TreePine,
    description: 'The hierarchical arrangement of acquired insights and logical structures.',
  },
  4: {
    label: 'Connections',
    icon: Link2,
    description: 'Cross-source patterns that no single expert contains alone.',
  },
  5: {
    label: 'Your Stance',
    icon: Shield,
    description: 'Integration of various disciplines into a cohesive and original worldview.',
  },
};

interface BuilderProgressTrackerProps {
  phaseProgress: NativePhaseProgress;
  activeScreen: BuilderPhase;
  onSelectPhase: (phase: BuilderPhase) => void;
}

export function BuilderProgressTracker({
  phaseProgress,
  activeScreen,
  onSelectPhase,
}: BuilderProgressTrackerProps) {
  const phases: BuilderPhase[] = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col pt-4 sm:pt-8 md:pt-12 px-4 sm:px-8 md:px-12 h-full">
      <div className="flex flex-col flex-1">
        {phases.map((phase, idx) => {
          const key = `phase${phase}` as keyof NativePhaseProgress;
          const status: BuilderPhaseStatus = phaseProgress[key];
          const nextKey = idx < phases.length - 1
            ? `phase${phases[idx + 1]}` as keyof NativePhaseProgress
            : null;
          const nextStatus: BuilderPhaseStatus | null = nextKey ? phaseProgress[nextKey] : null;
          const isActive = activeScreen === phase;
          const isComplete = status === 'complete';
          const isLocked = status === 'locked' || status === 'not_started';
          const isLast = idx === phases.length - 1;
          const config = PHASE_CONFIG[phase];
          const Icon = config.icon;

          // Connector below this circle is "filled" if this phase is complete
          const connectorFilled = isComplete;

          return (
            <div key={phase} className="flex items-stretch gap-4" style={{ flex: 1 }}>
              {/* Left column: circle + connector line */}
              <div className="flex flex-col items-center w-14 shrink-0">
                {/* Circle */}
                <button
                  onClick={() => !isLocked && onSelectPhase(phase)}
                  disabled={isLocked && status === 'locked'}
                  className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 border-none p-0"
                  style={{
                    backgroundColor: tokens.bg,
                    border: isActive
                      ? `2.5px solid ${tokens.primary}`
                      : isComplete
                        ? `2px solid ${tokens.borderStrong}`
                        : `1.5px solid ${tokens.border}`,
                    boxShadow: isActive
                      ? `0 0 0 4px ${tokens.primary}12`
                      : isComplete
                        ? '0 1px 4px rgba(0,0,0,0.07)'
                        : 'none',
                    cursor: isLocked ? 'not-allowed' : isActive ? 'default' : 'pointer',
                  }}
                >
                  <Icon
                    size={20}
                    strokeWidth={1.5}
                    style={{
                      color: isActive
                        ? tokens.primary
                        : isComplete
                          ? tokens.textPrimary
                          : tokens.textMuted,
                      opacity: isLocked ? 0.4 : 1,
                    }}
                  />
                  {isComplete && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                      style={{ backgroundColor: tokens.success }}
                    >
                      <Check size={10} strokeWidth={2.5} color="#fff" />
                    </span>
                  )}
                  {isLocked && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                      style={{ backgroundColor: tokens.border }}
                    >
                      <Lock size={10} strokeWidth={2.5} color={tokens.textMuted} />
                    </span>
                  )}
                </button>

                {/* Connector to next circle — fills remaining row height */}
                {!isLast && (
                  <div
                    className="flex-1 mt-0"
                    style={{
                      width: '2px',
                      backgroundColor: connectorFilled ? tokens.primary : tokens.border,
                    }}
                  />
                )}
              </div>

              {/* Right column: labels */}
              <div
                className="flex flex-col justify-start pt-2 pb-2"
                style={{ opacity: isLocked ? 0.4 : 1 }}
              >
                <span className={`text-[9px] uppercase tracking-[0.3em] font-semibold leading-none ${
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  Phase {phase}
                </span>
                <span className={`font-serif text-[13px] italic leading-tight mt-1 ${
                  isActive ? 'text-foreground' : isComplete ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {config.label}
                </span>
                {isActive && (
                  <p className="font-serif text-[11px] text-muted-foreground leading-snug m-0 mt-1.5 italic max-w-[180px]">
                    {config.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
