import { useState, useReducer, useCallback, useRef, useEffect, memo } from 'react';
import { AlertTriangle, RefreshCw, Radar, Loader2 } from 'lucide-react';
import { useSwarmEvents, type AgentInfo, type OrchestratorLog, type SwarmStatus } from '@/hooks/useSwarmEvents';
import { AgentUnit } from './AgentUnit';
import { AgentInspectModal } from './AgentInspectModal';

const GRID_COLS = 5;

// State machine for dashboard UI states
type DashboardState =
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
      // After API returns, wait for SSE events
      if (state.phase === 'launching') {
        return { phase: 'waiting' };
      }
      return state;

    case 'SSE_CONNECTING':
      // SSE is connecting - stay in waiting/deploying
      if (state.phase === 'waiting' || state.phase === 'launching') {
        return { phase: 'deploying' };
      }
      return state;

    case 'SSE_RUNNING':
      // SSE reports running - move to deploying if we don't have agents yet
      if (state.phase === 'waiting' || state.phase === 'launching' || state.phase === 'idle') {
        return { phase: 'deploying' };
      }
      return state;

    case 'AGENTS_SPAWNED':
      // Agents appeared - we're active
      return { phase: 'active' };

    case 'SWARM_COMPLETE':
      return { phase: 'complete' };

    case 'SSE_IDLE':
      // Only go back to idle if we weren't in the middle of something
      if (state.phase === 'idle' || state.phase === 'complete' || state.phase === 'error') {
        return { phase: 'idle' };
      }
      // If we just launched, stay in waiting
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
  slug: string;
  onLaunch?: () => Promise<void>;
  isLaunching?: boolean;
  /** When true, hides the dashboard completely when idle (use when items already exist) */
  hideWhenIdle?: boolean;
  /** Number of pending items - hides NEW MISSION button when > 0 */
  pendingCount?: number;
}

/**
 * Unified Mission Control dashboard.
 * Uses a state machine for explicit phase transitions.
 */
