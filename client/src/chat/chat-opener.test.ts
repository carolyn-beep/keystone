/**
 * Tests for the chat opener prompt tag and localStorage cooldown gate.
 */

import { describe, it, expect } from 'vitest';
import {
  CHAT_OPENER_COOLDOWN_MS,
  getChatOpenerStorageKey,
  markChatOpenerSent,
  OPENER_PROMPT,
  shouldSendChatOpener,
  isOpenerPromptMessage,
} from '../chat/chat-opener';

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

function makeStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('chat opener localStorage cooldown', () => {
  it('scopes the timestamp key by user id', () => {
    expect(getChatOpenerStorageKey('user-a')).toBe('chat-opener:last-sent-at:user-a');
    expect(getChatOpenerStorageKey('user-b')).toBe('chat-opener:last-sent-at:user-b');
  });

  it('allows the opener when this user has no stored timestamp', () => {
    expect(shouldSendChatOpener('user-a', 1_000, makeStorage())).toBe(true);
  });

  it('blocks the same user inside the 48h cooldown', () => {
    const storage = makeStorage({
      [getChatOpenerStorageKey('user-a')]: String(1_000),
    });

    expect(shouldSendChatOpener('user-a', 1_000 + CHAT_OPENER_COOLDOWN_MS - 1, storage)).toBe(false);
  });

  it('allows the same user after more than 48h', () => {
    const storage = makeStorage({
      [getChatOpenerStorageKey('user-a')]: String(1_000),
    });

    expect(shouldSendChatOpener('user-a', 1_000 + CHAT_OPENER_COOLDOWN_MS + 1, storage)).toBe(true);
  });

  it('does not let one user suppress another user on the same browser', () => {
    const storage = makeStorage({
      [getChatOpenerStorageKey('user-a')]: String(1_000),
    });

    expect(shouldSendChatOpener('user-b', 1_100, storage)).toBe(true);
  });

  it('marks the current user timestamp', () => {
    const storage = makeStorage();

    markChatOpenerSent('user-a', 42_000, storage);

    expect(storage.getItem(getChatOpenerStorageKey('user-a'))).toBe('42000');
  });

  it('fails closed when localStorage is unavailable', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;

    expect(shouldSendChatOpener('user-a', 1_000, storage)).toBe(false);
  });
});
