/**
 * Swarm Event Emitter
 *
 * Manages real-time event broadcasting for the Learning Stream Swarm.
 * Allows SSE endpoints to subscribe to swarm events and receive updates.
 */

import type { SwarmEvent, AgentInfo } from './types';

export type SwarmEventCallback = (event: SwarmEvent) => void;

interface ActiveSwarm {
  brainliftId: number;
  startTime: number;
  agents: Map<string, AgentInfo>;
  subscribers: Set<SwarmEventCallback>;
  eventCounter: number;
}

/**
 * Global registry of active swarms.
 * Key is brainliftId, value is the active swarm state.
 */
const activeSwarms = new Map<number, ActiveSwarm>();

/**
 * Pending subscribers waiting for a swarm to start.
 * Key is brainliftId, value is set of callbacks.
 */
const pendingSubscribers = new Map<number, Set<SwarmEventCallback>>();

/**
 * Generate a unique event ID for SSE.
 */
function generateEventId(brainliftId: number, counter: number): string {
  return `swarm-${brainliftId}-${counter}`;
}

/**
 * Start tracking a new swarm run.
 */
export function startSwarm(brainliftId: number): void {
  // Clean up any existing swarm for this brainlift
  activeSwarms.delete(brainliftId);

  // Transfer any pending subscribers to the new swarm
  const pending = pendingSubscribers.get(brainliftId);
  const pendingCount = pending?.size ?? 0;
  const initialSubscribers = pending ? new Set(pending) : new Set<SwarmEventCallback>();
  pendingSubscribers.delete(brainliftId);

  console.log(`[SwarmEmitter] startSwarm(${brainliftId}) - transferring ${pendingCount} pending subscribers`);

  activeSwarms.set(brainliftId, {
    brainliftId,
    startTime: Date.now(),
    agents: new Map(),
    subscribers: initialSubscribers,
    eventCounter: 0,
  });

  emitEvent(brainliftId, {
    type: 'swarm:start',
    brainliftId,
    data: { startTime: Date.now() },
  });
}

/**
 * End swarm tracking and notify subscribers.
 */
export function endSwarm(
  brainliftId: number,
  result: { success: boolean; totalSaved: number; duplicatesSkipped: number; errors: string[] }
): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  emitEvent(brainliftId, {
    type: 'swarm:complete',
    brainliftId,
    data: {
      ...result,
      durationMs: Date.now() - swarm.startTime,
      agentCount: swarm.agents.size,
    },
  });

  // Keep swarm data around briefly for late subscribers, then clean up
  setTimeout(() => {
    activeSwarms.delete(brainliftId);
  }, 5000);
}

/**
 * Register a new agent being spawned.
 */
export function registerAgent(
  brainliftId: number,
  agentInfo: AgentInfo
): void {
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
    },
  });
}

/**
 * Record an activity event for an agent.
 */
export function recordAgentActivity(
  brainliftId: number,
  toolUseId: string,
  eventType: string,
  data: Record<string, unknown>
): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  const agent = swarm.agents.get(toolUseId);
  if (!agent) return;

  // Update agent status to running if it was spawning
  if (agent.status === 'spawning') {
    agent.status = 'running';
  }

  // Add event to agent's log
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
    },
  });
}

/**
 * Mark an agent as complete.
 */
export function completeAgent(
  brainliftId: number,
  toolUseId: string,
  result: { found: boolean; url?: string; topic?: string; reason?: string }
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
      url: result.url,
      topic: result.topic,
      reason: result.reason,
      durationMs: agent.endTime - agent.startTime,
    },
  });

  // Emit progress update
  const completed = Array.from(swarm.agents.values()).filter(
    (a) => a.status === 'complete' || a.status === 'failed'
  ).length;

  emitEvent(brainliftId, {
    type: 'swarm:progress',
    brainliftId,
    data: {
      completed,
      total: swarm.agents.size,
      running: swarm.agents.size - completed,
    },
  });
}

/**
 * Mark an agent as failed.
 */
export function failAgent(
  brainliftId: number,
  toolUseId: string,
  error: string
): void {
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
      error,
      durationMs: agent.endTime - agent.startTime,
    },
  });
}

/**
 * Subscribe to events for a specific brainlift's swarm.
 * If no swarm is active, adds to pending subscribers (will receive events when swarm starts).
 * Returns an unsubscribe function.
 */
export function subscribe(
  brainliftId: number,
  callback: SwarmEventCallback
): () => void {
  const swarm = activeSwarms.get(brainliftId);

  if (!swarm) {
    // No active swarm - add to pending subscribers
    // Will be transferred to active swarm when startSwarm() is called
    if (!pendingSubscribers.has(brainliftId)) {
      pendingSubscribers.set(brainliftId, new Set());
    }
    pendingSubscribers.get(brainliftId)!.add(callback);
    console.log(`[SwarmEmitter] subscribe(${brainliftId}) - no active swarm, added to pending (now ${pendingSubscribers.get(brainliftId)!.size} pending)`);

    return () => {
      const pending = pendingSubscribers.get(brainliftId);
      if (pending) {
        pending.delete(callback);
        if (pending.size === 0) {
          pendingSubscribers.delete(brainliftId);
        }
      }
      // Also try to remove from active swarm (in case it started meanwhile)
      const activeSwarm = activeSwarms.get(brainliftId);
      if (activeSwarm) {
        activeSwarm.subscribers.delete(callback);
      }
    };
  }

  swarm.subscribers.add(callback);

  // Send current state to new subscriber
  const agents = Array.from(swarm.agents.values());
  callback({
    id: generateEventId(brainliftId, swarm.eventCounter++),
    type: 'swarm:progress',
    brainliftId,
    timestamp: Date.now(),
    data: {
      agents: agents.map((a) => ({
        agentNumber: a.agentNumber,
        toolUseId: a.toolUseId,
        description: a.description,
        resourceType: a.resourceType,
        status: a.status,
        events: a.events,
        result: a.result,
      })),
      completed: agents.filter((a) => a.status === 'complete' || a.status === 'failed').length,
      total: agents.length,
    },
  });

  return () => {
    swarm.subscribers.delete(callback);
  };
}

/**
 * Check if a swarm is currently active for a brainlift.
 */
export function isSwarmActive(brainliftId: number): boolean {
  return activeSwarms.has(brainliftId);
}

/**
 * Get current state of a swarm.
 */
export function getSwarmState(brainliftId: number): ActiveSwarm | undefined {
  return activeSwarms.get(brainliftId);
}

/**
 * Internal: emit an event to all subscribers.
 */
function emitEvent(
  brainliftId: number,
  event: Omit<SwarmEvent, 'id' | 'timestamp'>
): void {
  const swarm = activeSwarms.get(brainliftId);
  if (!swarm) return;

  const fullEvent: SwarmEvent = {
    ...event,
    id: generateEventId(brainliftId, swarm.eventCounter++),
    timestamp: Date.now(),
  };

  // Convert Set to array for iteration (avoids TypeScript downlevelIteration requirement)
  const callbacks = Array.from(swarm.subscribers);

  // Only log for important events to avoid spam
  if (event.type === 'swarm:start' || event.type === 'agent:spawn' || event.type === 'swarm:complete') {
    console.log(`[SwarmEmitter] emitEvent(${brainliftId}, ${event.type}) → ${callbacks.length} subscribers`);
  }

  for (const callback of callbacks) {
    try {
      callback(fullEvent);
    } catch (err) {
      console.error('[SwarmEmitter] Error in subscriber callback:', err);
    }
  }
}
