import { memo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import type { AgentInfo, AgentEvent } from '@/hooks/useSwarmEvents';

// Event type to display style mapping
const EVENT_STYLES: Record<string, { color: string; label: string }> = {
  spawn: { color: 'text-slate-400', label: 'INIT' },
  search: { color: 'text-cyan-400', label: 'SEARCH' },
  fetch: { color: 'text-amber-400', label: 'FETCH' },
  reasoning: { color: 'text-slate-500', label: 'THINK' },
  check_duplicate: { color: 'text-purple-400', label: 'CHECK' },
  save_item: { color: 'text-emerald-400', label: 'SAVE' },
  result: { color: 'text-emerald-400', label: 'RESULT' },
  error: { color: 'text-red-400', label: 'ERROR' },
};

interface AgentInspectModalProps {
  agent: AgentInfo;
  onClose: () => void;
}

/**
 * Modal displaying detailed activity log for a single agent.
 */
export const AgentInspectModal = memo(function AgentInspectModal({
  agent,
  onClose,
}: AgentInspectModalProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const unitLabel = `UNIT-${String(agent.agentNumber).padStart(2, '0')}`;

  // Auto-scroll to bottom when events change
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [agent.events.length]);

  // Live elapsed time - updates every 100ms for running agents
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // Only run timer if agent is still running
    if (agent.endTime) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => clearInterval(interval);
  }, [agent.endTime]);

  // Calculate elapsed time
  const elapsed = agent.endTime
    ? ((agent.endTime - agent.startTime) / 1000).toFixed(1)
    : ((now - agent.startTime) / 1000).toFixed(1);

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-slate-900 border-2 border-slate-600 rounded-lg font-mono overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
          <h3 className="text-sm font-bold text-slate-200 tracking-wider">
            {unitLabel} ACTIVITY LOG
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Meta Info Bar */}
        <div className="flex items-center gap-6 px-4 py-2 bg-slate-800/50 border-b border-slate-700 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Type:</span>
            <span className="text-slate-300">{agent.resourceType}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Status:</span>
            <span
              className={`font-bold ${
                agent.status === 'running'
                  ? 'text-amber-400'
                  : agent.status === 'complete'
                    ? 'text-emerald-400'
                    : agent.status === 'failed'
                      ? 'text-red-400'
                      : 'text-slate-400'
              }`}
            >
              {agent.status.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Elapsed:</span>
            <span className="text-slate-300">{elapsed}s</span>
          </div>
        </div>

        {/* Log Content */}
        <div ref={logContainerRef} className="h-80 overflow-y-auto p-4 space-y-1 bg-slate-950">
          {agent.events.length === 0 ? (
            <div className="text-slate-600 text-xs italic">Awaiting activity...</div>
          ) : (
            agent.events.map((event, idx) => <LogEntry key={idx} event={event} formatTime={formatTime} />)
          )}
        </div>

        {/* Result Footer (if complete) */}
        {agent.status === 'complete' && agent.result && (
          <div className="px-4 py-3 bg-slate-800 border-t border-slate-700">
            {agent.result.found ? (
              <div className="space-y-2">
                <div className="text-xs text-emerald-400 font-bold">RESOURCE FOUND:</div>
                <div className="text-sm text-slate-200 truncate">{agent.result.topic}</div>
                {agent.result.url && (
                  <a
                    href={agent.result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <ExternalLink size={12} />
                    {agent.result.url}
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-red-400 font-bold">NOT FOUND:</div>
                <div className="text-sm text-slate-400">{agent.result.reason}</div>
              </div>
            )}
          </div>
        )}

        {agent.status === 'failed' && (
          <div className="px-4 py-3 bg-slate-800 border-t border-red-900/50">
            <div className="text-xs text-red-400 font-bold">ERROR:</div>
            <div className="text-sm text-red-300">{agent.result?.reason || 'Unknown error'}</div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

// Individual log entry component
interface LogEntryProps {
  event: AgentEvent;
  formatTime: (ts: number) => string;
}

const LogEntry = memo(function LogEntry({ event, formatTime }: LogEntryProps) {
  const style = EVENT_STYLES[event.type] || { color: 'text-slate-400', label: event.type.toUpperCase() };

  // Extract display content based on event type
  let content = '';
  switch (event.type) {
    case 'search':
      content = `"${event.data.query}"`;
      break;
    case 'fetch':
      content = String(event.data.url || '');
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
    <div className="flex items-start gap-2 text-xs">
      <span className="text-slate-600 shrink-0">{formatTime(event.timestamp)}</span>
      <span className={`font-bold shrink-0 w-16 ${style.color}`}>{style.label}</span>
      <span className="text-slate-400 truncate" title={content}>
        {content}
      </span>
    </div>
  );
});
