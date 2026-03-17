import { Link } from 'wouter';
import { ChevronLeft, Lock, Hammer, Eye, LayoutDashboard, LayoutGrid } from 'lucide-react';
import type { NativePhaseProgress, BuilderPhaseStatus } from '@shared/schema';
import type { BuilderView, BuilderBuildScreen, BuilderPhase } from '@/hooks/useBuilderNav';
import { tokens } from '@/lib/colors';

const PHASE_LABELS: Record<BuilderPhase, string> = {
  1: 'Topic & Purpose',
  2: 'Experts',
  3: 'Content',
  4: 'Structure',
  5: 'Review',
};

const VIEW_ITEMS: { id: BuilderView; label: string; icon: typeof Hammer; locked?: boolean }[] = [
  { id: 'build', label: 'Build', icon: Hammer },
  { id: 'display', label: 'Display', icon: Eye },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, locked: true },
];

function statusIndicator(status: BuilderPhaseStatus) {
  if (status === 'complete') return { color: tokens.success, label: 'complete' };
  if (status === 'in_progress') return { color: tokens.info, label: 'active' };
  if (status === 'not_started') return { color: tokens.textMuted, label: 'todo' };
  return null; // locked - handled separately
}

interface BuilderSidebarProps {
  view: BuilderView;
  screen: BuilderBuildScreen;
  phaseProgress: NativePhaseProgress;
  onViewChange: (view: BuilderView) => void;
  onScreenChange: (screen: BuilderBuildScreen) => void;
  backLink: string;
}

export function BuilderSidebar({
  view,
  screen,
  phaseProgress,
  onViewChange,
  onScreenChange,
  backLink,
}: BuilderSidebarProps) {
  const phases: BuilderPhase[] = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col h-full">
      {/* Back link */}
      <div className="px-3 pt-4 pb-2">
        <Link
          href={backLink}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors no-underline"
        >
          <ChevronLeft size={16} />
          <span>All Brainlifts</span>
        </Link>
      </div>

      {/* View toggle */}
      <nav className="px-3 py-2 space-y-0.5">
        <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground px-3 py-2">
          Mode
        </div>
        {VIEW_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.id;
          const isLocked = item.locked;

          return (
            <button
              key={item.id}
              onClick={() => !isLocked && onViewChange(item.id)}
              disabled={isLocked}
              className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium tracking-wide transition-colors duration-500 ease-out border-none ${
                isActive
                  ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
                  : isLocked
                    ? 'text-muted-foreground opacity-50 cursor-not-allowed'
                    : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 cursor-pointer'
              } ${!isActive && !isLocked ? 'bg-transparent' : ''}`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {isLocked && <Lock size={12} className="shrink-0 text-muted-foreground" />}
            </button>
          );
        })}
      </nav>

      {/* Phase navigation - only shown in build view */}
      {view === 'build' && (
        <nav className="px-3 py-2 space-y-0.5 border-t border-sidebar-border mt-2 pt-3">
          <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground px-3 py-2">
            Phases
          </div>

          {/* Overview item */}
          <button
            onClick={() => onScreenChange('overview')}
            className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium tracking-wide transition-colors duration-500 ease-out border-none cursor-pointer ${
              screen === 'overview'
                ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 bg-transparent'
            }`}
          >
            <LayoutGrid size={16} className="shrink-0" />
            <span>Overview</span>
          </button>

          {/* Phase items */}
          {phases.map((phase) => {
            const key = `phase${phase}` as keyof NativePhaseProgress;
            const status = phaseProgress[key];
            const isLocked = status === 'locked';
            const isActive = screen === phase;
            const indicator = statusIndicator(status);

            return (
              <button
                key={phase}
                onClick={() => !isLocked && onScreenChange(phase)}
                disabled={isLocked}
                className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium tracking-wide transition-colors duration-500 ease-out border-none ${
                  isActive
                    ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
                    : isLocked
                      ? 'text-muted-foreground opacity-50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 cursor-pointer'
                } ${!isActive && !isLocked ? 'bg-transparent' : ''}`}
              >
                {/* Status dot */}
                {isLocked ? (
                  <Lock size={12} className="shrink-0 text-muted-foreground" />
                ) : indicator ? (
                  <span
                    className="shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: indicator.color }}
                  />
                ) : null}
                <span className="flex-1 text-left">
                  <span className="text-muted-light mr-1">{phase}.</span>
                  {PHASE_LABELS[phase]}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
