/**
 * Tests for FR9: chat-opener.ts sources the body from brand.config.chatOpenerInstruction.
 *
 * The selector at `client/src/brand/index.ts` resolves the active brand at
 * module-import time based on `import.meta.env.VITE_BRAND`. Each test stubs
 * the env, resets module cache, then re-imports both the brand selector and
 * the chat-opener so the OPENER_PROMPT body reflects the active brand.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('FR9 chat-opener: brand-aware OPENER_PROMPT', () => {
  it('OPENER_PROMPT starts with "[OPENER] " for both brands', async () => {
    vi.stubEnv('VITE_BRAND', 'keystone');
    const keystone = await import('../chat-opener');
    expect(keystone.OPENER_PROMPT.startsWith('[OPENER] ')).toBe(true);

    vi.resetModules();
    vi.stubEnv('VITE_BRAND', 'brainlift');
    const bc = await import('../chat-opener');
    expect(bc.OPENER_PROMPT.startsWith('[OPENER] ')).toBe(true);
  });

  it('Keystone build contains Keystone-specific phrasing', async () => {
    vi.stubEnv('VITE_BRAND', 'keystone');
    const mod = await import('../chat-opener');
    expect(mod.OPENER_PROMPT).toMatch(/Keystone/i);
  });

  it('Keystone Central build contains BC-specific phrasing and zero Keystone-student substring', async () => {
    vi.stubEnv('VITE_BRAND', 'brainlift');
    const mod = await import('../chat-opener');
    expect(mod.OPENER_PROMPT).not.toMatch(/AlphaX/);
    expect(mod.OPENER_PROMPT).toMatch(/Keystone Central|peer-research/i);
  });

  it('isOpenerPromptMessage detects the [OPENER] prefix on AlphaX', async () => {
    vi.stubEnv('VITE_BRAND', 'keystone');
    const mod = await import('../chat-opener');
    expect(
      mod.isOpenerPromptMessage({
        role: 'user',
        content: [{ type: 'text', text: mod.OPENER_PROMPT }],
      }),
    ).toBe(true);
  });

  it('isOpenerPromptMessage detects the [OPENER] prefix on Keystone Central', async () => {
    vi.stubEnv('VITE_BRAND', 'brainlift');
    const mod = await import('../chat-opener');
    expect(
      mod.isOpenerPromptMessage({
        role: 'user',
        parts: [{ type: 'text', text: mod.OPENER_PROMPT }],
      }),
    ).toBe(true);
  });

  it('isOpenerPromptMessage rejects non-opener user messages', async () => {
    vi.stubEnv('VITE_BRAND', 'keystone');
    const mod = await import('../chat-opener');
    expect(
      mod.isOpenerPromptMessage({
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      }),
    ).toBe(false);
  });
});
