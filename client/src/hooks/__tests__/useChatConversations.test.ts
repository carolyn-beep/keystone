import { describe, expect, it } from 'vitest';
import type { ChatConversation } from '@shared/schema';
import {
  parseSelectedConversationId,
  resolveChatConversationSelection,
  resolveNextConversationSelectionAfterDelete,
  sortChatConversationsByRecency,
} from '../useChatConversations';

function makeConversation(id: number, updatedAt: string): ChatConversation {
  const now = new Date(updatedAt);

  return {
    id,
    userId: 'user-1',
    title: `Chat ${id}`,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  };
}

describe('native chat conversation selection', () => {
  it('parses valid conversation ids from the query string', () => {
    expect(parseSelectedConversationId('?c=42')).toBe(42);
    expect(parseSelectedConversationId('?foo=1&c=7')).toBe(7);
  });

  it('ignores invalid query-string ids', () => {
    expect(parseSelectedConversationId('')).toBeNull();
    expect(parseSelectedConversationId('?c=abc')).toBeNull();
    expect(parseSelectedConversationId('?c=-1')).toBeNull();
  });

  it('sorts conversations by recency before applying fallbacks', () => {
    const conversations = sortChatConversationsByRecency([
      makeConversation(1, '2026-04-28T12:00:00.000Z'),
      makeConversation(2, '2026-04-28T14:00:00.000Z'),
      makeConversation(3, '2026-04-28T13:00:00.000Z'),
    ]);

    expect(conversations.map((conversation) => conversation.id)).toEqual([2, 3, 1]);
  });

  it('prefers the requested conversation when it exists', () => {
    const selection = resolveChatConversationSelection({
      search: '?c=3',
      conversations: [
        makeConversation(1, '2026-04-28T12:00:00.000Z'),
        makeConversation(3, '2026-04-28T11:00:00.000Z'),
      ],
    });

    expect(selection).toEqual({
      selectedConversationId: 3,
      shouldCreateConversation: false,
    });
  });

  it('requests creation on bare landing even when conversations exist (homepage greets every time)', () => {
    // The homepage (`/` with no `?c=`) is the opener-trigger surface. The
    // user opted into being met by AlphaX Buddy on every landing. See
    // client/src/chat/chat-opener.ts.
    const selection = resolveChatConversationSelection({
      search: '',
      conversations: [
        makeConversation(1, '2026-04-28T12:00:00.000Z'),
        makeConversation(2, '2026-04-28T14:00:00.000Z'),
      ],
    });

    expect(selection).toEqual({
      selectedConversationId: null,
      shouldCreateConversation: true,
    });
  });

  it('also requests creation when the requested conversation is missing', () => {
    expect(
      resolveChatConversationSelection({
        search: '?c=999',
        conversations: [
          makeConversation(1, '2026-04-28T12:00:00.000Z'),
        ],
      }),
    ).toEqual({
      selectedConversationId: null,
      shouldCreateConversation: true,
    });
  });

  it('requests conversation creation when the user has none', () => {
    expect(
      resolveChatConversationSelection({
        search: '',
        conversations: [],
      }),
    ).toEqual({
      selectedConversationId: null,
      shouldCreateConversation: true,
    });
  });

  it('falls back cleanly after deleting the selected conversation', () => {
    expect(
      resolveNextConversationSelectionAfterDelete({
        deletedConversationId: 3,
        selectedConversationId: 3,
        conversations: [
          makeConversation(1, '2026-04-28T12:00:00.000Z'),
          makeConversation(2, '2026-04-28T14:00:00.000Z'),
          makeConversation(3, '2026-04-28T13:00:00.000Z'),
        ],
      }),
    ).toEqual({
      selectedConversationId: 2,
      shouldCreateConversation: false,
    });

    expect(
      resolveNextConversationSelectionAfterDelete({
        deletedConversationId: 5,
        selectedConversationId: 5,
        conversations: [makeConversation(5, '2026-04-28T14:00:00.000Z')],
      }),
    ).toEqual({
      selectedConversationId: null,
      shouldCreateConversation: true,
    });
  });
});
