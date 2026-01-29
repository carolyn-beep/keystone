import { memo } from 'react';
import type { AgentInfo, AgentStatus } from '@/hooks/useSwarmEvents';

// Resource type to short label mapping
const RESOURCE_LABELS: Record<string, string> = {
  Substack: 'SUBSTACK',
  'Academic Paper': 'PAPER',
  Twitter: 'TWITTER',
  Blog: 'BLOG',
  Research: 'RESEARCH',
  Podcast: 'PODCAST',
  Video: 'VIDEO',
  Unknown: '???',
};

// Status indicator styles
const STATUS_STYLES: Record<AgentStatus, { indicator: string; label: string; glow: string }> = {
  spawning: {
    indicator: 'bg-amber-500/50',
    label: 'INIT',
    glow: '',
  },
  running: {
    indicator: 'bg-amber-400 animate-pulse',
    label: 'RUNNING',
    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.6)]',
  },
  complete: {
    indicator: 'bg-emerald-500',
    label: 'DONE',
    glow: 'shadow-[0_0_8px_rgba(16,185,129,0.4)]',
  },
  failed: {
    indicator: 'bg-red-500',
    label: 'FAIL',
    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.4)]',
  },
};

interface AgentUnitProps {
  agent: AgentInfo;
  onInspect: (agent: AgentInfo) => void;
}

/**
 * Individual agent unit display box.
 * Shows unit number, resource type, status LED, and inspect button.
 */
export const AgentUnit = memo(function AgentUnit({ agent, onInspect }: AgentUnitProps) {
  const unitLabel = `UNIT-${String(agent.agentNumber).padStart(2, '0')}`;
  const resourceLabel = RESOURCE_LABELS[agent.resourceType] || 'UNKNOWN';
  const statusStyle = STATUS_STYLES[agent.status];

  return (
    <div
      className={`
        relative bg-slate-900 border-2 border-slate-700 rounded-lg p-3
        font-mono text-xs transition-all duration-300
        hover:border-slate-500 hover:bg-slate-800/80
        ${agent.status === 'running' ? 'border-amber-600/50' : ''}
        ${agent.status === 'complete' ? 'border-emerald-700/50' : ''}
        ${agent.status === 'failed' ? 'border-red-700/50' : ''}
      `}
    >
      {/* Unit Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-300 font-bold tracking-wider">{unitLabel}</span>
        <div
          className={`w-3 h-3 rounded-full ${statusStyle.indicator} ${statusStyle.glow}`}
          title={statusStyle.label}
        />
      </div>

      {/* Resource Type */}
      <div className="text-slate-500 text-[10px] tracking-wide mb-2 truncate" title={agent.resourceType}>
        {resourceLabel}
      </div>

      {/* Status Label */}
      <div
        className={`
          text-[10px] tracking-widest font-bold mb-2
          ${agent.status === 'running' ? 'text-amber-400' : ''}
          ${agent.status === 'complete' ? 'text-emerald-400' : ''}
          ${agent.status === 'failed' ? 'text-red-400' : ''}
          ${agent.status === 'spawning' ? 'text-slate-500' : ''}
        `}
      >
        {statusStyle.label}
      </div>

      {/* Inspect Button */}
      <button
        onClick={() => onInspect(agent)}
        className={`
          w-full py-1.5 text-[10px] tracking-wide font-bold
          border border-slate-600 rounded bg-slate-800
          text-slate-400 hover:text-slate-200 hover:border-slate-500 hover:bg-slate-700
          transition-colors uppercase
        `}
      >
        [INSPECT]
      </button>

      {/* Result preview for completed agents */}
      {agent.status === 'complete' && agent.result?.found && (
        <div className="mt-2 text-[9px] text-emerald-500/70 truncate" title={agent.result.topic}>
          {agent.result.topic}
        </div>
      )}
      {agent.status === 'failed' && (
        <div className="mt-2 text-[9px] text-red-500/70 truncate" title={agent.result?.reason}>
          {agent.result?.reason || 'Error'}
        </div>
      )}
    </div>
  );
});

// Placeholder unit for empty slots
interface PlaceholderUnitProps {
  unitNumber: number;
}

export const PlaceholderUnit = memo(function PlaceholderUnit({ unitNumber }: PlaceholderUnitProps) {
  const unitLabel = `UNIT-${String(unitNumber).padStart(2, '0')}`;

  return (
    <div className="relative bg-slate-900/50 border border-slate-800 border-dashed rounded-lg p-3 font-mono text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-600 font-bold tracking-wider">{unitLabel}</span>
        <div className="w-3 h-3 rounded-full bg-slate-700/50" />
      </div>
      <div className="text-slate-700 text-[10px] tracking-wide mb-2">STANDBY</div>
      <div className="text-[10px] tracking-widest font-bold text-slate-700 mb-2">IDLE</div>
      <div className="w-full py-1.5 text-[10px] text-slate-700 text-center">---</div>
    </div>
  );
});
