import { useState, useEffect, useCallback, useRef } from 'react';

// Types matching backend definitions
export type AgentStatus = 'spawning' | 'running' | 'complete' | 'failed';

export interface AgentEvent {
  timestamp: number;
  type: string;
  data: Record<string, unknown>;
}

export interface AgentInfo {
  agentNumber: number;
  toolUseId: string;
  description: string;
  resourceType: string;
  status: AgentStatus;
  startTime: number;
  endTime?: number;
  events: AgentEvent[];
  result?: {
    found: boolean;
    url?: string;
    topic?: string;
    reason?: string;
  };
}

export type SwarmStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

export interface OrchestratorLog {
  timestamp: number;
  message: string;
  type: 'info' | 'spawn' | 'complete' | 'error' | 'progress';
}

export interface SwarmState {
  status: SwarmStatus;
  agents: Map<string, AgentInfo>;
  startTime?: number;
  completedCount: number;
  totalCount: number;
  error?: string;
  orchestratorLogs: OrchestratorLog[];
}

interface SwarmEvent {
  id: string;
  type: string;
  brainliftId: number;
  agentId?: string;
  agentNumber?: number;
  data: Record<string, unknown>;
  timestamp: number;
}

const MAX_ORCHESTRATOR_LOGS = 50; // Keep last 50 logs in memory

/**
 * Hook for subscribing to real-time swarm events via SSE.
 *
 * @param slug - Brainlift slug
 * @param enabled - Whether to connect to SSE (default: true)
 * @returns Swarm state with agents and status
 */
