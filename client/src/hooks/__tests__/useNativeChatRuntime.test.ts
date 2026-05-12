/**
 * Tests the lazy-create transport factory `createLazyConversationPrepareSend`
 * — the pure piece of `useNativeChatRuntime` that decides whether to
 * `POST /api/chat/conversations` before each send.
 *
 * Verifying this directly (rather than through the React hook) keeps the
 * test free of a renderer dependency. The hook itself is exercised by
 * end-to-end manual checks in the chat UI.
 */
import { describe, expect, it, vi } from 'vitest';
import { createLazyConversationPrepareSend } from '../useNativeChatRuntime';

describe('createLazyConversationPrepareSend', () => {
  it('reuses an existing conversationId on send without calling create', async () => {
    let convId: number | null = 17;
    const createConversation = vi.fn();
    const { prepareSendMessagesRequest } = createLazyConversationPrepareSend({
      getConversationId: () => convId,
      setConversationId: (id) => {
        convId = id;
      },
      getModelId: () => 'gpt-test',
      createConversation,
    });

    const prepared = await prepareSendMessagesRequest({
      messages: [{ id: 'm1', role: 'user' }],
      api: '/api/chat/stream',
      credentials: 'include',
    });

    expect(createConversation).not.toHaveBeenCalled();
    expect(prepared.body).toEqual({
      messages: [{ id: 'm1', role: 'user' }],
      conversationId: 17,
      config: { modelName: 'gpt-test' },
    });
    expect(prepared.api).toBe('/api/chat/stream');
    expect(prepared.credentials).toBe('include');
  });

  it('lazy-creates a conversation on the first send when id is null', async () => {
    let convId: number | null = null;
    const createConversation = vi.fn().mockResolvedValue(99);
    const onLazyCreated = vi.fn();

    const { prepareSendMessagesRequest } = createLazyConversationPrepareSend({
      getConversationId: () => convId,
      setConversationId: (id) => {
        convId = id;
      },
      getModelId: () => 'gpt-test',
      createConversation,
      onLazyCreated,
    });

    const prepared = await prepareSendMessagesRequest({
      messages: [{ id: 'm1', role: 'user' }],
      credentials: 'include',
    });

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(onLazyCreated).toHaveBeenCalledWith(99);
    expect(prepared.body.conversationId).toBe(99);
    expect(convId).toBe(99);
  });

  it('reuses the lazy-created id on subsequent sends (no second create)', async () => {
    let convId: number | null = null;
    const createConversation = vi.fn().mockResolvedValue(99);

    const { prepareSendMessagesRequest } = createLazyConversationPrepareSend({
      getConversationId: () => convId,
      setConversationId: (id) => {
        convId = id;
      },
      getModelId: () => 'gpt-test',
      createConversation,
    });

    await prepareSendMessagesRequest({
      messages: [{ id: 'm1' }],
    });
    await prepareSendMessagesRequest({
      messages: [{ id: 'm2' }],
    });

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(convId).toBe(99);
  });

  it('coalesces concurrent first-send lazy-creates into a single POST', async () => {
    let convId: number | null = null;
    let resolveCreate!: (value: number) => void;
    const createConversation = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { prepareSendMessagesRequest } = createLazyConversationPrepareSend({
      getConversationId: () => convId,
      setConversationId: (id) => {
        convId = id;
      },
      getModelId: () => 'gpt-test',
      createConversation,
    });

    const sendA = prepareSendMessagesRequest({ messages: [{ id: 'a' }] });
    const sendB = prepareSendMessagesRequest({ messages: [{ id: 'b' }] });

    resolveCreate(42);

    const [aPrepared, bPrepared] = await Promise.all([sendA, sendB]);
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(aPrepared.body.conversationId).toBe(42);
    expect(bPrepared.body.conversationId).toBe(42);
    expect(convId).toBe(42);
  });

  it('reads the current modelId at send time (not at factory creation)', async () => {
    let modelId = 'old-model';
    let convId: number | null = 17;
    const { prepareSendMessagesRequest } = createLazyConversationPrepareSend({
      getConversationId: () => convId,
      setConversationId: (id) => {
        convId = id;
      },
      getModelId: () => modelId,
    });

    modelId = 'new-model';
    const prepared = await prepareSendMessagesRequest({ messages: [{ id: 'm' }] });
    expect(prepared.body.config.modelName).toBe('new-model');
  });
});
