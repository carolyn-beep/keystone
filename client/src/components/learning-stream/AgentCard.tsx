import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentInfo, AgentStatus } from '@/hooks/useSwarmEvents';
import { cn } from '@/lib/utils';

// Resource type to display label mapping
const RESOURCE_LABELS: Record<string, string> = {
  Substack: 'Substack Analysis',
  'Academic Paper': 'Paper Synthesis',
  Twitter: 'Twitter Scrape',
  Blog: 'Blog Analysis',
  Research: 'Research Scan',
  Podcast: 'Podcast Analysis',
  Video: 'Video Analysis',
  Unknown: 'Unknown',
};

// Status badge configuration
const STATUS_CONFIG: Record<AgentStatus, { bg: string; text: string; ring: string; label: string }> = {
  spawning: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    ring: 'ring-muted-foreground/10',
    label: 'Starting',
  },
  running: {
    bg: 'bg-success-soft',
    text: 'text-success',
    ring: 'ring-success/20',
    label: 'Running',
  },
  complete: {
    bg: 'bg-success-soft',
    text: 'text-success',
    ring: 'ring-success/20',
    label: 'Complete',
  },
  failed: {
    bg: 'bg-destructive-soft',
    text: 'text-destructive',
    ring: 'ring-destructive/20',
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
      <div className="bg-card border border-border p-6 opacity-0">
        {/* Placeholder to maintain layout */}
      </div>
    );
  }

  return (
    <motion.div
      layoutId={`agent-card-${agent.toolUseId}`}
      className={cn(
        'bg-card p-6 border border-border shadow-sm relative',
        'flex flex-col gap-4',
        isWaiting && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className="flex justify-between items-start border-b border-border pb-3">
        <div>
          <h3 className="font-serif text-2xl font-bold text-foreground">{unitLabel}</h3>
          <span className="text-xs text-muted-foreground/60 uppercase tracking-widest">
            {resourceLabel}
          </span>
        </div>
        <span className={cn(
          'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset uppercase tracking-wider',
          statusConfig.bg,
          statusConfig.text,
          statusConfig.ring
        )}>
          {statusConfig.label}
        </span>
      </div>

      {/* Stats Grid */}
      {!isWaiting ? (
        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* Target */}
          <div className="text-xs text-muted-foreground">
            <span className="block uppercase tracking-wider text-[10px] text-muted-foreground/60 mb-1">
              Target
            </span>
            <span className="text-foreground truncate block">
              {getTarget(agent)}
            </span>
          </div>

          {/* Progress */}
          <div className="text-xs text-muted-foreground">
            <span className="block uppercase tracking-wider text-[10px] text-muted-foreground/60 mb-1">
              Progress
            </span>
            <div className="w-full bg-sidebar h-1.5 mt-1">
              <motion.div
                className={cn(
                  'h-1.5',
                  agent.status === 'failed' ? 'bg-destructive' : 'bg-foreground'
                )}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs font-serif italic text-muted-foreground">
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
            className="pt-3 border-t border-border"
          >
            <span className="block uppercase tracking-wider text-[10px] text-success/60 mb-1">Result</span>
            <div className="text-xs text-success truncate" title={agent.result.topic}>
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
            className="pt-3 border-t border-border"
          >
            <span className="block uppercase tracking-wider text-[10px] text-destructive/60 mb-1">Error</span>
            <div className="text-xs text-destructive truncate" title={agent.result?.reason}>
              {agent.result?.reason || 'Unknown error'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inspect Button */}
      <button
        onClick={() => onInspect(agent)}
        className="mt-4 w-full py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground border border-border hover:border-foreground hover:text-foreground transition-colors"
      >
        Inspect
      </button>
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
    <div className="bg-card p-6 border border-border shadow-sm flex flex-col gap-4 opacity-60">
      <div className="flex justify-between items-start border-b border-border pb-3">
        <div>
          <h3 className="font-serif text-2xl font-bold text-foreground">{unitLabel}</h3>
          <span className="text-xs text-muted-foreground/60 uppercase tracking-widest">Standby</span>
        </div>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted-foreground/10 uppercase tracking-wider">
          Idle
        </span>
      </div>
      <div className="mt-2 text-xs font-serif italic text-muted-foreground">
        Waiting for queue allocation...
      </div>
    </div>
  );
});
