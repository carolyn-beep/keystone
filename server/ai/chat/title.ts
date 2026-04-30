import type { StoredChatMessage } from '@shared/schema';
import { callModel } from '../client';

const TITLE_MODEL = 'google/gemini-2.0-flash-001';
const MAX_CONTEXT_CHARS = 2_000;
const FALLBACK_TITLE = 'New chat';

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(0, maxChars).trimEnd();
}

function partToText(part: unknown): string {
  if (!part || typeof part !== 'object') {
    return '';
  }

  const typedPart = part as { type?: unknown; text?: unknown };
  if ((typedPart.type === 'text' || typedPart.type === 'reasoning') && typeof typedPart.text === 'string') {
    return typedPart.text;
  }

  return '';
}

function messageToText(message: StoredChatMessage): string {
  return message.parts
    .map(partToText)
    .filter((text) => text.trim().length > 0)
    .join('\n')
    .trim();
}

function getFirstUserText(messages: StoredChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  return firstUserMessage ? messageToText(firstUserMessage) : '';
}

function buildTitlePrompt(messages: StoredChatMessage[]): string {
  const context = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => {
      const text = messageToText(message);
      return text ? `${message.role}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  return truncate(context, MAX_CONTEXT_CHARS);
}

export function generateFallbackChatTitle(messages: StoredChatMessage[]): string {
  const text = getFirstUserText(messages)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[`*_#>[\](){}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return FALLBACK_TITLE;
  }

  const stopwords = new Set([
    'a',
    'an',
    'and',
    'are',
    'can',
    'for',
    'from',
    'how',
    'the',
    'this',
    'that',
    'with',
    'about',
    'please',
    'help',
    'need',
    'want',
    'would',
    'could',
    'you',
    'me',
  ]);

  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
    .filter((word) => word.length > 0)
    .filter((word) => !stopwords.has(word.toLowerCase()))
    .slice(0, 6);

  const candidate = words.length > 0 ? words.join(' ') : text.split(/\s+/).slice(0, 6).join(' ');
  return sanitizeChatTitle(candidate);
}

export function sanitizeChatTitle(rawTitle: string): string {
  const stripped = rawTitle
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped) {
    return FALLBACK_TITLE;
  }

  const withoutTerminalPunctuation = stripped.replace(/[.!?]+$/g, '').trim();
  const title = withoutTerminalPunctuation || stripped;

  if (title.length <= 60) {
    return title;
  }

  const clipped = title.slice(0, 60).trimEnd();
  const lastSpaceIndex = clipped.lastIndexOf(' ');
  return lastSpaceIndex > 30 ? clipped.slice(0, lastSpaceIndex) : clipped;
}

export function shouldGenerateChatTitle(input: {
  currentTitle: string;
  messages: StoredChatMessage[];
}): boolean {
  if (input.currentTitle !== FALLBACK_TITLE) {
    return false;
  }

  const hasUserMessage = input.messages.some((message) => message.role === 'user');
  const hasAssistantMessage = input.messages.some((message) => message.role === 'assistant');
  return hasUserMessage && hasAssistantMessage;
}

export async function generateChatTitle(messages: StoredChatMessage[]): Promise<string> {
  const conversation = buildTitlePrompt(messages);
  if (!conversation) {
    return FALLBACK_TITLE;
  }

  try {
    const result = await callModel({
      model: TITLE_MODEL,
      caller: 'chat.title',
      temperature: 0.2,
      maxTokens: 24,
      timeout: 4_000,
      retries: 0,
      system: [
        'Generate a concise title for this chat.',
        'Return only the title.',
        'No quotes. No punctuation at the end.',
        'Use 3 to 6 words.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: conversation,
        },
      ],
    });

    const title = sanitizeChatTitle(result.content);
    return title === FALLBACK_TITLE ? generateFallbackChatTitle(messages) : title;
  } catch (error) {
    console.warn('[chat.title] AI title generation failed, using local fallback:', error);
    return generateFallbackChatTitle(messages);
  }
}
