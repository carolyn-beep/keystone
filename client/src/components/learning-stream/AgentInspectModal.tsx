import { memo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import type { AgentInfo, AgentEvent } from '@/hooks/useSwarmEvents';
import { cn } from '@/lib/utils';

// Event type to display style mapping
const EVENT_STYLES: Record<string, { color: string; label: string }> = {
  spawn: { color: 'text-muted-foreground', label: 'Init' },
  search: { color: 'text-info', label: 'Search' },
  fetch: { color: 'text-warning', label: 'Fetch' },
  reasoning: { color: 'text-muted-foreground', label: 'Think' },
  check_duplicate: { color: 'text-secondary', label: 'Check' },
  save_item: { color: 'text-success', label: 'Save' },
  result: { color: 'text-success', label: 'Result' },
  error: { color: 'text-destructive', label: 'Error' },
};

interface AgentInspectModalProps {
  agent: AgentInfo | null;
  onClose: () => void;
}

/**
 * Modal displaying detailed activity log for a single agent.
 * Uses shared layout animation with AgentCard for seamless expansion.
 *
 * IMPORTANT: The modal content uses layoutId to share layout with card.
 * The backdrop is handled separately with AnimatePresence for fade.
 */
export const AgentInspectModal = memo(function AgentInspectModal({
  agent,
  onClose,
}: AgentInspectModalProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when events change
  useEffect(() => {
    if (logContainerRef.current && agent) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [agent?.events.length]);

  // Live elapsed time - updates every 100ms for running agents
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // Only run timer if agent is still running
    if (!agent || agent.endTime) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => clearInterval(interval);
  }, [agent?.endTime]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!agent) return null;

  const agentLabel = `Agent ${agent.agentNumber}`;

  // Calculate elapsed time
  const elapsed = agent.endTime
    ? ((agent.endTime - agent.startTime) / 1000).toFixed(1)
    : ((now - agent.startTime) / 1000).toFixed(1);

  // Status styling
  const statusColor =
    agent.status === 'running'
      ? 'text-warning'
      : agent.status === 'complete'
        ? 'text-success'
        : agent.status === 'failed'
          ? 'text-destructive'
          : 'text-muted-foreground';

  const statusIndicator =
    agent.status === 'running'
      ? 'bg-warning animate-pulse'
      : agent.status === 'complete'
        ? 'bg-success'
        : agent.status === 'failed'
          ? 'bg-destructive'
          : 'bg-muted-foreground/50';

  return createPortal(
    <>
      {/* Backdrop - separate from modal for clean fade animation */}
      <AnimatePresence>
        {agent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Modal content - uses shared layoutId with card */}
      <motion.div
        layoutId={`agent-card-${agent.toolUseId}`}
        className={cn(
          'fixed z-50 bg-card-elevated rounded-xl shadow-lg overflow-hidden flex flex-col',
          'inset-4 md:inset-8 lg:left-[15%] lg:right-[15%] lg:top-[10%] lg:bottom-[10%]'
        )}
        transition={{ type: 'spring', duration: 0.5, bounce: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <motion.div
          layout="position"
          className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border"
        >
          <div className="flex items-center gap-3">
            <h3 className="font-serif text-lg text-foreground">{agentLabel}</h3>
            <div className={cn('w-2.5 h-2.5 rounded-full', statusIndicator)} />
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </motion.div>

        {/* Meta Info Bar */}
        <motion.div
          layout="position"
          className="flex-shrink-0 flex items-center gap-6 px-6 py-3 bg-sidebar border-b border-border text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Type:</span>
            <span className="text-foreground">{agent.resourceType}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            <span className={cn('font-semibold', statusColor)}>
              {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Elapsed:</span>
            <span className="text-foreground font-mono">{elapsed}s</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Events:</span>
            <span className="text-foreground font-mono">{agent.events.length}</span>
          </div>
        </motion.div>

        {/* Log Content - flex-1 with min-h-0 to allow shrinking */}
        <div
          ref={logContainerRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1.5 bg-sidebar font-mono text-xs scrollbar-styled"
        >
          <AnimatePresence mode="popLayout">
            {agent.events.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-muted-foreground italic"
              >
                Awaiting activity...
              </motion.div>
            ) : (
              agent.events.map((event, idx) => (
                <LogEntry key={idx} event={event} index={idx} />
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Result Footer (if complete) - flex-shrink-0 to always show */}
        {agent.status === 'complete' && agent.result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-shrink-0 px-6 py-4 bg-card border-t border-border"
          >
            {agent.result.found ? (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-success">
                  Resource Found
                </div>
                <div className="text-sm text-foreground">{agent.result.topic}</div>
                {agent.result.url && (
                  <a
                    href={agent.result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-info hover:text-info/80 transition-colors"
                  >
                    <ExternalLink size={12} />
                    <span className="truncate max-w-md">{agent.result.url}</span>
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                  Not Found
                </div>
                <div className="text-sm text-muted-foreground">{agent.result.reason}</div>
              </div>
            )}
          </motion.div>
        )}

        {agent.status === 'failed' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-shrink-0 px-6 py-4 bg-destructive-soft border-t border-destructive/20"
          >
            <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-destructive">
              Error
            </div>
            <div className="text-sm text-destructive mt-1">
              {agent.result?.reason || 'Unknown error'}
            </div>
          </motion.div>
        )}
      </motion.div>
    </>,
    document.body
  );
});

// Individual log entry component
interface LogEntryProps {
  event: AgentEvent;
  index: number;
}

const LogEntry = memo(function LogEntry({ event, index }: LogEntryProps) {
  const style = EVENT_STYLES[event.type] || { color: 'text-muted-foreground', label: event.type };

  // Format timestamp for display
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Extract display content based on event type
  let content = '';
  switch (event.type) {
    case 'search':
      content = `"${event.data.query}"`;
      break;
    case 'fetch':
      if (event.data.source === 'youtube' && event.data.videoId) {
        content = `YouTube: ${event.data.videoId}`;
      } else {
        content = String(event.data.url || '');
      }
      break;
    case 'reasoning':
      content = String(event.data.text || '').substring(0, 100) + (String(event.data.text || '').length > 100 ? '...' : '');
      break;
    case 'check_duplicate':
      content = `Checking: ${event.data.url}`;
      break;
    case 'save_item':
      content = `[${event.data.type}] "${event.data.topic}"`;
      break;
    case 'error':
      content = String(event.data.error || 'Unknown error');
      break;
    default:
      content = JSON.stringify(event.data).substring(0, 80);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className="flex items-start gap-3"
    >
      <span className="text-muted-foreground/60 shrink-0">{formatTime(event.timestamp)}</span>
      <span className={cn('font-semibold shrink-0 w-14', style.color)}>{style.label}</span>
      <span className="text-muted-foreground truncate" title={content}>
        {content}
      </span>
    </motion.div>
  );
});
