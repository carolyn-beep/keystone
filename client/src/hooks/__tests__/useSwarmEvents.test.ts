import { describe, expect, it } from 'vitest';
import { mergeAgentEvents, type AgentEvent } from '../useSwarmEvents';

describe('mergeAgentEvents', () => {
  it('preserves local activity events when a later swarm snapshot has fewer events', () => {
    const spawn: AgentEvent = {
      timestamp: 100,
      type: 'spawn',
      data: { description: 'Find paper', resourceType: 'Academic Paper' },
    };
    const fetch: AgentEvent = {
      timestamp: 200,
      type: 'fetch',
      data: { url: 'https://example.com/paper' },
    };

    expect(mergeAgentEvents([spawn, fetch], [spawn])).toEqual([spawn, fetch]);
  });

  it('deduplicates repeated SSE events and keeps timeline order', () => {
    const search: AgentEvent = {
      timestamp: 300,
      type: 'search',
      data: { query: 'MCP tool design' },
    };
    const result: AgentEvent = {
      timestamp: 500,
      type: 'result',
      data: { success: true, topic: 'MCP ToolBench' },
    };

    expect(mergeAgentEvents([result], [search, result])).toEqual([search, result]);
  });
});
