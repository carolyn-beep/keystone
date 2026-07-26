/**
 * Proves that `userFacing: true` causes the AlphaX Grade-5 tone block to be
 * prepended AND the reminder appended to the `system` message that actually
 * reaches the provider. Captures the fetch request body and inspects its
 * `messages[0]` (the system message).
 *
 * Assumes BRAND=keystone in the test environment (set in .env, loaded by vitest).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ALPHAX_GRADE5_TONE_BLOCK,
  ALPHAX_GRADE5_TONE_REMINDER,
} from '../../../brand/shared/tone-grade5';

const ORIGINAL_SYSTEM = 'You are the grader. Be rigorous.';

function mockFetchCapturingBody() {
  const captured: { body?: any } = {};
  const fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
    captured.body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'anthropic/claude-haiku-4.5',
      }),
    };
  });
  return { fetchMock, captured };
}

let originalFetch: typeof globalThis.fetch;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

beforeEach(async () => {
  originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  const client = await import('../index');
  client.resetProviderRegistryForTests();
  const breakers = await import('../circuit-breaker');
  breakers.resetCircuitBreakersForTests();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
  const client = await import('../index');
  client.resetProviderRegistryForTests();
});

describe('userFacing tone injection (AlphaX brand)', () => {
  it('confirms BRAND is keystone in this test environment', async () => {
    const { brandId } = await import('../../../brand');
    expect(brandId).toBe('keystone');
  });

  it('prepends the tone block AND appends the reminder when userFacing=true', async () => {
    const { callModel } = await import('../index');
    const { fetchMock, captured } = mockFetchCapturingBody();
    globalThis.fetch = fetchMock as any;

    await callModel({
      model: 'anthropic/claude-haiku-4.5',
      messages: [{ role: 'user', content: 'hi' }],
      system: ORIGINAL_SYSTEM,
      caller: 'test.userFacing',
      userFacing: true,
    });

    expect(captured.body).toBeDefined();
    const systemMessage = captured.body.messages[0];
    expect(systemMessage.role).toBe('system');

    const systemContent: string = systemMessage.content;

    expect(systemContent.startsWith(ALPHAX_GRADE5_TONE_BLOCK)).toBe(true);
    expect(systemContent.endsWith(ALPHAX_GRADE5_TONE_REMINDER)).toBe(true);
    expect(systemContent).toContain(ORIGINAL_SYSTEM);

    const blockIdx = systemContent.indexOf(ALPHAX_GRADE5_TONE_BLOCK);
    const originalIdx = systemContent.indexOf(ORIGINAL_SYSTEM);
    const reminderIdx = systemContent.indexOf(ALPHAX_GRADE5_TONE_REMINDER);
    expect(blockIdx).toBeLessThan(originalIdx);
    expect(originalIdx).toBeLessThan(reminderIdx);
  });

  it('leaves system untouched when userFacing is not set', async () => {
    const { callModel } = await import('../index');
    const { fetchMock, captured } = mockFetchCapturingBody();
    globalThis.fetch = fetchMock as any;

    await callModel({
      model: 'anthropic/claude-haiku-4.5',
      messages: [{ role: 'user', content: 'hi' }],
      system: ORIGINAL_SYSTEM,
      caller: 'test.notUserFacing',
    });

    const systemMessage = captured.body.messages[0];
    expect(systemMessage.content).toBe(ORIGINAL_SYSTEM);
    expect(systemMessage.content).not.toContain(ALPHAX_GRADE5_TONE_BLOCK);
    expect(systemMessage.content).not.toContain(ALPHAX_GRADE5_TONE_REMINDER);
  });

  it('leaves system untouched when userFacing=false explicitly', async () => {
    const { callModel } = await import('../index');
    const { fetchMock, captured } = mockFetchCapturingBody();
    globalThis.fetch = fetchMock as any;

    await callModel({
      model: 'anthropic/claude-haiku-4.5',
      messages: [{ role: 'user', content: 'hi' }],
      system: ORIGINAL_SYSTEM,
      caller: 'test.userFacingFalse',
      userFacing: false,
    });

    const systemMessage = captured.body.messages[0];
    expect(systemMessage.content).toBe(ORIGINAL_SYSTEM);
  });

  it('still injects when no original system was provided', async () => {
    const { callModel } = await import('../index');
    const { fetchMock, captured } = mockFetchCapturingBody();
    globalThis.fetch = fetchMock as any;

    await callModel({
      model: 'anthropic/claude-haiku-4.5',
      messages: [{ role: 'user', content: 'hi' }],
      caller: 'test.noOriginalSystem',
      userFacing: true,
    });

    const systemMessage = captured.body.messages[0];
    expect(systemMessage.content.startsWith(ALPHAX_GRADE5_TONE_BLOCK)).toBe(true);
    expect(systemMessage.content.endsWith(ALPHAX_GRADE5_TONE_REMINDER)).toBe(true);
  });
});
