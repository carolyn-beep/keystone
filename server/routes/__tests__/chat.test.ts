import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_MODEL_ID } from '@shared/chat-models';

const {
  mockStorage,
  mockGetChatModel,
  mockBuildChatSystemPromptFromRegistry,
  mockGenerateChatTitle,
  mockShouldGenerateChatTitle,
  mockBuildNativeChatTools,
  mockConsumeChatUiMessageStream,
  mockLogChatModelChunk,
  mockLogChatStreamError,
  mockLogChatStreamStart,
  mockLogChatTurn,
  mockStreamText,
  mockConvertToModelMessages,
  mockGenerateId,
  mockStepCountIs,
} = vi.hoisted(() => ({
  mockStorage: {
    listChatConversations: vi.fn(),
    createChatConversation: vi.fn(),
    getChatConversation: vi.fn(),
    renameChatConversation: vi.fn(),
    renameChatConversationIfTitle: vi.fn(),
    deleteChatConversation: vi.fn(),
    setConversationBrainlift: vi.fn(),
    getBrainliftById: vi.fn(),
    listChatMessages: vi.fn(),
    syncChatMessages: vi.fn(),
    getChatUserContext: vi.fn(),
    getConversationBrainlift: vi.fn(),
    getSecondBrainSummary: vi.fn(),
  },
  mockGetChatModel: vi.fn(),
  mockBuildChatSystemPromptFromRegistry: vi.fn(),
  mockGenerateChatTitle: vi.fn(),
  mockShouldGenerateChatTitle: vi.fn(),
  mockBuildNativeChatTools: vi.fn(),
  mockConsumeChatUiMessageStream: vi.fn(),
  mockLogChatModelChunk: vi.fn(),
  mockLogChatStreamError: vi.fn(),
  mockLogChatStreamStart: vi.fn(),
  mockLogChatTurn: vi.fn(),
  mockStreamText: vi.fn(),
  mockConvertToModelMessages: vi.fn(),
  mockGenerateId: vi.fn(() => 'generated-assistant-id'),
  mockStepCountIs: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../ai/chat/provider', () => ({
  getChatModel: (...args: unknown[]) => mockGetChatModel(...args),
}));

vi.mock('../../ai/chat/system-prompt', () => ({
  buildChatSystemPromptFromRegistry: (...args: unknown[]) =>
    mockBuildChatSystemPromptFromRegistry(...args),
}));

vi.mock('../../ai/chat/title', () => ({
  generateChatTitle: (...args: unknown[]) => mockGenerateChatTitle(...args),
  shouldGenerateChatTitle: (...args: unknown[]) => mockShouldGenerateChatTitle(...args),
}));

vi.mock('../../ai/chat/tools', () => ({
  buildNativeChatTools: (...args: unknown[]) => mockBuildNativeChatTools(...args),
}));

vi.mock('../../ai/chat/telemetry', () => ({
  consumeChatUiMessageStream: (...args: unknown[]) => mockConsumeChatUiMessageStream(...args),
  logChatModelChunk: (...args: unknown[]) => mockLogChatModelChunk(...args),
  logChatStreamError: (...args: unknown[]) => mockLogChatStreamError(...args),
  logChatStreamStart: (...args: unknown[]) => mockLogChatStreamStart(...args),
  logChatTurn: (...args: unknown[]) => mockLogChatTurn(...args),
}));

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  convertToModelMessages: (...args: unknown[]) => mockConvertToModelMessages(...args),
  generateId: (...args: unknown[]) => mockGenerateId(...args),
  stepCountIs: (...args: unknown[]) => mockStepCountIs(...args),
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { id: '42' },
    query: {},
    body: {},
    authContext: {
      userId: 'user-1',
      role: 'user',
      isAdmin: false,
    },
    session: {
      user: {
        id: 'user-1',
        name: 'Route Test User',
      },
    },
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStepCountIs.mockReturnValue(Symbol('stop'));
  mockConvertToModelMessages.mockResolvedValue([{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]);
  mockGetChatModel.mockReturnValue({ modelId: DEFAULT_CHAT_MODEL_ID });
  mockBuildChatSystemPromptFromRegistry.mockResolvedValue('prompt-from-registry');
  mockGenerateChatTitle.mockResolvedValue('Generated title');
  mockShouldGenerateChatTitle.mockReturnValue(false);
  mockBuildNativeChatTools.mockReturnValue({
    load_skill: { name: 'load_skill' },
  });
  mockStorage.getConversationBrainlift.mockResolvedValue({
    conversationId: 42,
    brainliftId: null,
    brainlift: null,
  });
  mockStorage.getSecondBrainSummary.mockResolvedValue({
    sourceCount: 0,
    noteCount: 0,
    linkedNoteCount: 0,
    unlinkedNoteCount: 0,
    categoryCount: 0,
    categories: [],
  });
});

