/**
 * DOK3 Grading Event Emitter
 *
 * Manages real-time event broadcasting for DOK3 grading jobs.
 * Allows SSE endpoints to subscribe to grading events and receive updates.
 *
 * Pattern mirrors server/ai/learning-stream-swarm/event-emitter.ts
 */

import type { DOK3GradingStage } from '@shared/import-progress';

export interface DOK3GradingEvent {
  id: string;
  type: DOK3GradingStage;
  insightId: number;
  brainliftId: number;
  message: string;
  score?: number;
  error?: string;
  timestamp: number;
}

export type DOK3GradingCallback = (event: DOK3GradingEvent) => void;

interface ActiveGrading {
  brainliftId: number;
  subscribers: Set<DOK3GradingCallback>;
  eventCounter: number;
}

/**
 * Active grading sessions keyed by brainliftId.
 */
const activeGradings = new Map<number, ActiveGrading>();

/**
 * Pending subscribers waiting for a grading session to start.
 */
const pendingSubscribers = new Map<number, Set<DOK3GradingCallback>>();

function generateEventId(brainliftId: number, counter: number): string {
  return `dok3-${brainliftId}-${counter}`;
}

/**
 * Start tracking a new grading session for a brainlift.
 */
export function startGrading(brainliftId: number): void {
  activeGradings.delete(brainliftId);

  // Transfer pending subscribers
  const pending = pendingSubscribers.get(brainliftId);
  const initialSubscribers = pending ? new Set(pending) : new Set<DOK3GradingCallback>();
  pendingSubscribers.delete(brainliftId);

  console.log(`[DOK3GradingEmitter] startGrading(${brainliftId}) - ${initialSubscribers.size} pending subscribers transferred`);

  activeGradings.set(brainliftId, {
    brainliftId,
    subscribers: initialSubscribers,
    eventCounter: 0,
  });
}

/**
 * Emit a grading event to all subscribers.
 */
export function emitEvent(brainliftId: number, event: Omit<DOK3GradingEvent, 'id' | 'timestamp'>): void {
  const grading = activeGradings.get(brainliftId);
  if (!grading) return;

  const fullEvent: DOK3GradingEvent = {
    ...event,
    id: generateEventId(brainliftId, grading.eventCounter++),
    timestamp: Date.now(),
  };

  const callbacks = Array.from(grading.subscribers);
  for (const callback of callbacks) {
    try {
      callback(fullEvent);
    } catch (err) {
      console.error('[DOK3GradingEmitter] Error in subscriber callback:', err);
    }
  }
}

/**
 * End a grading session. Emits a done event and cleans up after a delay.
 */
export function endGrading(brainliftId: number): void {
  const grading = activeGradings.get(brainliftId);
  if (!grading) return;

  emitEvent(brainliftId, {
    type: 'dok3:done',
    insightId: 0,
    brainliftId,
    message: 'All grading complete',
  });

  // Keep around briefly for late subscribers, then clean up
  setTimeout(() => {
    activeGradings.delete(brainliftId);
  }, 5000);
}

/**
 * Subscribe to DOK3 grading events for a brainlift.
 * If no active grading, adds to pending subscribers.
 * Returns an unsubscribe function.
 */
export function subscribe(brainliftId: number, callback: DOK3GradingCallback): () => void {
  const grading = activeGradings.get(brainliftId);

  if (!grading) {
    // No active grading — add to pending
    if (!pendingSubscribers.has(brainliftId)) {
      pendingSubscribers.set(brainliftId, new Set());
    }
    pendingSubscribers.get(brainliftId)!.add(callback);

    return () => {
      const pending = pendingSubscribers.get(brainliftId);
      if (pending) {
        pending.delete(callback);
        if (pending.size === 0) pendingSubscribers.delete(brainliftId);
      }
      // Also remove from active grading if it started meanwhile
      const active = activeGradings.get(brainliftId);
      if (active) active.subscribers.delete(callback);
    };
  }

  grading.subscribers.add(callback);

  return () => {
    grading.subscribers.delete(callback);
  };
}

/**
 * Check if a grading session is active for a brainlift.
 */
export function isGradingActive(brainliftId: number): boolean {
  return activeGradings.has(brainliftId);
}

// Export singleton-style
export const dok3GradingEmitter = {
  startGrading,
  emitEvent,
  endGrading,
  subscribe,
  isGradingActive,
};