export function useSwarmEvents(slug: string, enabled = true) {
  const [state, setState] = useState<SwarmState>({
    status: 'idle',
    agents: new Map(),
    completedCount: 0,
    totalCount: 0,
    orchestratorLogs: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const completedRef = useRef<boolean>(false); // Track if swarm completed gracefully

  // Helper to add orchestrator log
  const addLog = useCallback((message: string, type: OrchestratorLog['type'] = 'info') => {
    setState((prev) => {
      const newLogs = [
        ...prev.orchestratorLogs,
        { timestamp: Date.now(), message, type },
      ].slice(-MAX_ORCHESTRATOR_LOGS);
      return { ...prev, orchestratorLogs: newLogs };
    });
  }, []);

  // Helper to update a specific agent
  const updateAgent = useCallback((agentId: string, updates: Partial<AgentInfo>) => {
    setState((prev) => {
      const newAgents = new Map(prev.agents);
      const existing = newAgents.get(agentId);
      if (existing) {
        newAgents.set(agentId, { ...existing, ...updates });
      } else {
        // Create new agent entry
        newAgents.set(agentId, {
          agentNumber: updates.agentNumber ?? 0,
          toolUseId: agentId,
          description: (updates as AgentInfo).description ?? '',
          resourceType: (updates as AgentInfo).resourceType ?? 'Unknown',
          status: (updates as AgentInfo).status ?? 'spawning',
          startTime: (updates as AgentInfo).startTime ?? Date.now(),
          events: (updates as AgentInfo).events ?? [],
          ...updates,
        });
      }

      // Recalculate counts
      const completed = Array.from(newAgents.values()).filter(
        (a) => a.status === 'complete' || a.status === 'failed'
      ).length;

      return {
        ...prev,
        agents: newAgents,
        completedCount: completed,
        totalCount: newAgents.size,
      };
    });
  }, []);

  // Connect to SSE
  const connect = useCallback(() => {
    if (!slug || !enabled) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('[SSE] Connecting to swarm events...', { slug });
    completedRef.current = false; // Reset completion flag
    setState((prev) => ({ ...prev, status: 'connecting', error: undefined }));
    addLog('Establishing uplink to swarm controller...', 'info');

    const eventSource = new EventSource(`/api/brainlifts/${slug}/learning-stream/swarm-events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Connection opened');
      addLog('Uplink established. Awaiting telemetry...', 'info');
    };

    // Handle connection event
    eventSource.addEventListener('connected', () => {
      console.log('[SSE] Received: connected');
      setState((prev) => ({ ...prev, status: 'running' }));
    });

    // Handle idle event (no active swarm)
    eventSource.addEventListener('idle', () => {
      console.log('[SSE] Received: idle (no active swarm yet, waiting...)');
      setState((prev) => ({ ...prev, status: 'idle' }));
      addLog('No active mission. Standing by...', 'info');
    });

    // Handle swarm start
    eventSource.addEventListener('swarm:start', (e) => {
      console.log('[SSE] Received: swarm:start');
      const event: SwarmEvent = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        status: 'running',
        agents: new Map(),
        startTime: event.data.startTime as number,
        completedCount: 0,
        totalCount: 0,
        orchestratorLogs: [], // Clear logs on new swarm
      }));
      addLog('MISSION INITIALIZED. Deploying research units...', 'info');
    });

    // Handle swarm progress (bulk state update)
    eventSource.addEventListener('swarm:progress', (e) => {
      console.log('[SSE] Received: swarm:progress', e.data);
      const event: SwarmEvent = JSON.parse(e.data);
      const data = event.data;

      // If data contains full agent list, update all
      if (Array.isArray(data.agents)) {
        const newAgents = new Map<string, AgentInfo>();
        for (const agent of data.agents as AgentInfo[]) {
          newAgents.set(agent.toolUseId, agent);
        }

        const completed = data.completed as number;
        const total = newAgents.size;

        setState((prev) => ({
          ...prev,
          status: 'running',
          agents: newAgents,
          completedCount: completed ?? 0,
          totalCount: total,
        }));

        if (completed > 0) {
          addLog(`Progress: ${completed}/${total} units reporting...`, 'progress');
        }
      } else {
        // Just counts update
        const completed = data.completed as number;
        const total = data.total as number;
        setState((prev) => ({
          ...prev,
          completedCount: completed ?? prev.completedCount,
          totalCount: total ?? prev.totalCount,
        }));
      }
    });

    // Handle agent spawn
    eventSource.addEventListener('agent:spawn', (e) => {
      console.log('[SSE] Received: agent:spawn', e.data);
      const event: SwarmEvent = JSON.parse(e.data);
      if (!event.agentId) return;

      const unitNum = String(event.agentNumber ?? 0).padStart(2, '0');
      const resourceType = event.data.resourceType as string;

      updateAgent(event.agentId, {
        agentNumber: event.agentNumber ?? 0,
        description: event.data.description as string,
        resourceType,
        status: 'spawning',
        startTime: event.timestamp,
        events: [],
      });

      setState((prev) => ({ ...prev, status: 'running' }));
      addLog(`UNIT-${unitNum} deployed → ${resourceType}`, 'spawn');
    });

    // Handle agent activity
    eventSource.addEventListener('agent:activity', (e) => {
      const event: SwarmEvent = JSON.parse(e.data);
      if (!event.agentId) return;

      setState((prev) => {
        const agent = prev.agents.get(event.agentId!);
        if (!agent) return prev;

        const newAgents = new Map(prev.agents);
        newAgents.set(event.agentId!, {
          ...agent,
          status: 'running',
          events: [
            ...agent.events,
            {
              timestamp: event.timestamp,
              type: event.data.eventType as string,
              data: event.data,
            },
          ],
        });

        return { ...prev, agents: newAgents };
      });
    });

    // Handle agent complete
    eventSource.addEventListener('agent:complete', (e) => {
      const event: SwarmEvent = JSON.parse(e.data);
      if (!event.agentId) return;

      const unitNum = String(event.agentNumber ?? 0).padStart(2, '0');
      const success = event.data.success as boolean;

      setState((prev) => {
        const agent = prev.agents.get(event.agentId!);
        if (!agent) return prev;

        const newAgents = new Map(prev.agents);

        newAgents.set(event.agentId!, {
          ...agent,
          status: success ? 'complete' : 'failed',
          endTime: event.timestamp,
          result: {
            found: success,
            url: event.data.url as string | undefined,
            topic: event.data.topic as string | undefined,
            reason: (event.data.reason || event.data.error) as string | undefined,
          },
        });

        const completed = Array.from(newAgents.values()).filter(
          (a) => a.status === 'complete' || a.status === 'failed'
        ).length;

        return {
          ...prev,
          agents: newAgents,
          completedCount: completed,
        };
      });

      if (success) {
        const topic = event.data.topic as string;
        const truncated = topic && topic.length > 40 ? topic.slice(0, 40) + '...' : topic;
        addLog(`UNIT-${unitNum} ✓ Found: "${truncated}"`, 'complete');
      } else {
        const reason = (event.data.reason || event.data.error || 'Unknown error') as string;
        addLog(`UNIT-${unitNum} ✗ ${reason}`, 'error');
      }
    });

    // Handle swarm complete
    eventSource.addEventListener('swarm:complete', (e) => {
      console.log('[SSE] Received: swarm:complete');
      completedRef.current = true; // Mark as gracefully completed
      const event: SwarmEvent = JSON.parse(e.data);
      const data = event.data;

      setState((prev) => ({
        ...prev,
        status: 'complete',
      }));

      const saved = data.totalSaved as number;
      const duplicates = data.duplicatesSkipped as number;
      const errors = (data.errors as string[]) || [];

      addLog(`MISSION COMPLETE. Saved: ${saved}, Duplicates: ${duplicates}`, 'complete');

      if (errors.length > 0) {
        for (const err of errors.slice(0, 3)) {
          addLog(`ERROR: ${err}`, 'error');
        }
      }

      // Connection will be closed by server - completedRef prevents error handler from firing
    });

    // Handle errors - no auto-reconnect, show RETRY button instead
    eventSource.onerror = (e) => {
      // If swarm completed gracefully, this is expected - don't treat as error
      if (completedRef.current) {
        console.log('[SSE] Connection closed after completion (expected)');
        eventSource.close();
        return;
      }

      console.error('[SSE] Connection error:', e, 'readyState:', eventSource.readyState);
      eventSource.close();

      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'Connection lost. Click RETRY to reconnect.',
      }));
      addLog('CRITICAL: Uplink lost. Manual reconnection required.', 'error');
    };
  }, [slug, enabled, updateAgent, addLog]);

  // Disconnect from SSE
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Connect on mount/enable, disconnect on unmount/disable
  useEffect(() => {
    if (enabled && slug) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [slug, enabled, connect, disconnect]);

  // Convert agents map to sorted array
  const agentsArray = Array.from(state.agents.values()).sort(
    (a, b) => a.agentNumber - b.agentNumber
  );

  // Get failed agents count
  const failedCount = agentsArray.filter((a) => a.status === 'failed').length;

  return {
    // State
    status: state.status,
    agents: agentsArray,
    agentsMap: state.agents,
    startTime: state.startTime,
    completedCount: state.completedCount,
    totalCount: state.totalCount,
    error: state.error,
    orchestratorLogs: state.orchestratorLogs,

    // Derived
    isActive: state.status === 'running' || state.status === 'connecting',
    isComplete: state.status === 'complete',
    isError: state.status === 'error',
    failedCount,

    // Actions
    connect,
    disconnect,
  };
}
