import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID, isChatModelId } from './chat-models';
import { chatConversations, chatMessages } from './schema';

describe('chat schema contract', () => {
  it('exports the expected chat table names and key columns', () => {
    expect(getTableName(chatConversations)).toBe('chat_conversations');
    expect(getTableName(chatMessages)).toBe('chat_messages');

    expect(chatConversations.userId.name).toBe('user_id');
    expect(chatConversations.title.name).toBe('title');
    expect(chatConversations.lastMessageAt.name).toBe('last_message_at');

    expect(chatMessages.conversationId.name).toBe('conversation_id');
    expect(chatMessages.messageId.name).toBe('message_id');
    expect(chatMessages.role.name).toBe('role');
    expect(chatMessages.parts.name).toBe('parts');
    expect(chatMessages.metadata.name).toBe('metadata');
  });
});

describe('CHAT_MODELS', () => {
  it('keeps the curated native chat model set in one shared place', () => {
    expect(CHAT_MODELS.map((model) => model.id)).toEqual([
      'anthropic/claude-fable-5.1',
      'anthropic/claude-opus-5.5',
      'anthropic/claude-sonnet-5.5',
      'anthropic/claude-haiku-5.5',
      'openai/gpt-5.6-sol',
      'google/gemini-3.8-flash',
      'x-ai/grok-4.7',
      'moonshotai/kimi-k3.1-pro',
      'deepseek/deepseek-v4.1-flash',
    ]);
  });

  it('has no duplicate ids and a label and description for every entry', () => {
    const ids = CHAT_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of CHAT_MODELS) {
      expect(model.label.trim().length).toBeGreaterThan(0);
      expect(model.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('exposes a default model that is part of the curated list', () => {
    expect(DEFAULT_CHAT_MODEL_ID).toBe('anthropic/claude-sonnet-5.5');
    expect(CHAT_MODELS.some((model) => model.id === DEFAULT_CHAT_MODEL_ID)).toBe(true);
  });

  it('validates model IDs against the curated list', () => {
    expect(isChatModelId('x-ai/grok-4.7')).toBe(true);
    expect(isChatModelId('qwen/qwen-plus')).toBe(false);
    expect(isChatModelId('google/gemini-2.0-flash-001')).toBe(false);
  });
});
