/**
 * Swarm Event Emitter v2.
 *
 * Export-compatible with the v1 emitter. Payloads keep the v1 field names and
 * also tolerate extra fields such as runId/agentCount for v2 consumers.
 */

import type { AgentInfo, SwarmEvent } from './types';

export type SwarmEventCallback = (event: SwarmEvent) => void;

interface ActiveSwarm {
  brainliftId: number;
  startTime: number;
  agents: Map<string, AgentInfo>;
  subscribers: Set<SwarmEventCallback>;
  eventCounter: number;
  runId?: number;
  agentCount?: number;
}

const activeSwarms = new Map<number, ActiveSwarm>();
const pendingSubscribers = new Map<number, Set<SwarmEventCallback>>();

function generateEventId(brainliftId: number, counter: number): string {
  return `swarm-${brainliftId}-${counter}`;
}

export function startSwarm(brainliftId: number, runId?: number, agentCount?: number): void {
  activeSwarms.delete(brainliftId);

  const pending = pendingSubscribers.get(brainliftId);
  const initialSubscribers = pending ? new Set(pending) : new Set<SwarmEventCallback>();
  pendingSubscribers.delete(brainliftId);

  activeSwarms.set(brainliftId, {
    brainliftId,
    startTime: Date.now(),
    agents: new Map(),
    subscribers: initialSubscribers,
    eventCounter: 0,
    runId,
    agentCount,
  });

  emitEvent(brainliftId, {
    type: 'swarm:start',
    brainliftId,
    data: { startTime: Date.now(), runId, agentCount },
  });
}

export function endSwarm(
  brainliftId: number,
  result: { success: boolean; totalSaved: number; duplicatesSkipped: number; errors: string[]; failedCount?: number },
): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  emitEvent(brainliftId, {
    type: 'swarm:complete',
    brainliftId,
    data: {
      ...result,
      durationMs: Date.now() - swarm.startTime,
      agentCount: swarm.agentCount ?? swarm.agents.size,
      runId: swarm.runId,
    },
  });

  setTimeout(() => {
    activeSwarms.delete(brainliftId);
  }, 5000);
}

export function registerAgent(brainliftId: number, agentInfo: AgentInfo): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  swarm.agents.set(agentInfo.toolUseId, agentInfo);

  emitEvent(brainliftId, {
    type: 'agent:spawn',
    brainliftId,
    agentId: agentInfo.toolUseId,
    agentNumber: agentInfo.agentNumber,
    data: {
      description: agentInfo.description,
      resourceType: agentInfo.resourceType,
      runId: swarm.runId,
      idx: agentInfo.agentNumber - 1,
    },
  });
}

export function recordAgentActivity(
  brainliftId: number,
  toolUseId: string,
  eventType: string,
  data: Record<string, unknown>,
): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  const agent = swarm.agents.get(toolUseId);
  if (!agent) return;

  if (agent.status === 'spawning') {
    agent.status = 'running';
  }

  agent.events.push({
    timestamp: Date.now(),
    type: eventType as any,
    data,
  });

  emitEvent(brainliftId, {
    type: 'agent:activity',
    brainliftId,
    agentId: toolUseId,
    agentNumber: agent.agentNumber,
    data: {
      eventType,
      ...data,
      runId: swarm.runId,
    },
  });
}

export function completeAgent(
  brainliftId: number,
  toolUseId: string,
  result: { found: boolean; url?: string; topic?: string; reason?: string; saved?: number; duplicate?: boolean },
): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  const agent = swarm.agents.get(toolUseId);
  if (!agent) return;

  agent.status = 'complete';
  agent.endTime = Date.now();
  agent.result = result;

  emitEvent(brainliftId, {
    type: 'agent:complete',
    brainliftId,
    agentId: toolUseId,
    agentNumber: agent.agentNumber,
    data: {
      success: result.found,
      status: 'success',
      saved: result.saved,
      duplicate: result.duplicate,
      url: result.url,
      topic: result.topic,
      reason: result.reason,
      durationMs: agent.endTime - agent.startTime,
      runId: swarm.runId,
    },
  });

  emitProgress(brainliftId, swarm);
}

