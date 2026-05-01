/**
 * Tests for FR6: Chat opener relocation and tag rename.
 *
 * Verifies the relocated `client/src/chat/chat-opener.ts` exposes the same
 * surface as the old `shared/chat-opener.ts` with the detection tag changed
 * from `[ALPHAX_OPENER]` to `[OPENER]`.
 */

import { describe, it, expect } from 'vitest';
import { OPENER_PROMPT, isOpenerPromptMessage } from '../chat/chat-opener';

describe('FR6 chat-opener: OPENER_PROMPT', () => {
  it('starts with the brand-agnostic [OPENER] tag', () => {
    expect(OPENER_PROMPT.startsWith('[OPENER]')).toBe(true);
  });

  it('does not contain the legacy [ALPHAX_OPENER] tag', () => {
    expect(OPENER_PROMPT).not.toContain('[ALPHAX_OPENER]');
  });

  it('is a non-empty string with substantive instruction body', () => {
    expect(typeof OPENER_PROMPT).toBe('string');
    // Sanity: opener body should be more than just the tag.
    expect(OPENER_PROMPT.length).toBeGreaterThan(50);
  });
});

describe('FR6 chat-opener: isOpenerPromptMessage', () => {
  it('returns true for a user message in parts shape with [OPENER] prefix', () => {
    const result = isOpenerPromptMessage({
      role: 'user',
      parts: [{ type: 'text', text: '[OPENER] hello' }],
    });
    expect(result).toBe(true);
  });

  it('returns true for a user message in content shape with [OPENER] prefix (runtime ThreadMessage)', () => {
    const result = isOpenerPromptMessage({
      role: 'user',
      content: [{ type: 'text', text: '[OPENER] hi' }],
    });
    expect(result).toBe(true);
  });

  it('returns false for a user message with the legacy [ALPHAX_OPENER] prefix', () => {
    const result = isOpenerPromptMessage({
      role: 'user',
      parts: [{ type: 'text', text: '[ALPHAX_OPENER] hi' }],
    });
    expect(result).toBe(false);
  });

  it('returns false for a regular user message with no opener tag', () => {
    const result = isOpenerPromptMessage({
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    });
    expect(result).toBe(false);
  });

  it('returns false for an assistant message even if it contains [OPENER]', () => {
    const result = isOpenerPromptMessage({
      role: 'assistant',
      parts: [{ type: 'text', text: '[OPENER]' }],
    });
    expect(result).toBe(false);
  });

  it('returns false for a user message with empty parts array', () => {
    const result = isOpenerPromptMessage({
      role: 'user',
      parts: [],
    });
    expect(result).toBe(false);
  });

  it('returns false for a user message with non-text first part', () => {
    const result = isOpenerPromptMessage({
      role: 'user',
      parts: [{ type: 'image', url: 'foo.png' }],
    });
    expect(result).toBe(false);
  });
});
