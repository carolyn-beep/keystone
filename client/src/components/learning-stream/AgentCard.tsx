import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentInfo, AgentStatus } from '@/hooks/useSwarmEvents';
import { cn } from '@/lib/utils';

// Resource type to display label mapping
const RESOURCE_LABELS: Record<string, string> = {
  Substack: 'Substack Analysis',
  'Academic Paper': 'Research Paper',
  Twitter: 'Twitter Scrape',
  Podcast: 'Podcast Analysis',
  Video: 'Video Analysis',
  Unknown: 'Unknown',
};

// Status indicator configuration — flat editorial style: dot + small-caps label
const STATUS_CONFIG: Record<AgentStatus, { dot: string; text: string; pulse: boolean; label: string }> = {
  spawning: {
    dot: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
    pulse: false,
    label: 'Starting',
  },
  running: {
    dot: 'bg-success',
    text: 'text-success',
    pulse: true,
    label: 'Running',
  },
  complete: {
    dot: 'bg-success',
    text: 'text-success',
    pulse: false,
    label: 'Complete',
  },
  failed: {
    dot: 'bg-destructive',
    text: 'text-destructive',
    pulse: false,
    label: 'Failed',
  },
};

interface AgentCardProps {
  agent: AgentInfo;
  onInspect: (agent: AgentInfo) => void;
  isInspected?: boolean;
}

/**
 * Individual agent card matching the neo-editorial inspo design.
 */
export const AgentCard = memo(function AgentCard({ agent, onInspect, isInspected }: AgentCardProps) {
  const unitLabel = `Unit-${agent.agentNumber.toString().padStart(2, '0')}`;
  const resourceLabel = RESOURCE_LABELS[agent.resourceType] || 'Unknown';
  const statusConfig = STATUS_CONFIG[agent.status];

  // Calculate progress percentage
  const eventCount = agent.events.length;
  const progressPercent = agent.status === 'complete' || agent.status === 'failed'
    ? 100
    : Math.min(eventCount * 15, 90);

  // Determine opacity for idle/waiting cards
  const isWaiting = agent.status === 'spawning' && agent.events.length === 0;

  // Don't render if this card is being inspected (modal takes over with same layoutId)
  if (isInspected) {
    return (
      <div className="bg-card border border-border px-4 py-3 opacity-0">
        {/* Placeholder to maintain layout */}
      </div>
    );
  }

  return (
    <motion.div
      layoutId={`agent-card-${agent.toolUseId}`}
      className={cn(
        'bg-card px-4 py-3 border border-border shadow-sm relative',
        'flex flex-col gap-2',
        isWaiting && 'opacity-60'
      )}
    >
      {/* Header row — unit name, resource type, status badge inline */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="font-serif text-base font-bold text-foreground shrink-0">{unitLabel}</h3>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest truncate">
            {resourceLabel}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dot, statusConfig.pulse && 'animate-pulse')} />
          <span className={cn('text-[10px] font-semibold uppercase tracking-[0.15em]', statusConfig.text)}>
            {statusConfig.label}
          </span>
        </span>
      </div>

      {/* Progress bar — full width, always visible when active */}
      {!isWaiting ? (
        <>
          <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
            <motion.div
              className={cn(
                'h-1 rounded-full',
                agent.status === 'failed' ? 'bg-destructive' : 'bg-success'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>

          {/* Target + Inspect */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block uppercase tracking-wider text-[9px] text-muted-foreground/60 mb-0.5">Target</span>
              <span className="text-[11px] text-foreground truncate block">{getTarget(agent)}</span>
            </div>
            <button
              onClick={() => onInspect(agent)}
              className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border border-border hover:border-foreground hover:text-foreground transition-colors shrink-0"
            >
              Inspect
            </button>
          </div>
        </>
      ) : (
        <div className="text-[11px] font-serif italic text-muted-foreground">
          Waiting for queue allocation...
        </div>
      )}

      {/* Result preview for completed/failed agents */}
      <AnimatePresence mode="wait">
        {agent.status === 'complete' && agent.result?.found && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pt-1.5 border-t border-border"
          >
            <span className="block uppercase tracking-wider text-[9px] text-success/60 mb-0.5">Result</span>
            <div className="text-[11px] text-success truncate" title={agent.result.topic}>
              {agent.result.topic}
            </div>
          </motion.div>
        )}
        {agent.status === 'failed' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pt-1.5 border-t border-border"
          >
            <span className="block uppercase tracking-wider text-[9px] text-destructive/60 mb-0.5">Error</span>
            <div className="text-[11px] text-destructive truncate" title={agent.result?.reason}>
              {agent.result?.reason || 'Unknown error'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/**
 * Get the current target/activity for an agent.
 */
function getTarget(agent: AgentInfo): string {
  if (agent.status === 'complete' && agent.result?.found) {
    return agent.result.topic;
  }
  if (agent.status === 'failed') {
    return agent.result?.reason || 'Error';
  }
  if (agent.events.length === 0) {
    return 'Initializing...';
  }

  const lastEvent = agent.events[agent.events.length - 1];

  switch (lastEvent.type) {
    case 'search':
      return String(lastEvent.data.query || '').slice(0, 40) || 'Searching...';
    case 'fetch':
      if (lastEvent.data.source === 'youtube' && lastEvent.data.videoId) {
        return 'Video transcript';
      }
      return 'Content fetch';
    case 'reasoning':
      return 'Analyzing...';
    case 'check_duplicate':
      return 'Duplicate check';
    case 'save_item':
      return 'Saving resource';
    default:
      return 'Processing...';
  }
}

/**
 * Placeholder card for empty grid slots.
 */
interface PlaceholderCardProps {
  unitNumber: number;
}

export const PlaceholderCard = memo(function PlaceholderCard({ unitNumber }: PlaceholderCardProps) {
  const unitLabel = `Unit-${unitNumber.toString().padStart(2, '0')}`;

  return (
    <div className="bg-card px-4 py-3 border border-border shadow-sm flex flex-col gap-2 opacity-60">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="font-serif text-base font-bold text-foreground">{unitLabel}</h3>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Standby</span>
        </div>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Idle</span>
        </span>
      </div>
      <div className="text-[11px] font-serif italic text-muted-foreground">
        Waiting for queue allocation...
      </div>
    </div>
  );
});