export function failAgent(brainliftId: number, toolUseId: string, error: string): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  const agent = swarm.agents.get(toolUseId);
  if (!agent) return;

  agent.status = 'failed';
  agent.endTime = Date.now();
  recordAgentActivity(brainliftId, toolUseId, 'error', { error });

  emitEvent(brainliftId, {
    type: 'agent:complete',
    brainliftId,
    agentId: toolUseId,
    agentNumber: agent.agentNumber,
    data: {
      success: false,
      status: 'failed',
      error,
      durationMs: agent.endTime - agent.startTime,
      runId: swarm.runId,
    },
  });

  emitProgress(brainliftId, swarm);
}

function emitProgress(brainliftId: number, swarm: ActiveSwarm): void {
  const completed = Array.from(swarm.agents.values()).filter(
    (agent) => agent.status === 'complete' || agent.status === 'failed',
  ).length;

  emitEvent(brainliftId, {
    type: 'swarm:progress',
    brainliftId,
    data: {
      completed,
      total: swarm.agentCount ?? swarm.agents.size,
      running: (swarm.agentCount ?? swarm.agents.size) - completed,
      runId: swarm.runId,
    },
  });
}

export function subscribe(brainliftId: number, callback: SwarmEventCallback): () => void {
  const swarm = activeSwarms.get(brainliftId);

  if (!swarm) {
    if (!pendingSubscribers.has(brainliftId)) {
      pendingSubscribers.set(brainliftId, new Set());
    }
    pendingSubscribers.get(brainliftId)!.add(callback);

    return () => {
      const pending = pendingSubscribers.get(brainliftId);
      if (pending) {
        pending.delete(callback);
        if (pending.size === 0) {
          pendingSubscribers.delete(brainliftId);
        }
      }
      activeSwarms.get(brainliftId)?.subscribers.delete(callback);
    };
  }

  swarm.subscribers.add(callback);
  const agents = Array.from(swarm.agents.values());
  callback({
    id: generateEventId(brainliftId, swarm.eventCounter++),
    type: 'swarm:progress',
    brainliftId,
    timestamp: Date.now(),
    data: {
      agents: agents.map((agent) => ({
        agentNumber: agent.agentNumber,
        toolUseId: agent.toolUseId,
        description: agent.description,
        resourceType: agent.resourceType,
        status: agent.status,
        events: agent.events,
        result: agent.result,
      })),
      completed: agents.filter((agent) => agent.status === 'complete' || agent.status === 'failed').length,
      total: swarm.agentCount ?? agents.length,
      runId: swarm.runId,
    },
  });

  return () => {
    swarm.subscribers.delete(callback);
  };
}

export function isSwarmActive(brainliftId: number): boolean {
  return activeSwarms.has(brainliftId);
}

export function getSwarmState(brainliftId: number): ActiveSwarm | undefined {
  return activeSwarms.get(brainliftId);
}

function emitEvent(brainliftId: number, event: Omit<SwarmEvent, 'id' | 'timestamp'>): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  const fullEvent: SwarmEvent = {
    ...event,
    id: generateEventId(brainliftId, swarm.eventCounter++),
    timestamp: Date.now(),
  };

  for (const callback of Array.from(swarm.subscribers)) {
    try {
      callback(fullEvent);
    } catch (err) {
      console.error('[SwarmEmitter] Error in subscriber callback:', err);
    }
  }
}

export const swarmEmitter = {
  subscribe,
  startSwarm,
  registerAgent,
  recordAgentActivity,
  completeAgent,
  failAgent,
  endSwarm,
  isSwarmActive,
  getSwarmState,
};
