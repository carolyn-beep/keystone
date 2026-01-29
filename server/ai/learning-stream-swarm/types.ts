/**
 * Shared types for the Learning Stream Swarm
 */

export interface BrainliftContext {
  id: number;
  title: string;
  description: string;
  displayPurpose: string | null;
  facts: Array<{
    id: number;
    fact: string;
    category: string;
    score: number;
  }>;
  experts: Array<{
    id: number;
    name: string;
    twitterHandle: string | null;
    rankScore: number | null;
  }>;
  existingTopics: string[];
}

export interface LearningResourceItem {
  type: 'Substack' | 'Twitter' | 'Blog' | 'Research' | 'Academic Paper' | 'Podcast' | 'Video';
  author: string;
  topic: string;
  time: string;
  facts: string;
  url: string;
  relevanceScore: string;
  aiRationale: string;
}

export interface SwarmResult {
  success: boolean;
  totalSaved: number;
  duplicatesSkipped: number;
  errors: string[];
  durationMs: number;
}

export interface ResearchTask {
  taskNumber: number;
  resourceType: string;
  searchFocus: string;
  expertName?: string;
}

/**
 * Number of sub-agents to spawn. Configurable via SWARM_AGENT_COUNT env var.
 */
export const SWARM_AGENT_COUNT = parseInt(process.env.SWARM_AGENT_COUNT || '5', 10);

/**
 * Relative weights for resource type distribution.
 * These are normalized to produce the actual counts based on SWARM_AGENT_COUNT.
 */
export const RESOURCE_TYPE_WEIGHTS = {
  Substack: 4,
  'Academic Paper': 3,
  Twitter: 3,
  Blog: 3,
  Research: 3,
  Podcast: 2,
  Video: 2,
} as const;

export type ResourceType = keyof typeof RESOURCE_TYPE_WEIGHTS;

/**
 * Generate resource type distribution based on target agent count.
 * Distributes counts proportionally based on weights, ensuring at least 1 of each
 * type when possible, and the total equals the target count.
 */
export function generateResourceDistribution(targetCount: number): Record<ResourceType, number> {
  const types = Object.keys(RESOURCE_TYPE_WEIGHTS) as ResourceType[];
  const totalWeight = Object.values(RESOURCE_TYPE_WEIGHTS).reduce((a, b) => a + b, 0);

  // Start with proportional distribution
  const distribution: Record<ResourceType, number> = {} as Record<ResourceType, number>;
  let allocated = 0;

  // First pass: allocate proportionally (floor)
  for (const type of types) {
    const weight = RESOURCE_TYPE_WEIGHTS[type];
    const count = Math.floor((weight / totalWeight) * targetCount);
    distribution[type] = count;
    allocated += count;
  }

  // Second pass: distribute remaining slots to highest-weight types
  let remaining = targetCount - allocated;
  const sortedTypes = [...types].sort((a, b) => RESOURCE_TYPE_WEIGHTS[b] - RESOURCE_TYPE_WEIGHTS[a]);

  for (const type of sortedTypes) {
    if (remaining <= 0) break;
    distribution[type]++;
    remaining--;
  }

  return distribution;
}

// ============================================================================
// Per-Agent Tracking Types
// ============================================================================

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

// ============================================================================
// Swarm Event Types (for SSE streaming)
// ============================================================================

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
