import { describe, expect, it } from 'vitest';
import { __learningStreamSwarmTestInternals } from '../index';

const {
  extractAgentOutputFile,
  isAgentLaunchAcknowledgement,
  parseAgentResult,
  parseAgentSummaryResult,
  parseSubagentOutputEvents,
} = __learningStreamSwarmTestInternals;

describe('learning stream swarm agent result parsing', () => {
  it('detects Agent launch acknowledgements so they are not treated as terminal results', () => {
    const launchText = [
      'Async agent launched successfully.',
      'agentId: ad48742010e3534a9 (internal ID - do not mention to user.)',
      'output_file: /tmp/claude/tasks/ad48742010e3534a9.output',
    ].join('\n');

    expect(isAgentLaunchAcknowledgement(launchText)).toBe(true);
    expect(extractAgentOutputFile(`${launchText}\nIf asked, tail it.`)).toBe(
      '/tmp/claude/tasks/ad48742010e3534a9.output',
    );
    expect(parseAgentResult([{ type: 'text', text: launchText }])).toEqual({
      found: false,
      reason: 'Could not parse result',
    });
  });

  it('parses task completion summaries that report a saved resource', () => {
    const summary = '✅ **Substack** found & saved — *"Token-Efficient Agents: Building MCP-Heavy Agents Without Burning Tokens"* by Oleg Kozlov.';

    expect(parseAgentSummaryResult(summary)).toEqual({
      found: true,
      topic: 'Token-Efficient Agents: Building MCP-Heavy Agents Without Burning Tokens',
    });
  });

  it('still parses the original JSON result contract', () => {
    expect(parseAgentResult(JSON.stringify({
      found: true,
      resource: {
        topic: 'MCPToolBench++',
        url: 'https://arxiv.org/abs/2508.07575',
      },
    }))).toEqual({
      found: true,
      topic: 'MCPToolBench++',
      url: 'https://arxiv.org/abs/2508.07575',
    });
  });

  it('extracts subagent search, fetch, save, and completion events from background JSONL output', () => {
    const jsonl = [
      JSON.stringify({
        type: 'assistant',
        uuid: 'reason-1',
        message: {
          content: [{ type: 'text', text: 'Searching for an analytics article.' }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'tool-1',
        message: {
          content: [{
            type: 'tool_use',
            id: 'search-1',
            name: 'mcp__exa__web_search_exa',
            input: { query: 'analytics event design best practices' },
          }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'tool-2',
        message: {
          content: [{
            type: 'tool_use',
            id: 'fetch-1',
            name: 'WebFetch',
            input: { url: 'https://example.com/analytics' },
          }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'tool-3',
        message: {
          content: [{
            type: 'tool_use',
            id: 'save-1',
            name: 'mcp__learning-stream__save_learning_item',
            input: {
              type: 'Substack',
              topic: 'Event Analytics',
              url: 'https://example.com/analytics',
            },
          }],
        },
      }),
      JSON.stringify({
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'save-1',
            content: [{ type: 'text', text: '{"success":true,"itemId":1}' }],
          }],
        },
      }),
    ].join('\n');

    expect(parseSubagentOutputEvents(jsonl)).toEqual([
      {
        kind: 'activity',
        key: 'reasoning:reason-1:Searching for an analytics article.',
        eventType: 'reasoning',
        data: { text: 'Searching for an analytics article.' },
      },
      {
        kind: 'activity',
        key: 'tool:search-1',
        eventType: 'search',
        data: { query: 'analytics event design best practices' },
      },
      {
        kind: 'activity',
        key: 'tool:fetch-1',
        eventType: 'fetch',
        data: { url: 'https://example.com/analytics' },
      },
      {
        kind: 'activity',
        key: 'tool:save-1',
        eventType: 'save_item',
        data: {
          type: 'Substack',
          topic: 'Event Analytics',
          url: 'https://example.com/analytics',
        },
      },
      {
        kind: 'complete',
        key: 'complete:save-1',
        result: {
          found: true,
          topic: 'Event Analytics',
          url: 'https://example.com/analytics',
        },
      },
    ]);
  });
});
