import { describe, expect, it } from 'vitest';
import { __learningStreamSwarmTestInternals } from '../index';

const {
  isAgentLaunchAcknowledgement,
  parseAgentCompletionNotification,
  parseAgentResult,
  parseAgentSummaryResult,
} = __learningStreamSwarmTestInternals;

describe('learning stream swarm agent result parsing', () => {
  it('does not treat the Agent launch acknowledgement as a final not-found result', () => {
    const launchText = [
      'Async agent launched successfully.',
      'agentId: ad48742010e3534a9 (internal ID - do not mention to user.)',
      'output_file: /tmp/claude/tasks/ad48742010e3534a9.output',
    ].join('\n');

    expect(isAgentLaunchAcknowledgement(launchText)).toBe(true);
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
    expect(parseAgentCompletionNotification({ status: 'completed', summary })).toEqual({
      found: true,
      topic: 'Token-Efficient Agents: Building MCP-Heavy Agents Without Burning Tokens',
    });
  });

  it('parses failed or stopped task notifications as not found', () => {
    expect(parseAgentCompletionNotification({
      status: 'failed',
      summary: 'No matching article could be verified.',
    })).toEqual({
      found: false,
      reason: 'No matching article could be verified.',
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
});
