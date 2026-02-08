import { memo } from 'react';
import { motion } from 'framer-motion';
import type { OrchestratorLog } from '@/hooks/useSwarmEvents';
import { cn } from '@/lib/utils';

interface ActivityLogProps {
  logs: OrchestratorLog[];
  isError?: boolean;
}

/**
 * Activity log timeline for the Research Observatory.
 * Uses neutral colors and proper dot alignment like the inspo design.
 */
export const ActivityLog = memo(function ActivityLog({
  logs,
  isError = false,
}: ActivityLogProps) {
  return (
    <div>
      {/* Timeline */}
      {logs.length === 0 ? (
        <div className="text-sm text-muted-foreground italic font-serif">
          Awaiting mission data...
        </div>
      ) : (
        <div className="relative space-y-8 pl-4 border-l border-border ml-2">
          {logs.map((log, idx) => (
            <LogEntry
              key={`${log.timestamp}-${idx}`}
              log={log}
              index={idx}
              isLatest={idx === logs.length - 1}
            />
          ))}
        </div>
      )}

      {/* System Load Footer */}
      {logs.length > 0 && (
        <div className="mt-8 bg-card p-4 border border-border shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="font-serif font-bold text-sm text-foreground">System Load</span>
            <span className="text-xs text-muted-foreground">
              {isError ? 'Error' : '34%'}
            </span>
          </div>
          <div className="w-full bg-sidebar h-1">
            <div
              className={cn('h-1 transition-all duration-500', isError ? 'bg-destructive' : 'bg-foreground')}
              style={{ width: isError ? '100%' : '34%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

interface LogEntryProps {
  log: OrchestratorLog;
  index: number;
  isLatest: boolean;
}

const LogEntry = memo(function LogEntry({ log, index, isLatest }: LogEntryProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Determine if this is the active/current log
  const isActive = isLatest && log.type !== 'complete' && log.type !== 'error';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.02,
      }}
      className="relative"
    >
      {/* Timeline dot - positioned to align with the border-l line */}
      <div
        className={cn(
          'absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background',
          isActive ? 'bg-foreground animate-pulse' : 'bg-border'
        )}
      />

      {/* Content */}
      <time className={cn(
        'mb-1 block text-xs font-medium',
        isActive ? 'text-muted-foreground font-bold' : 'text-muted-foreground/60'
      )}>
        {formatTime(log.timestamp)}
      </time>
      <h3 className="text-sm font-serif font-bold text-foreground">
        {getLogTitle(log)}
      </h3>
      <p className={cn(
        'text-xs text-muted-foreground mt-1',
        log.type === 'progress' && isLatest && 'italic'
      )}>
        {log.message}
      </p>
    </motion.div>
  );
});

function getLogTitle(log: OrchestratorLog): string {
  switch (log.type) {
    case 'spawn':
      return 'Agent Spawned';
    case 'progress':
      return 'Processing Data';
    case 'complete':
      return 'Task Complete';
    case 'error':
      return 'Error Detected';
    default:
      return 'Event';
  }
}