export function MissionDashboard({ slug, onLaunch, isLaunching, hideWhenIdle, pendingCount = 0 }: MissionDashboardProps) {
  const {
    status: sseStatus,
    agents,
    completedCount,
    totalCount,
    isError: sseIsError,
    error,
    failedCount,
    orchestratorLogs,
    connect,
  } = useSwarmEvents(slug, true);

  const [state, dispatch] = useReducer(dashboardReducer, { phase: 'idle' });
  const [inspectedAgentId, setInspectedAgentId] = useState<string | null>(null);

  // Look up the live agent from the agents array (for realtime updates in modal)
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

  // Fade out state - when complete and there are pending items to show
  const [hasFadedOut, setHasFadedOut] = useState(false);
  const shouldFadeOut = state.phase === 'complete' && pendingCount > 0;

  // Reset fade state when swarm starts again
  useEffect(() => {
    if (state.phase !== 'complete') {
      setHasFadedOut(false);
    }
  }, [state.phase]);

  // When hideWhenIdle is true and we're idle with no agents, render nothing
  // (Must be after all hooks)
  if (hideWhenIdle && state.phase === 'idle' && agents.length === 0) {
    return null;
  }

  // Hide after fade out completes
  if (hasFadedOut) {
    return null;
  }

  // Derive display conditions from state machine
  const showIdleState = state.phase === 'idle';
  const showDeployingState = state.phase === 'launching' || state.phase === 'waiting' || state.phase === 'deploying';
  const showAgents = state.phase === 'active' || state.phase === 'complete' || (agents.length > 0);
  const showError = state.phase === 'error';
  const isActive = state.phase === 'active' || state.phase === 'deploying' || state.phase === 'launching' || state.phase === 'waiting';

  return (
    <div
      className={`bg-slate-950 border border-slate-800 rounded-xl overflow-hidden transition-all duration-700 ease-out ${
        shouldFadeOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
      onTransitionEnd={(e) => {
        // Only react to opacity transition ending on this element
        if (shouldFadeOut && e.propertyName === 'opacity' && e.target === e.currentTarget) {
          setHasFadedOut(true);
        }
      }}
    >
      {/* Header - always visible, changes based on state */}
      <DashboardHeader
        phase={state.phase}
        completedCount={completedCount}
        totalCount={totalCount}
        failedCount={failedCount}
      />

      {/* Content area - transitions between states */}
      <div className="transition-all duration-500 ease-out">
        {/* Idle State - Launch prompt */}
        {showIdleState && (
          <IdleLaunchState onLaunch={handleLaunch} />
        )}

        {/* Deploying State - Waiting for first agent */}
        {showDeployingState && !showAgents && (
          <DeployingState />
        )}

        {/* Error State without agents */}
        {showError && !showAgents && (
          <ErrorState error={error} onRetry={handleRetry} />
        )}

        {/* Active/Complete State - Show master control and agents */}
        {showAgents && (
          <>
            {/* Master Control Terminal */}
            <MasterControl logs={orchestratorLogs} isError={showError} />

            {/* Error Banner */}
            {showError && error && (
              <div className="mx-4 mb-4 p-3 bg-red-950/50 border border-red-800 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-400 text-sm font-mono">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1 px-3 py-1 text-xs font-mono text-red-400 border border-red-700 rounded hover:bg-red-900/50 transition-colors"
                >
                  <RefreshCw size={12} />
                  RETRY
                </button>
              </div>
            )}

            {/* Agent Grid - grows dynamically */}
            <div
              className="p-4 grid gap-3 transition-all duration-300 ease-out"
              style={{ gridTemplateColumns: `repeat(${Math.min(agents.length, GRID_COLS)}, minmax(0, 1fr))` }}
            >
              {agents.map((agent, index) => (
                <div
                  key={agent.toolUseId}
                  className="animate-agent-spawn"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <AgentUnit agent={agent} onInspect={handleInspect} />
                </div>
              ))}
            </div>

            {/* Mission Complete Footer */}
            {state.phase === 'complete' && (
              <MissionCompleteFooter
                savedCount={completedCount - failedCount}
                failedCount={failedCount}
                onNewMission={handleLaunch}
                isLaunching={isLaunching}
                hideLaunchButton={pendingCount > 0}
              />
            )}
          </>
        )}
      </div>

      {/* Inspect Modal */}
      {inspectedAgent && (
        <AgentInspectModal agent={inspectedAgent} onClose={handleCloseInspect} />
      )}

      {/* Inject animation keyframes */}
      <style>{`
        @keyframes agent-spawn {
          0% {
            opacity: 0;
            transform: scale(0.8) translateY(10px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-agent-spawn {
          animation: agent-spawn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

// Header subcomponent
interface DashboardHeaderProps {
  phase: DashboardState['phase'];
  completedCount: number;
  totalCount: number;
  failedCount: number;
}

function DashboardHeader({
  phase,
  completedCount,
  totalCount,
  failedCount,
}: DashboardHeaderProps) {
  // Determine header color scheme based on phase
  const getAccentColors = () => {
    if (phase === 'error') return ['bg-red-500', 'bg-red-600', 'bg-red-700'];
    if (phase === 'complete') return ['bg-emerald-500', 'bg-emerald-600', 'bg-emerald-700'];
    if (phase === 'active' || phase === 'deploying' || phase === 'launching' || phase === 'waiting') {
      return ['bg-amber-500', 'bg-amber-600', 'bg-amber-700'];
    }
    return ['bg-slate-600', 'bg-slate-700', 'bg-slate-800'];
  };

  const accentColors = getAccentColors();

  const statusText = {
    idle: 'STANDBY',
    launching: 'LAUNCHING',
    waiting: 'INITIALIZING',
    deploying: 'DEPLOYING',
    active: 'ACTIVE',
    complete: 'COMPLETE',
    error: 'ERROR',
  }[phase];

  const statusColor = {
    idle: 'text-slate-500',
    launching: 'text-amber-400',
    waiting: 'text-amber-400',
    deploying: 'text-amber-400',
    active: 'text-amber-400',
    complete: 'text-emerald-400',
    error: 'text-red-500',
  }[phase];

  const indicatorColor = {
    idle: 'bg-slate-600',
    launching: 'bg-amber-400 animate-pulse',
    waiting: 'bg-amber-400 animate-pulse',
    deploying: 'bg-amber-400 animate-pulse',
    active: 'bg-amber-400 animate-pulse',
    complete: 'bg-emerald-500',
    error: 'bg-red-500 animate-pulse',
  }[phase];

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
      <div className="flex items-center gap-3">
        {/* Decorative blocks - color changes with state */}
        <div className="flex items-center gap-1 transition-colors duration-300">
          <div className={`w-2 h-4 ${accentColors[0]} transition-colors duration-300`} />
          <div className={`w-2 h-4 ${accentColors[1]} transition-colors duration-300`} />
          <div className={`w-2 h-4 ${accentColors[2]} transition-colors duration-300`} />
        </div>
        <h3 className="font-mono text-sm font-bold text-slate-200 tracking-widest uppercase">
          {phase === 'idle' ? 'Research Division' : 'Learning Research Command Center'}
        </h3>
      </div>

      <div className="flex items-center gap-4 font-mono text-xs">
        {/* Progress counter - only show when we have agents */}
        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">[</span>
            <span className="text-slate-300 font-bold">
              {completedCount}/{totalCount}
            </span>
            <span className="text-slate-500">]</span>
          </div>
        )}

        {/* Failed counter (if any) */}
        {failedCount > 0 && (
          <div className="flex items-center gap-1 text-red-400">
            <AlertTriangle size={12} />
            <span>{failedCount}</span>
          </div>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${indicatorColor} transition-colors duration-300`} />
          <span className={`font-bold tracking-wider ${statusColor} transition-colors duration-300`}>
            {statusText}
          </span>
        </div>
      </div>
    </div>
  );
}

// Idle state with launch button
interface IdleLaunchStateProps {
  onLaunch?: () => void;
}

function IdleLaunchState({ onLaunch }: IdleLaunchStateProps) {
  return (
    <div className="p-8">
      <div className="flex flex-col items-center justify-center text-center">
        {/* Offline radar */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border border-slate-700 flex items-center justify-center bg-slate-900/50">
              <Radar size={32} className="text-slate-600" />
            </div>
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-500">
            OFFLINE
          </div>
        </div>

        <h3 className="font-mono text-lg font-bold text-slate-300 tracking-wide mb-2">
          NO ACTIVE INTELLIGENCE
        </h3>
        <p className="font-mono text-sm text-slate-500 max-w-md mb-8">
          Research division standing by. Deploy units to scan for learning resources.
        </p>

        {/* Launch button */}
        <button
          onClick={onLaunch}
          className="group relative px-8 py-4 font-mono text-sm font-bold tracking-widest uppercase border-2 rounded-lg transition-all duration-300 border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
        >
          <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-amber-500" />
          <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-amber-500" />
          <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-amber-500" />
          <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-amber-500" />
          <span className="flex items-center gap-3">
            <Radar size={18} />
            LAUNCH RESEARCH MISSION
          </span>
        </button>
      </div>
    </div>
  );
}

// Error state (when error occurs before agents appear)
interface ErrorStateProps {
  error?: string;
  onRetry: () => void;
}

function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="p-8">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full border-2 border-red-500/30 flex items-center justify-center bg-red-500/5">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <div className="absolute inset-0 rounded-full bg-red-500/10 blur-xl" />
        </div>

        <h3 className="font-mono text-lg font-bold text-slate-300 tracking-wide mb-2">
          CONNECTION LOST
        </h3>
        <p className="font-mono text-sm text-red-400 max-w-md mb-8">
          {error || 'Failed to establish uplink with swarm controller.'}
        </p>

        <button
          onClick={onRetry}
          className="group relative px-8 py-4 font-mono text-sm font-bold tracking-widest uppercase border-2 rounded-lg transition-all duration-300 border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
        >
          <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-red-500" />
          <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-red-500" />
          <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-red-500" />
          <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-red-500" />
          <span className="flex items-center gap-3">
            <RefreshCw size={18} />
            RETRY CONNECTION
          </span>
        </button>
      </div>
    </div>
  );
}

// Deploying state - waiting for first agent
function DeployingState() {
  return (
    <div className="p-8">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full border-2 border-amber-500/30 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border border-amber-500/50 flex items-center justify-center">
              <Radar
                size={32}
                className="text-amber-400 animate-pulse"
                style={{ animationDuration: '1.5s' }}
              />
            </div>
          </div>
          <div
            className="absolute inset-0 rounded-full border-t-2 border-amber-400 animate-spin"
            style={{ animationDuration: '3s' }}
          />
        </div>

        <h3 className="font-mono text-lg font-bold text-slate-200 tracking-wide mb-2">
          DEPLOYING RESEARCH UNITS...
        </h3>
        <p className="font-mono text-sm text-slate-500 max-w-sm">
          Initializing swarm. Agents will appear as they come online.
        </p>
      </div>
    </div>
  );
}

// Master Control Terminal
interface MasterControlProps {
  logs: OrchestratorLog[];
  isError: boolean;
}

const MasterControl = memo(function MasterControl({ logs, isError }: MasterControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  const displayLogs = logs.slice(-3);

  const getLogColor = (type: OrchestratorLog['type']) => {
    switch (type) {
      case 'error':
        return 'text-red-500';
      case 'complete':
        return 'text-emerald-400';
      case 'spawn':
        return 'text-cyan-400';
      case 'progress':
        return 'text-amber-400';
      default:
        return 'text-green-500';
    }
  };

  return (
    <div className="mx-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
        <span className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">
          Master Control
        </span>
      </div>

      <div
        ref={containerRef}
        className="bg-black border border-green-900/50 rounded p-3 font-mono text-xs h-[72px] overflow-hidden"
        style={{ boxShadow: 'inset 0 0 20px rgba(0, 255, 0, 0.03)' }}
      >
        {displayLogs.length === 0 ? (
          <div className="text-green-700 animate-pulse">Awaiting signal...</div>
        ) : (
          <div className="space-y-1">
            {displayLogs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-green-800 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="text-green-600">&gt;</span>
                <span className={`${getLogColor(log.type)} break-all`}>{log.message}</span>
              </div>
            ))}
          </div>
        )}
        <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-1" />
      </div>
    </div>
  );
});

// Mission Complete Footer
interface MissionCompleteFooterProps {
  savedCount: number;
  failedCount: number;
  onNewMission?: () => void;
  isLaunching?: boolean;
  hideLaunchButton?: boolean;
}

function MissionCompleteFooter({ savedCount, failedCount, onNewMission, isLaunching, hideLaunchButton }: MissionCompleteFooterProps) {
  return (
    <div className="mx-4 mb-4 p-4 bg-emerald-950/30 border border-emerald-800/50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm">
          <span className="text-emerald-400 font-bold">MISSION COMPLETE</span>
          <span className="text-slate-500 mx-2">|</span>
          <span className="text-slate-400">
            {savedCount} saved
            {failedCount > 0 && <span className="text-red-400 ml-2">{failedCount} failed</span>}
          </span>
        </div>

        {onNewMission && !hideLaunchButton && (
          <button
            onClick={onNewMission}
            disabled={isLaunching}
            className={`
              px-4 py-2 font-mono text-xs font-bold tracking-wider uppercase
              border rounded transition-all duration-300
              ${isLaunching
                ? 'border-emerald-700/50 text-emerald-600/50 cursor-wait'
                : 'border-emerald-600 text-emerald-400 hover:bg-emerald-500/10'
              }
            `}
          >
            {isLaunching ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                DEPLOYING...
              </span>
            ) : (
              'NEW MISSION'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Compact version for embedding
interface CompactMissionDashboardProps {
  slug: string;
  onExpand?: () => void;
}

export function CompactMissionDashboard({ slug, onExpand }: CompactMissionDashboardProps) {
  const { status, agents, completedCount, totalCount, isActive, isError, failedCount } =
    useSwarmEvents(slug, true);

  if (status === 'idle' && agents.length === 0) {
    return null;
  }

  const runningCount = agents.filter((a) => a.status === 'running').length;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 tracking-wide">SWARM STATUS</span>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isError
                ? 'bg-red-500 animate-pulse'
                : isActive
                  ? 'bg-amber-400 animate-pulse'
                  : status === 'complete'
                    ? 'bg-emerald-500'
                    : 'bg-slate-600'
            }`}
          />
          <span
            className={
              isError
                ? 'text-red-500'
                : isActive
                  ? 'text-amber-400'
                  : status === 'complete'
                    ? 'text-emerald-400'
                    : 'text-slate-500'
            }
          >
            {isError ? 'ERROR' : isActive ? 'RUNNING' : status === 'complete' ? 'DONE' : 'IDLE'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-slate-300">
        <div className="flex items-center gap-4">
          <span>
            <span className="text-emerald-400">{completedCount}</span>
            <span className="text-slate-600">/</span>
            <span>{totalCount}</span>
          </span>
          {runningCount > 0 && <span className="text-amber-400">{runningCount} active</span>}
          {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
        </div>

        {onExpand && (
          <button onClick={onExpand} className="text-slate-500 hover:text-slate-300 transition-colors">
            [EXPAND]
          </button>
        )}
      </div>
    </div>
  );
}
