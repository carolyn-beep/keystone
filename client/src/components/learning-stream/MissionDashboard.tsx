import { useState, useReducer, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { AlertTriangle, RefreshCw, Search, Loader2 } from 'lucide-react';
import { type AgentInfo, type OrchestratorLog, type SwarmEventState } from '@/hooks/useSwarmEvents';
import { AgentCard } from './AgentCard';
import { AgentInspectModal } from './AgentInspectModal';
import { ActivityLog } from './ActivityLog';
import { DeploymentPanel } from './DeploymentPanel';
import { TactileButton } from '@/components/ui/tactile-button';
import { cn } from '@/lib/utils';
import queueClearedImg from '@/assets/textures/research_queue_cleared_bg.webp';
import researchCompleteBgImg from '@/assets/textures/research_complete_bg.webp';

// State machine for dashboard UI states (exported for DeploymentPanel)
export type DashboardState =
  | { phase: 'idle' }
  | { phase: 'launching' }      // API call in flight
  | { phase: 'waiting' }        // API returned, waiting for SSE
  | { phase: 'deploying' }      // SSE connected, no agents yet
  | { phase: 'active' }         // Agents running
  | { phase: 'complete' }       // Swarm finished
  | { phase: 'error' };         // Connection error

type DashboardAction =
  | { type: 'LAUNCH_START' }
  | { type: 'LAUNCH_COMPLETE' }
  | { type: 'SSE_CONNECTING' }
  | { type: 'SSE_RUNNING' }
  | { type: 'AGENTS_SPAWNED' }
  | { type: 'SWARM_COMPLETE' }
  | { type: 'SSE_IDLE' }
  | { type: 'SSE_ERROR' }
  | { type: 'RETRY' };

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'LAUNCH_START':
      return { phase: 'launching' };

    case 'LAUNCH_COMPLETE':
      if (state.phase === 'launching') {
        return { phase: 'waiting' };
      }
      return state;

    case 'SSE_CONNECTING':
      if (state.phase === 'waiting' || state.phase === 'launching') {
        return { phase: 'deploying' };
      }
      return state;

    case 'SSE_RUNNING':
      if (state.phase === 'waiting' || state.phase === 'launching' || state.phase === 'idle') {
        return { phase: 'deploying' };
      }
      return state;

    case 'AGENTS_SPAWNED':
      return { phase: 'active' };

    case 'SWARM_COMPLETE':
      return { phase: 'complete' };

    case 'SSE_IDLE':
      if (state.phase === 'idle' || state.phase === 'complete' || state.phase === 'error') {
        return { phase: 'idle' };
      }
      if (state.phase === 'launching' || state.phase === 'waiting') {
        return state;
      }
      return { phase: 'idle' };

    case 'SSE_ERROR':
      return { phase: 'error' };

    case 'RETRY':
      return { phase: 'deploying' };

    default:
      return state;
  }
}

interface MissionDashboardProps {
  swarmState: SwarmEventState;
  onLaunch?: () => Promise<void>;
  isLaunching?: boolean;
  hideWhenIdle?: boolean;
  pendingCount?: number;
}

/**
 * Research Observatory dashboard - three-column editorial layout.
 * Uses Framer Motion LayoutGroup for shared layout animations.
 */
