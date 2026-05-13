import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCallModel } = vi.hoisted(() => ({
  mockCallModel: vi.fn(),
}));

vi.mock('../../client', () => ({
  callModel: (...args: unknown[]) => mockCallModel(...args),
}));

describe('chat title generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates titles for any default-title conversation with user and assistant messages', async () => {
    const { shouldGenerateChatTitle } = await import('../title');

    expect(shouldGenerateChatTitle({
      currentTitle: 'New chat',
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
      ],
    })).toBe(true);

    expect(shouldGenerateChatTitle({
      currentTitle: 'Manual title',
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
      ],
    })).toBe(false);

    expect(shouldGenerateChatTitle({
      currentTitle: 'New chat',
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
        { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Next' }] },
      ],
    })).toBe(true);
  });

  it('does NOT generate a title when only the homepage OPENER exchange exists', async () => {
    const { shouldGenerateChatTitle } = await import('../title');

    expect(shouldGenerateChatTitle({
      currentTitle: 'New chat',
      messages: [
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'text', text: '[OPENER] This is the user landing on the chat homepage. Introduce yourself as AlphaX Buddy.' }],
        },
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: "Hi! I'm AlphaX Buddy, here to help with your brainlift." }],
        },
      ],
    })).toBe(false);
  });

  it('generates a title once a real user message follows the OPENER exchange', async () => {
    const { shouldGenerateChatTitle } = await import('../title');

    expect(shouldGenerateChatTitle({
      currentTitle: 'New chat',
      messages: [
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'text', text: '[OPENER] Landing on the chat homepage.' }],
        },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hi there.' }] },
        {
          id: 'u2',
          role: 'user',
          parts: [{ type: 'text', text: 'I want to draft a SPOV about urban beekeeping.' }],
        },
        { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Great topic.' }] },
      ],
    })).toBe(true);
  });

  it('strips the OPENER exchange from the title-prompt context fed to the model', async () => {
    const { generateChatTitle } = await import('../title');
    mockCallModel.mockResolvedValue({ content: 'Urban Beekeeping SPOV' });

    await generateChatTitle([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: '[OPENER] Introduce yourself as AlphaX Buddy.' }],
      },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: "I'm AlphaX Buddy, happy to help." }] },
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: 'Help me draft a SPOV about urban beekeeping.' }],
      },
      { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Lets start with the angle.' }] },
    ]);

    const conversationSentToModel = mockCallModel.mock.calls[0][0].messages[0].content;
    expect(conversationSentToModel).not.toContain('[OPENER]');
    expect(conversationSentToModel).not.toContain('AlphaX Buddy');
    expect(conversationSentToModel).toContain('urban beekeeping');
  });

  it('sanitizes model output into a compact title', async () => {
    const { sanitizeChatTitle } = await import('../title');

    expect(sanitizeChatTitle('"Robotics Club Strategy!"')).toBe('Robotics Club Strategy');
    expect(sanitizeChatTitle('   ')).toBe('New chat');
    expect(sanitizeChatTitle('A very long generated title that should be cut before it overwhelms the sidebar')).toBe(
      'A very long generated title that should be cut before it',
    );
  });

  it('uses the budget model with a short timeout and compact conversation context', async () => {
    const { generateChatTitle } = await import('../title');
    mockCallModel.mockResolvedValue({ content: 'Robotics Club Brainlift' });

    const title = await generateChatTitle([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Help me build a brainlift about robotics clubs.' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Let’s start with your angle and trusted sources.' }] },
    ]);

    expect(title).toBe('Robotics Club Brainlift');
    expect(mockCallModel).toHaveBeenCalledWith(expect.objectContaining({
      model: 'google/gemini-2.0-flash-001',
      caller: 'chat.title',
      maxTokens: 24,
      timeout: 4000,
      retries: 0,
      temperature: 0.2,
    }));
    expect(mockCallModel.mock.calls[0][0].messages[0].content).toContain('user: Help me build');
    expect(mockCallModel.mock.calls[0][0].messages[0].content).toContain('assistant: Let’s start');
  });

  it('falls back to a local title when the model call fails', async () => {
    const { generateChatTitle } = await import('../title');
    mockCallModel.mockRejectedValue(new Error('provider failed'));

    const title = await generateChatTitle([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Can you help me create a marketing sprint plan for my tutoring startup?' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Yes.' }] },
    ]);

    expect(title).toBe('create marketing sprint plan my tutoring');
  });
});
