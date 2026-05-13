import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import { brainlifts, brainliftShares, chatConversations, chatMessages, user } from '@shared/schema';
import {
  createChatConversation,
  deleteChatConversation,
  getChatConversation,
  getChatUserContext,
  listChatConversations,
  listChatMessages,
  renameChatConversationIfTitle,
  renameChatConversation,
  syncChatMessages,
} from '../chat';

const TEST_USER_ID = `chat-test-user-${Date.now()}`;
const OTHER_USER_ID = `chat-test-other-${Date.now()}`;
const createdBrainliftIds: number[] = [];

function makeMessage(id: string, role: 'user' | 'assistant', parts: unknown[], metadata?: Record<string, unknown>): UIMessage {
  return {
    id,
    role,
    parts: parts as UIMessage['parts'],
    metadata,
  } as UIMessage;
}

async function insertBrainlift(input: { slug: string; title: string; userId: string; createdAt?: Date }) {
  const [brainlift] = await db.insert(brainlifts).values({
    slug: input.slug,
    title: input.title,
    description: `${input.title} description`,
    createdByUserId: input.userId,
    summary: {
      totalFacts: 0,
      meanScore: '0',
      score5Count: 0,
      contradictionCount: 0,
    },
    createdAt: input.createdAt,
  }).returning();

  createdBrainliftIds.push(brainlift.id);
  return brainlift;
}

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: TEST_USER_ID,
      name: 'Chat Test User',
      email: `chat-test-${Date.now()}@test.dev`,
      emailVerified: false,
      role: 'admin',
    },
    {
      id: OTHER_USER_ID,
      name: 'Chat Other User',
      email: `chat-test-other-${Date.now()}@test.dev`,
      emailVerified: false,
    },
  ]);
});

beforeEach(async () => {
  await db.delete(chatConversations).where(
    inArray(chatConversations.userId, [TEST_USER_ID, OTHER_USER_ID]),
  );

  if (createdBrainliftIds.length > 0) {
    await db.delete(brainlifts).where(inArray(brainlifts.id, createdBrainliftIds));
    createdBrainliftIds.length = 0;
  }
});

afterAll(async () => {
  await db.delete(chatConversations).where(
    inArray(chatConversations.userId, [TEST_USER_ID, OTHER_USER_ID]),
  );

  if (createdBrainliftIds.length > 0) {
    await db.delete(brainlifts).where(inArray(brainlifts.id, createdBrainliftIds)).catch(() => undefined);
  }

  await db.delete(user).where(inArray(user.id, [TEST_USER_ID, OTHER_USER_ID]));
});