export function MissionDashboard({ swarmState, onLaunch, isLaunching, hideWhenIdle, pendingCount = 0 }: MissionDashboardProps) {
  const {
    status: sseStatus,
    agents,
    completedCount,
    totalCount,
    error,
    failedCount,
    orchestratorLogs,
    connect,
    startTime,
  } = swarmState;

  const [state, dispatch] = useReducer(
    dashboardReducer,
    sseStatus,
    (initialStatus): DashboardState => {
      if (initialStatus === 'complete') return { phase: 'complete' };
      if (initialStatus === 'running') return { phase: agents.length > 0 ? 'active' : 'deploying' };
      if (initialStatus === 'error') return { phase: 'error' };
      return { phase: 'idle' };
    }
  );
  const [inspectedAgentId, setInspectedAgentId] = useState<string | null>(null);

  // Look up the live agent from the agents array
  const inspectedAgent = inspectedAgentId ? agents.find(a => a.toolUseId === inspectedAgentId) ?? null : null;

  // Sync SSE status changes to state machine
  useEffect(() => {
    if (sseStatus === 'connecting') {
      dispatch({ type: 'SSE_CONNECTING' });
    } else if (sseStatus === 'running') {
      dispatch({ type: 'SSE_RUNNING' });
    } else if (sseStatus === 'complete') {
      dispatch({ type: 'SWARM_COMPLETE' });
    } else if (sseStatus === 'error') {
      dispatch({ type: 'SSE_ERROR' });
    } else if (sseStatus === 'idle') {
      dispatch({ type: 'SSE_IDLE' });
    }
  }, [sseStatus]);

  // When agents appear, transition to active
  useEffect(() => {
    if (agents.length > 0 && state.phase !== 'active' && state.phase !== 'complete') {
      dispatch({ type: 'AGENTS_SPAWNED' });
    }
  }, [agents.length, state.phase]);

  // Sync external isLaunching prop
  useEffect(() => {
    if (isLaunching) {
      dispatch({ type: 'LAUNCH_START' });
    } else if (state.phase === 'launching') {
      dispatch({ type: 'LAUNCH_COMPLETE' });
    }
  }, [isLaunching, state.phase]);

  const handleInspect = useCallback((agent: AgentInfo) => {
    setInspectedAgentId(agent.toolUseId);
  }, []);

  const handleCloseInspect = useCallback(() => {
    setInspectedAgentId(null);
  }, []);

  const handleRetry = useCallback(() => {
    dispatch({ type: 'RETRY' });
    connect();
  }, [connect]);

  const handleLaunch = useCallback(async () => {
    dispatch({ type: 'LAUNCH_START' });
    if (onLaunch) {
      await onLaunch();
    }
    dispatch({ type: 'LAUNCH_COMPLETE' });
  }, [onLaunch]);

  // Fade out: complete → wait 2.5s → fade 700ms → done
  const [fadePhase, setFadePhase] = useState<'none' | 'fading' | 'done'>('none');

  useEffect(() => {
    if (state.phase !== 'complete') { setFadePhase('none'); return; }
    const t = setTimeout(() => setFadePhase('fading'), 2500);
    return () => clearTimeout(t);
  }, [state.phase]);

  useEffect(() => {
    if (fadePhase !== 'fading') return;
    const t = setTimeout(() => setFadePhase('done'), 700);
    return () => clearTimeout(t);
  }, [fadePhase]);

  // Auto-scroll to items after fade completes
  useEffect(() => {
    if (fadePhase === 'done' && pendingCount > 0) {
      const itemsSection = document.querySelector('[data-learning-items]');
      if (itemsSection) {
        itemsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [fadePhase, pendingCount]);

  // Hide conditions (after all hooks)
  if (hideWhenIdle && state.phase === 'idle' && agents.length === 0) {
    return null;
  }

  if (fadePhase === 'done') {
    return null;
  }

  // Single derived display state — exactly one branch matches at a time
  type DisplayState = 'idle' | 'deploying' | 'active' | 'error';
  const displayState: DisplayState = (() => {
    if (state.phase === 'error' && agents.length === 0) return 'error';
    if (state.phase === 'active' || state.phase === 'complete' || agents.length > 0) return 'active';
    if (state.phase === 'launching' || state.phase === 'waiting' || state.phase === 'deploying') return 'deploying';
    return 'idle';
  })();
  const showError = state.phase === 'error';

  // Cycle number for display
  const cycleNumber = String(agents.length).padStart(3, '0');

  return (
    <LayoutGroup>
      <motion.div
        layout
        className={cn(
          'transition-opacity duration-700 ease-out',
          fadePhase === 'fading' && 'opacity-0'
        )}
      >
        {/* Main Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-2xl font-bold text-foreground">
                Research Swarm
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl font-serif italic">
                Unleash a swarm of specialized research agents to help you expand your brainlifts with a varied selection of high quality sources.
              </p>
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-4">
              <StatusIndicator phase={state.phase} />
              {totalCount > 0 && (
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{completedCount}</span>
                  <span className="mx-1">/</span>
                  <span>{totalCount}</span>
                  {failedCount > 0 && (
                    <span className="text-destructive ml-2">({failedCount} failed)</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {displayState === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <IdleLaunchState onLaunch={handleLaunch} />
            </motion.div>
          )}

          {displayState === 'deploying' && (
            <motion.div
              key="deploying"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <DeployingState />
            </motion.div>
          )}

          {displayState === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ErrorState error={error} onRetry={handleRetry} />
            </motion.div>
          )}

          {displayState === 'active' && (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Error Banner (if error with agents) */}
              {showError && error && (
                <div className="mb-8 p-4 bg-destructive-soft border border-destructive/20 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                  </div>
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 transition-colors"
                  >
                    <RefreshCw size={12} />
                    Retry
                  </button>
                </div>
              )}

              {/* Three Column Layout - Border at top */}
              <div className="border-t border-border pt-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                  {/* Left Column - Deployment */}
                  <section className="lg:col-span-3">
                    <div className="border-b-2 border-foreground pb-2 mb-6">
                      <h2 className="font-serif text-xl font-bold text-foreground">Deployment</h2>
                    </div>
                    <DeploymentPanel
                      phase={state.phase}
                      agentCount={agents.length}
                      completedCount={completedCount}
                      totalCount={totalCount}
                      startTime={startTime}
                      totalSearches={agents.reduce((sum, a) => sum + a.events.filter(e => e.type === 'search').length, 0)}
                      resourcesFound={agents.filter(a => a.result?.found).length}
                    />
                  </section>

                  {/* Center Column - Active Units */}
                  <section className="lg:col-span-5">
                    <div className="border-b-2 border-foreground pb-2 mb-6 flex justify-between items-end">
                      <h2 className="font-serif text-xl font-bold text-foreground">Active Units</h2>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        Cycle {cycleNumber}
                      </span>
                    </div>

                    <AgentList
                      agents={agents}
                      onInspect={handleInspect}
                      inspectedAgentId={inspectedAgentId}
                    />

                    {/* Research Complete Footer */}
                    {state.phase === 'complete' && (
                      <ResearchCompleteFooter
                        savedCount={completedCount - failedCount}
                        failedCount={failedCount}
                        onNewMission={handleLaunch}
                        isLaunching={isLaunching}
                        hideLaunchButton={pendingCount > 0}
                      />
                    )}
                  </section>

                  {/* Right Column - Activity Log */}
                  <section className="lg:col-span-4 lg:pl-8 lg:border-l lg:border-border">
                    <div className="border-b-2 border-foreground pb-2 mb-6">
                      <h2 className="font-serif text-xl font-bold text-foreground">Activity Log</h2>
                    </div>
                    <ActivityLog logs={orchestratorLogs} isError={showError} />
                  </section>
                </div>
              </div>

              {/* Mobile: Collapsed Research Notes */}
              <div className="lg:hidden mt-8">
                <MobileResearchNotes logs={orchestratorLogs} isError={showError} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inspect Modal (outside AnimatePresence for shared layout) */}
        {inspectedAgent && (
          <AgentInspectModal agent={inspectedAgent} onClose={handleCloseInspect} />
        )}
      </motion.div>
    </LayoutGroup>
  );
}

// Status indicator component
function StatusIndicator({ phase }: { phase: DashboardState['phase'] }) {
  const config = {
    idle: { color: 'bg-muted-foreground/50', label: 'Standby', pulse: false },
    launching: { color: 'bg-warning', label: 'Launching', pulse: true },
    waiting: { color: 'bg-warning', label: 'Initializing', pulse: true },
    deploying: { color: 'bg-warning', label: 'Deploying', pulse: true },
    active: { color: 'bg-success', label: 'Active', pulse: true },
    complete: { color: 'bg-success', label: 'Complete', pulse: false },
    error: { color: 'bg-destructive', label: 'Error', pulse: true },
  }[phase];

  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-2 h-2 rounded-full', config.color, config.pulse && 'animate-pulse')} />
      <span className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">
        {config.label}
      </span>
    </div>
  );
}

// Agent List with vertical layout and proper animations
interface AgentListProps {
  agents: AgentInfo[];
  onInspect: (agent: AgentInfo) => void;
  inspectedAgentId: string | null;
}

function AgentList({ agents, onInspect, inspectedAgentId }: AgentListProps) {
  return (
    <div className="space-y-6">
      <AnimatePresence mode="popLayout">
        {agents.map((agent, index) => (
          <motion.div
            key={agent.toolUseId}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 40,
              mass: 1,
              delay: index * 0.05,
            }}
          >
            <AgentCard
              agent={agent}
              onInspect={onInspect}
              isInspected={agent.toolUseId === inspectedAgentId}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Idle state with launch button
interface IdleLaunchStateProps {
  onLaunch?: () => void;
}

function IdleLaunchState({ onLaunch }: IdleLaunchStateProps) {
  return (
    <div className="py-16 relative border-t border-border">
      {/* Background image */}
      <div
        className="absolute inset-0 opacity-[0.06] bg-no-repeat bg-center pointer-events-none"
        style={{ backgroundImage: `url(${queueClearedImg})`, backgroundSize: '50%' }}
      />

      <div className="relative flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="relative mb-8"
        >
          <div className="w-20 h-20 rounded-full flex items-center justify-center border border-border">
            <Search size={32} className="text-muted-foreground" />
          </div>
        </motion.div>

        <motion.h3
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="font-serif text-3xl text-foreground mb-3"
        >
          No Active Research
        </motion.h3>
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-sm text-muted-foreground max-w-md mb-10 leading-relaxed"
        >
          Research Agent Swarm inactive. Launch a new swarm to scan for new learning resources.
        </motion.p>

        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <TactileButton
            variant="raised"
            onClick={onLaunch}
            className="flex items-center gap-3 px-8 py-4 text-[14px]"
          >
            <Search size={18} />
            Launch Research Swarm
          </TactileButton>
        </motion.div>
      </div>
    </div>
  );
}

// Deploying state
function DeployingState() {
  return (
    <div className="py-16 relative border-t border-border">
      <div className="relative flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative mb-8"
        >
          <div className="w-20 h-20 rounded-full flex items-center justify-center border border-border">
            <Loader2
              size={32}
              className="text-warning animate-spin"
              style={{ animationDuration: '2s' }}
            />
          </div>

          {/* Animated rings */}
          <motion.div
            className="absolute inset-0 rounded-full border border-warning/30"
            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>

        <h3 className="font-serif text-3xl text-foreground mb-3">
          Deploying Research Agents...
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          Initializing search. Agents will appear as they come online.
        </p>
      </div>
    </div>
  );
}

// Error state (before agents)
interface ErrorStateProps {
  error?: string;
  onRetry: () => void;
}

function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="py-16 border-t border-border">
      <div className="flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative mb-8"
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center bg-destructive-soft border border-destructive/20">
            <AlertTriangle size={28} className="text-destructive" />
          </div>
        </motion.div>

        <h3 className="font-serif text-3xl text-foreground mb-3">
          Connection Lost
        </h3>
        <p className="text-sm text-destructive max-w-md mb-10 leading-relaxed">
          {error || 'Failed to establish connection with the research system.'}
        </p>

        <TactileButton
          variant="raised"
          onClick={onRetry}
          className="flex items-center gap-3 px-8 py-4 text-[14px]"
        >
          <RefreshCw size={18} />
          Retry Connection
        </TactileButton>
      </div>
    </div>
  );
}

// Mobile Research Notes (collapsed version)
interface MobileResearchNotesProps {
  logs: OrchestratorLog[];
  isError: boolean;
}

const MobileResearchNotes = memo(function MobileResearchNotes({ logs, isError }: MobileResearchNotesProps) {
  const displayLogs = logs.slice(-3);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-2 h-2 rounded-full', isError ? 'bg-destructive' : 'bg-success animate-pulse')} />
        <span className="text-xs uppercase tracking-[0.2em] font-semibold text-muted-foreground">
          Activity
        </span>
      </div>

      <div className="bg-card border border-border p-4 text-xs space-y-2">
        {displayLogs.length === 0 ? (
          <div className="text-muted-foreground italic">Awaiting signal...</div>
        ) : (
          displayLogs.map((log, idx) => (
            <div key={idx} className="text-muted-foreground truncate">
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

// Research Complete Footer
interface ResearchCompleteFooterProps {
  savedCount: number;
  failedCount: number;
  onNewMission?: () => void;
  isLaunching?: boolean;
  hideLaunchButton?: boolean;
}

function ResearchCompleteFooter({ savedCount, failedCount, onNewMission, isLaunching, hideLaunchButton }: ResearchCompleteFooterProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="relative mt-8 p-6 bg-success-soft border border-success/20 overflow-hidden"
    >
      {/* Subtle background illustration */}
      <div
        className="absolute inset-0 opacity-[0.06] bg-no-repeat bg-right bg-contain pointer-events-none"
        style={{ backgroundImage: `url(${researchCompleteBgImg})` }}
      />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="font-serif text-lg text-success font-bold">Research Complete</span>
          <span className="text-sm text-muted-foreground">
            {savedCount} saved
            {failedCount > 0 && <span className="text-destructive ml-2">{failedCount} failed</span>}
          </span>
        </div>

        {onNewMission && !hideLaunchButton && (
          <TactileButton
            variant="raised"
            onClick={onNewMission}
            disabled={isLaunching}
            className="text-[13px]"
          >
            {isLaunching ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Starting...
              </span>
            ) : (
              'New Swarm'
            )}
          </TactileButton>
        )}
      </div>
    </motion.div>
  );
}