describe('chat route handlers', () => {
  it('createChatConversationHandler passes title overrides through to storage', async () => {
    const { createChatConversationHandler } = await import('../chat');
    const req = createReq({
      body: { title: 'My first chat' },
    });
    const res = createRes();

    mockStorage.createChatConversation.mockResolvedValue({
      id: 42,
      userId: 'user-1',
      title: 'My first chat',
    });

    await createChatConversationHandler(req, res);

    expect(mockStorage.createChatConversation).toHaveBeenCalledWith('user-1', {
      title: 'My first chat',
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('getChatConversationHandler returns 404 when the conversation is outside the caller scope', async () => {
    const { getChatConversationHandler } = await import('../chat');
    const req = createReq({
      params: { id: '42' },
      query: { limit: '20' },
    });
    const res = createRes();

    mockStorage.getChatConversation.mockResolvedValue(null);

    await expect(getChatConversationHandler(req, res)).rejects.toThrow('Conversation not found');
    expect(mockStorage.listChatMessages).not.toHaveBeenCalled();
  });

  it('deleteChatConversationHandler returns 404 for conversations the caller does not own', async () => {
    const { deleteChatConversationHandler } = await import('../chat');
    const req = createReq({
      params: { id: '42' },
    });
    const res = createRes();

    mockStorage.deleteChatConversation.mockResolvedValue(false);

    await expect(deleteChatConversationHandler(req, res)).rejects.toThrow('Conversation not found');
  });

  it('setConversationBrainliftHandler binds a conversation to an accessible brainlift', async () => {
    const { setConversationBrainliftHandler } = await import('../chat');
    const req = createReq({
      params: { id: '42' },
      body: { brainliftId: 7 },
    });
    const res = createRes();

    mockStorage.setConversationBrainlift.mockResolvedValue({
      id: 42,
      userId: 'user-1',
      title: 'Native chat',
      brainliftId: 7,
    });
    mockStorage.getBrainliftById.mockResolvedValue({ id: 7 });

    await setConversationBrainliftHandler(req, res);

    expect(mockStorage.setConversationBrainlift).toHaveBeenCalledWith(42, 7, 'user-1');
    expect(res.json).toHaveBeenCalledWith({
      id: 42,
      userId: 'user-1',
      title: 'Native chat',
      brainliftId: 7,
    });
  });

  it('setConversationBrainliftHandler accepts null to unbind the conversation', async () => {
    const { setConversationBrainliftHandler } = await import('../chat');
    const req = createReq({
      params: { id: '42' },
      body: { brainliftId: null },
    });
    const res = createRes();

    mockStorage.setConversationBrainlift.mockResolvedValue({
      id: 42,
      userId: 'user-1',
      title: 'Native chat',
      brainliftId: null,
    });

    await setConversationBrainliftHandler(req, res);

    expect(mockStorage.setConversationBrainlift).toHaveBeenCalledWith(42, null, 'user-1');
  });

  it('setConversationBrainliftHandler validates IDs before calling storage', async () => {
    const { setConversationBrainliftHandler } = await import('../chat');

    await expect(setConversationBrainliftHandler(
      createReq({ params: { id: 'nope' }, body: { brainliftId: 7 } }),
      createRes(),
    )).rejects.toThrow('Invalid conversation ID');

    await expect(setConversationBrainliftHandler(
      createReq({ params: { id: '42' }, body: { brainliftId: 'seven' } }),
      createRes(),
    )).rejects.toThrow('brainliftId must be a number or null');

    expect(mockStorage.setConversationBrainlift).not.toHaveBeenCalled();
  });

  it('streamChatHandler rejects unknown conversations before invoking the provider', async () => {
    const { streamChatHandler } = await import('../chat');
    const req = createReq({
      body: {
        conversationId: 42,
        messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      },
    });
    const res = createRes();

    mockStorage.getChatConversation.mockResolvedValue(null);

    await expect(streamChatHandler(req, res)).rejects.toThrow('Conversation not found');
    expect(mockGetChatModel).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('streamChatHandler rejects model IDs outside the curated chat list', async () => {
    const { streamChatHandler } = await import('../chat');
    const req = createReq({
      body: {
        conversationId: 42,
        messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
        config: {
          modelName: 'google/gemini-2.0-flash-001',
        },
      },
    });
    const res = createRes();

    mockStorage.getChatConversation.mockResolvedValue({
      id: 42,
      userId: 'user-1',
      title: 'Native chat',
    });

    await expect(streamChatHandler(req, res)).rejects.toThrow('Unsupported chat model');
    expect(mockGetChatModel).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unbound conversation',
      { conversationId: 42, brainliftId: null, brainlift: null },
      'research',
    ],
    [
      'research-phase brainlift',
      {
        conversationId: 42,
        brainliftId: 7,
        brainlift: { id: 7, slug: 'research-project', phase: 'research' },
      },
      'research',
    ],
    [
      'authoring-phase brainlift',
      {
        conversationId: 42,
        brainliftId: 8,
        brainlift: { id: 8, slug: 'legacy-project', phase: 'authoring' },
      },
      'authoring',
    ],
  ])('streamChatHandler resolves %s to %s mode per request', async (_label, binding, expectedMode) => {
    const { streamChatHandler } = await import('../chat');
    const req = createReq({
      body: {
        conversationId: 42,
        messages: [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
      },
    });
    const res = createRes();

    mockStorage.getChatConversation.mockResolvedValue({
      id: 42,
      userId: 'user-1',
      title: 'Native chat',
    });
    mockStorage.getConversationBrainlift.mockResolvedValue(binding);
    mockStorage.getChatUserContext.mockResolvedValue({
      userId: 'user-1',
      userName: 'Route Test User',
      isAdmin: false,
      brainliftCount: 1,
      recentBrainlifts: [],
      recentConversations: [],
      activePlans: [],
    });
    mockStreamText.mockReturnValue({
      pipeUIMessageStreamToResponse: vi.fn(),
    });

    await streamChatHandler(req, res);

    const expectsSecondBrainFetch = expectedMode === 'research' && binding.brainliftId != null;
    const expectedConversation = expectsSecondBrainFetch
      ? { ...binding, secondBrainSummary: expect.any(Object) }
      : binding;

    expect(mockStorage.getConversationBrainlift).toHaveBeenCalledWith(42);
    if (expectsSecondBrainFetch) {
      expect(mockStorage.getSecondBrainSummary).toHaveBeenCalledWith(binding.brainliftId);
    } else {
      expect(mockStorage.getSecondBrainSummary).not.toHaveBeenCalled();
    }
    expect(mockBuildChatSystemPromptFromRegistry).toHaveBeenCalledWith(expect.objectContaining({
      mode: expectedMode,
      conversation: expectedConversation,
    }));
    expect(mockBuildNativeChatTools).toHaveBeenCalledWith(
      req.authContext,
      expectedMode,
      expectedConversation,
    );
  });

  it('streamChatHandler passes original messages through and persists finalized messages on finish', async () => {
    const { streamChatHandler } = await import('../chat');
    const inputMessages = [
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    ];
    const finalizedMessages = [
      ...inputMessages,
      { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi there' }] },
    ];
    const req = createReq({
      body: {
        conversationId: 42,
        messages: inputMessages,
        config: {
          modelName: 'qwen/qwen-plus',
        },
      },
    });
    const res = createRes();

    mockStorage.getChatConversation.mockResolvedValue({
      id: 42,
      userId: 'user-1',
      title: 'Native chat',
    });
    mockStorage.getChatUserContext.mockResolvedValue({
      userId: 'user-1',
      userName: 'Route Test User',
      isAdmin: false,
      brainliftCount: 0,
      recentBrainlifts: [],
    });

    let pipeOptions: unknown;
    mockStreamText.mockImplementation((options) => ({
      pipeUIMessageStreamToResponse: (response: unknown, nextOptions: unknown) => {
        pipeOptions = nextOptions;
        void options.onChunk?.({
          chunk: {
            type: 'tool-call',
            toolCallId: 'tc-1',
            toolName: 'load_skill',
            input: '{}',
          },
        });
        void options.onFinish?.({
          finishReason: 'stop',
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
          },
        });
        void (nextOptions as {
          consumeSseStream?: (options: { stream: ReadableStream<string> }) => PromiseLike<void> | void;
        }).consumeSseStream?.({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue('data: {"type":"tool-input-start","toolCallId":"tc-1","toolName":"load_skill"}\n\n');
              controller.close();
            },
          }),
        });
        void (nextOptions as { onFinish?: (event: unknown) => PromiseLike<void> | void }).onFinish?.({
          messages: finalizedMessages,
          finishReason: 'stop',
          isContinuation: false,
          isAborted: false,
          responseMessage: finalizedMessages[finalizedMessages.length - 1],
        });
      },
    }));

    await streamChatHandler(req, res);

    expect(mockGetChatModel).toHaveBeenCalledWith('qwen/qwen-plus');
    expect(mockBuildChatSystemPromptFromRegistry).toHaveBeenCalledWith(expect.objectContaining({
      userContext: {
        userId: 'user-1',
        userName: 'Route Test User',
        isAdmin: false,
        brainliftCount: 0,
        recentBrainlifts: [],
      },
      authContext: req.authContext,
      mode: 'research',
      conversation: {
        conversationId: 42,
        brainliftId: null,
        brainlift: null,
      },
    }));
    expect(mockBuildNativeChatTools).toHaveBeenCalledWith(req.authContext, 'research', {
      conversationId: 42,
      brainliftId: null,
      brainlift: null,
    });
    expect(mockLogChatStreamStart).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      messageCount: 1,
      toolNames: ['load_skill'],
    });
    expect(mockConvertToModelMessages).toHaveBeenCalledWith(inputMessages);
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      system: 'prompt-from-registry',
      tools: {
        load_skill: { name: 'load_skill' },
      },
      onChunk: expect.any(Function),
      onError: expect.any(Function),
    }));
    expect(mockLogChatModelChunk).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
    }, {
      type: 'tool-call',
      toolCallId: 'tc-1',
      toolName: 'load_skill',
      input: '{}',
    });
    expect(mockConsumeChatUiMessageStream).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
    }, expect.any(ReadableStream));
    expect(mockStorage.syncChatMessages).toHaveBeenCalledWith(42, 'user-1', finalizedMessages);
    expect(mockShouldGenerateChatTitle).toHaveBeenCalledWith({
      currentTitle: 'Native chat',
      messages: finalizedMessages,
    });
    expect(mockGenerateChatTitle).not.toHaveBeenCalled();
    expect(mockLogChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      finishReason: 'stop',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    }));
    expect(pipeOptions).toEqual(
      expect.objectContaining({
        consumeSseStream: expect.any(Function),
        generateMessageId: expect.any(Function),
        onError: expect.any(Function),
        originalMessages: inputMessages,
      }),
    );
  });

  it('streamChatHandler generates an AI title for the first completed exchange without clobbering manual renames', async () => {
    const { streamChatHandler } = await import('../chat');
    const finalizedMessages = [
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Help me build a brainlift about robotics clubs' }] },
      { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Let’s shape the angle and sources first.' }] },
    ];
    const req = createReq({
      body: {
        conversationId: 42,
        messages: [finalizedMessages[0]],
      },
    });
    const res = createRes();

    mockStorage.getChatConversation.mockResolvedValue({
      id: 42,
      userId: 'user-1',
      title: 'New chat',
    });
    mockStorage.getChatUserContext.mockResolvedValue({
      userId: 'user-1',
      userName: 'Route Test User',
      isAdmin: false,
      brainliftCount: 0,
      recentBrainlifts: [],
    });
    mockShouldGenerateChatTitle.mockReturnValue(true);
    mockGenerateChatTitle.mockResolvedValue('Robotics Club Brainlift');

    mockStreamText.mockImplementation(() => ({
      pipeUIMessageStreamToResponse: (_response: unknown, nextOptions: unknown) => {
        void (nextOptions as { onFinish?: (event: unknown) => PromiseLike<void> | void }).onFinish?.({
          messages: finalizedMessages,
          finishReason: 'stop',
          isContinuation: false,
          isAborted: false,
          responseMessage: finalizedMessages[finalizedMessages.length - 1],
        });
      },
    }));

    await streamChatHandler(req, res);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockGenerateChatTitle).toHaveBeenCalledWith(finalizedMessages);
    expect(mockStorage.renameChatConversationIfTitle).toHaveBeenCalledWith(
      42,
      'user-1',
      'New chat',
      'Robotics Club Brainlift',
    );
  });
});