describe('chat storage', () => {
  it('creates conversations with deterministic default titles and scopes listing by owner', async () => {
    const owned = await createChatConversation(TEST_USER_ID);
    const other = await createChatConversation(OTHER_USER_ID, { title: 'Other user chat' });

    expect(owned.title).toBe('New chat');
    expect(other.title).toBe('Other user chat');

    const mine = await listChatConversations(TEST_USER_ID);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.id).toBe(owned.id);
    expect(mine[0]?.userId).toBe(TEST_USER_ID);
  });

  it('enforces ownership on get, rename, and delete', async () => {
    const conversation = await createChatConversation(TEST_USER_ID, { title: 'Private chat' });

    await expect(getChatConversation(conversation.id, OTHER_USER_ID)).resolves.toBeNull();
    await expect(renameChatConversation(conversation.id, OTHER_USER_ID, 'Hijacked')).resolves.toBeNull();
    await expect(deleteChatConversation(conversation.id, OTHER_USER_ID)).resolves.toBe(false);

    const renamed = await renameChatConversation(conversation.id, TEST_USER_ID, 'Renamed chat');
    expect(renamed?.title).toBe('Renamed chat');
    await expect(deleteChatConversation(conversation.id, TEST_USER_ID)).resolves.toBe(true);
  });

  it('renames a conversation only when the current title still matches the expected title', async () => {
    const conversation = await createChatConversation(TEST_USER_ID);

    const renamed = await renameChatConversationIfTitle(
      conversation.id,
      TEST_USER_ID,
      'New chat',
      'Generated title',
    );
    expect(renamed?.title).toBe('Generated title');

    await expect(renameChatConversationIfTitle(
      conversation.id,
      TEST_USER_ID,
      'New chat',
      'Late AI title',
    )).resolves.toBeNull();

    const persisted = await getChatConversation(conversation.id, TEST_USER_ID);
    expect(persisted?.title).toBe('Generated title');
  });

  it('upserts finalized messages, preserves complex parts, and paginates chronologically', async () => {
    const conversation = await createChatConversation(TEST_USER_ID);

    const initialMessages = [
      makeMessage('msg-user-1', 'user', [{ type: 'text', text: 'Hello' }]),
      makeMessage('msg-assistant-1', 'assistant', [{ type: 'text', text: 'Draft answer' }]),
    ];

    await syncChatMessages(conversation.id, TEST_USER_ID, initialMessages);

    await syncChatMessages(conversation.id, TEST_USER_ID, [
      makeMessage('msg-user-1', 'user', [{ type: 'text', text: 'Hello' }]),
      makeMessage('msg-assistant-1', 'assistant', [{ type: 'text', text: 'Final answer' }], { finishReason: 'stop' }),
      makeMessage('msg-user-2', 'user', [{ type: 'text', text: 'Use the tool next' }]),
      makeMessage('msg-assistant-2', 'assistant', [
        {
          type: 'tool-load_skill',
          toolCallId: 'tool-1',
          state: 'output-available',
          input: { slug: 'research' },
          output: { title: 'Research', body: 'Loaded' },
        },
      ]),
    ]);

    const allRows = await db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversation.id));
    expect(allRows).toHaveLength(4);
    expect(allRows.filter((row) => row.messageId === 'msg-assistant-1')).toHaveLength(1);
    expect(allRows.find((row) => row.messageId === 'msg-assistant-1')?.metadata).toEqual({ finishReason: 'stop' });

    const firstPage = await listChatMessages(conversation.id, TEST_USER_ID, { limit: 2 });
    expect(firstPage.messages.map((message) => message.id)).toEqual(['msg-user-2', 'msg-assistant-2']);
    expect(firstPage.messages[1]?.parts).toEqual([
      {
        type: 'tool-load_skill',
        toolCallId: 'tool-1',
        state: 'output-available',
        input: { slug: 'research' },
        output: { title: 'Research', body: 'Loaded' },
      },
    ]);
    expect(firstPage.nextBeforeId).not.toBeNull();

    const secondPage = await listChatMessages(conversation.id, TEST_USER_ID, {
      limit: 2,
      beforeId: firstPage.nextBeforeId!,
    });
    expect(secondPage.messages.map((message) => message.id)).toEqual(['msg-user-1', 'msg-assistant-1']);
    expect(secondPage.messages[1]?.parts).toEqual([{ type: 'text', text: 'Final answer' }]);
    expect(secondPage.nextBeforeId).toBeNull();
  });

  it('preserves unseen earlier history when syncing a partial loaded suffix', async () => {
    const conversation = await createChatConversation(TEST_USER_ID);

    await syncChatMessages(conversation.id, TEST_USER_ID, [
      makeMessage('msg-user-0', 'user', [{ type: 'text', text: 'Older question' }]),
      makeMessage('msg-assistant-0', 'assistant', [{ type: 'text', text: 'Older answer' }]),
      makeMessage('msg-user-1', 'user', [{ type: 'text', text: 'Visible question' }]),
      makeMessage('msg-assistant-1', 'assistant', [{ type: 'text', text: 'Visible answer' }]),
    ]);

    await syncChatMessages(conversation.id, TEST_USER_ID, [
      makeMessage('msg-user-1', 'user', [{ type: 'text', text: 'Visible question' }]),
      makeMessage('msg-assistant-1', 'assistant', [{ type: 'text', text: 'Visible answer' }]),
      makeMessage('msg-user-2', 'user', [{ type: 'text', text: 'Newest question' }]),
      makeMessage('msg-assistant-2', 'assistant', [{ type: 'text', text: 'Newest answer' }]),
    ]);

    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversation.id))
      .orderBy(chatMessages.id);

    expect(rows.map((row) => row.messageId)).toEqual([
      'msg-user-0',
      'msg-assistant-0',
      'msg-user-1',
      'msg-assistant-1',
      'msg-user-2',
      'msg-assistant-2',
    ]);
  });

  it('prunes stale downstream rows after regenerating from the middle of a loaded suffix', async () => {
    const conversation = await createChatConversation(TEST_USER_ID);

    await syncChatMessages(conversation.id, TEST_USER_ID, [
      makeMessage('msg-user-0', 'user', [{ type: 'text', text: 'Older question' }]),
      makeMessage('msg-assistant-0', 'assistant', [{ type: 'text', text: 'Older answer' }]),
      makeMessage('msg-user-1', 'user', [{ type: 'text', text: 'Branch question' }]),
      makeMessage('msg-assistant-1', 'assistant', [{ type: 'text', text: 'Original branch answer' }]),
      makeMessage('msg-user-2', 'user', [{ type: 'text', text: 'Stale follow-up' }]),
      makeMessage('msg-assistant-2', 'assistant', [{ type: 'text', text: 'Stale follow-up answer' }]),
    ]);

    await syncChatMessages(conversation.id, TEST_USER_ID, [
      makeMessage('msg-user-1', 'user', [{ type: 'text', text: 'Branch question' }]),
      makeMessage('msg-assistant-1b', 'assistant', [{ type: 'text', text: 'Regenerated branch answer' }]),
    ]);

    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversation.id))
      .orderBy(chatMessages.id);

    expect(rows.map((row) => row.messageId)).toEqual([
      'msg-user-0',
      'msg-assistant-0',
      'msg-user-1',
      'msg-assistant-1b',
    ]);

    const listed = await listChatMessages(conversation.id, TEST_USER_ID, { limit: 10 });
    expect(listed.messages.map((message) => message.id)).toEqual([
      'msg-user-0',
      'msg-assistant-0',
      'msg-user-1',
      'msg-assistant-1b',
    ]);
  });

  it('updates conversation timestamps during finalized message sync', async () => {
    const conversation = await createChatConversation(TEST_USER_ID, { title: 'Timestamp chat' });
    const before = await getChatConversation(conversation.id, TEST_USER_ID);

    await new Promise((resolve) => setTimeout(resolve, 10));

    await syncChatMessages(conversation.id, TEST_USER_ID, [
      makeMessage('msg-user-3', 'user', [{ type: 'text', text: 'Timestamp me' }]),
    ]);

    const after = await getChatConversation(conversation.id, TEST_USER_ID);
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
    expect(after?.lastMessageAt).not.toBeNull();
    expect(after?.lastMessageAt?.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it('repairs legacy blank assistant ids and persists new assistant turns without collisions', async () => {
    const conversation = await createChatConversation(TEST_USER_ID, { title: 'Legacy blank ids' });

    await db.insert(chatMessages).values([
      {
        conversationId: conversation.id,
        messageId: 'msg-user-legacy',
        role: 'user',
        parts: [{ type: 'text', text: 'Legacy hello' }],
        metadata: { custom: {} },
      },
      {
        conversationId: conversation.id,
        messageId: '',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Legacy assistant reply' }],
        metadata: null,
      },
    ]);

    await expect(syncChatMessages(conversation.id, TEST_USER_ID, [
      makeMessage('msg-user-legacy', 'user', [{ type: 'text', text: 'Legacy hello' }]),
      makeMessage('', 'assistant', [{ type: 'text', text: 'Legacy assistant reply' }]),
      makeMessage('msg-user-next', 'user', [{ type: 'text', text: 'Next question' }]),
      makeMessage('', 'assistant', [{ type: 'text', text: 'Legacy assistant reply' }]),
    ])).resolves.toBeUndefined();

    const allRows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversation.id))
      .orderBy(chatMessages.id);

    expect(allRows).toHaveLength(4);
    expect(allRows.some((row) => row.messageId === '')).toBe(false);
    expect(new Set(allRows.map((row) => row.messageId)).size).toBe(4);

    const listed = await listChatMessages(conversation.id, TEST_USER_ID, { limit: 10 });
    expect(listed.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(listed.messages[1]?.id).toMatch(/^legacy-assistant-/);
    expect(listed.messages[3]?.id).toMatch(/^legacy-assistant-/);
    expect(listed.messages[3]?.parts).toEqual([
      { type: 'text', text: 'Legacy assistant reply' },
    ]);
  });

  it('loads minimal chat user context with recent brainlifts', async () => {
    await insertBrainlift({
      slug: `chat-context-old-${Date.now()}`,
      title: 'Older brainlift',
      userId: TEST_USER_ID,
      createdAt: new Date('2026-04-01T12:00:00.000Z'),
    });
    await insertBrainlift({
      slug: `chat-context-new-${Date.now()}`,
      title: 'Newest brainlift',
      userId: TEST_USER_ID,
      createdAt: new Date('2026-04-02T12:00:00.000Z'),
    });
    await insertBrainlift({
      slug: `chat-context-other-${Date.now()}`,
      title: 'Other user brainlift',
      userId: OTHER_USER_ID,
      createdAt: new Date('2026-04-03T12:00:00.000Z'),
    });

    const context = await getChatUserContext(TEST_USER_ID);
    expect(context.userId).toBe(TEST_USER_ID);
    expect(context.userName).toBe('Chat Test User');
    expect(context.isAdmin).toBe(true);
    expect(context.brainliftCount).toBe(2);
    expect(context.recentBrainlifts.map((brainlift) => brainlift.title)).toEqual([
      'Newest brainlift',
      'Older brainlift',
    ]);
    expect(context.recentBrainlifts.every((b) => b.permission === 'owner')).toBe(true);
    expect(context.recentConversations).toEqual([]);
    expect(context.activePlans).toEqual([]);
  });

  it('includes brainlifts shared with the user, tagged with their share permission', async () => {
    const ownedNew = await insertBrainlift({
      slug: `chat-context-owned-${Date.now()}`,
      title: 'My own brainlift',
      userId: TEST_USER_ID,
      createdAt: new Date('2026-04-01T08:00:00.000Z'),
    });
    const sharedEditor = await insertBrainlift({
      slug: `chat-context-shared-editor-${Date.now()}`,
      title: 'Shared as editor',
      userId: OTHER_USER_ID,
      createdAt: new Date('2026-04-02T08:00:00.000Z'),
    });
    const sharedViewer = await insertBrainlift({
      slug: `chat-context-shared-viewer-${Date.now()}`,
      title: 'Shared as viewer',
      userId: OTHER_USER_ID,
      createdAt: new Date('2026-04-03T08:00:00.000Z'),
    });

    await db.insert(brainliftShares).values([
      {
        brainliftId: sharedEditor.id,
        type: 'user',
        permission: 'editor',
        userId: TEST_USER_ID,
        createdByUserId: OTHER_USER_ID,
      },
      {
        brainliftId: sharedViewer.id,
        type: 'user',
        permission: 'viewer',
        userId: TEST_USER_ID,
        createdByUserId: OTHER_USER_ID,
      },
    ]);

    const context = await getChatUserContext(TEST_USER_ID);

    // Count includes owned (1) + shared (2) = 3
    expect(context.brainliftCount).toBe(3);

    // Recent ordering: shared-viewer (newest) > shared-editor > owned. Each tagged with its permission.
    expect(context.recentBrainlifts).toEqual([
      expect.objectContaining({ slug: sharedViewer.slug, permission: 'viewer' }),
      expect.objectContaining({ slug: sharedEditor.slug, permission: 'editor' }),
      expect.objectContaining({ slug: ownedNew.slug, permission: 'owner' }),
    ]);

    await db.delete(brainliftShares).where(
      inArray(brainliftShares.brainliftId, [sharedEditor.id, sharedViewer.id]),
    );
  });

  it('includes recent conversations in user context, ordered by last activity desc and scoped by owner', async () => {
    const oldOwn = await createChatConversation(TEST_USER_ID, { title: 'Old conversation' });
    const newOwn = await createChatConversation(TEST_USER_ID, { title: 'Newest conversation' });
    const otherUser = await createChatConversation(OTHER_USER_ID, { title: 'Other user chat' });

    await db
      .update(chatConversations)
      .set({ lastMessageAt: new Date('2026-04-01T12:00:00.000Z') })
      .where(eq(chatConversations.id, oldOwn.id));
    await db
      .update(chatConversations)
      .set({ lastMessageAt: new Date('2026-04-29T08:00:00.000Z') })
      .where(eq(chatConversations.id, newOwn.id));
    await db
      .update(chatConversations)
      .set({ lastMessageAt: new Date('2026-04-30T08:00:00.000Z') })
      .where(eq(chatConversations.id, otherUser.id));

    const context = await getChatUserContext(TEST_USER_ID);
    expect(context.recentConversations.map((conversation) => conversation.title)).toEqual([
      'Newest conversation',
      'Old conversation',
    ]);
    expect(context.recentConversations[0]?.id).toBe(newOwn.id);
    expect(context.recentConversations[0]?.lastActivityAt.toISOString()).toBe(
      '2026-04-29T08:00:00.000Z',
    );
  });

  it('falls back to updatedAt when a conversation has no messages yet', async () => {
    const conversation = await createChatConversation(TEST_USER_ID, { title: 'Empty conversation' });

    const context = await getChatUserContext(TEST_USER_ID);
    const entry = context.recentConversations.find((item) => item.id === conversation.id);

    expect(entry).toBeDefined();
    expect(entry?.lastActivityAt).toBeInstanceOf(Date);
    expect(entry?.lastActivityAt.toISOString()).toBe(conversation.updatedAt.toISOString());
  });
});
