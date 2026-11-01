/**
 * Shared types for the Learning Stream Swarm v2.
 *
 * These mirror the v1 SSE wire shapes so existing dashboard clients can keep
 * consuming MissionDashboard telemetry unchanged.
 */

export type AgentStatus = 'spawning' | 'running' | 'complete' | 'failed';

export type AgentEventType =
  | 'spawn'
  | 'search'
  | 'fetch'
  | 'reasoning'
  | 'check_duplicate'
  | 'save_item'
  | 'result'
  | 'error';

export interface AgentEvent {
  timestamp: number;
  type: AgentEventType;
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

export interface SwarmResult {
  success: boolean;
  totalSaved: number;
  duplicatesSkipped: number;
  errors: string[];
  durationMs: number;
}

export type SwarmEventType =
  | 'swarm:start'
  | 'swarm:progress'
  | 'swarm:complete'
  | 'agent:spawn'
  | 'agent:activity'
  | 'agent:complete';

export interface SwarmEvent {
  id: string;
  type: SwarmEventType;
  brainliftId: number;
  agentId?: string;
  agentNumber?: number;
  data: Record<string, unknown>;
  timestamp: number;
}
