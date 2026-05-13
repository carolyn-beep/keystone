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

/**
 * Is this user message the synthetic homepage `[OPENER]` instruction sent by
 * the frontend to ask the agent to greet the user? Those messages are not
 * substantive student input and must be excluded from title decisions —
 * otherwise the title ends up reflecting the agent's identity greeting
 * (e.g. "AlphaX Buddy: Personalized Brainlift Guidance") instead of the
 * student's actual topic.
 */
function isOpenerUserMessage(message: StoredChatMessage): boolean {
  if (message.role !== 'user') return false;
  const text = messageToText(message);
  return text.startsWith('[OPENER]');
}

/**
 * Strip the homepage OPENER user message AND the immediately-following
 * assistant reply (the agent's identity greeting bound to the OPENER).
 * Returns messages that reflect genuine conversation only.
 */
function stripOpenerExchange(messages: StoredChatMessage[]): StoredChatMessage[] {
  if (messages.length === 0) return messages;
  // Find the first OPENER user message
  const openerIndex = messages.findIndex(isOpenerUserMessage);
  if (openerIndex === -1) return messages;

  // Determine the index of the assistant reply tied to the OPENER. It's
  // the next assistant message after the OPENER user message.
  let removeThrough = openerIndex;
  for (let i = openerIndex + 1; i < messages.length; i++) {
    if (messages[i].role === 'assistant') {
      removeThrough = i;
      break;
    }
    // Another user message before any assistant reply means OPENER was
    // never answered — drop only the OPENER itself.
    if (messages[i].role === 'user') {
      break;
    }
  }

  return [...messages.slice(0, openerIndex), ...messages.slice(removeThrough + 1)];
}

function getFirstUserText(messages: StoredChatMessage[]): string {
  const filtered = stripOpenerExchange(messages);
  const firstUserMessage = filtered.find((message) => message.role === 'user');
  return firstUserMessage ? messageToText(firstUserMessage) : '';
}

function buildTitlePrompt(messages: StoredChatMessage[]): string {
  const filtered = stripOpenerExchange(messages);
  const context = filtered
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

  // Only title once the conversation has REAL content. The homepage OPENER
  // user message and the agent's identity-greeting reply do not count — if
  // we titled after that exchange, every chat would be named after the
  // agent's persona ("AlphaX Buddy: Personalized Brainlift Guidance").
  const real = stripOpenerExchange(input.messages);
  const hasUserMessage = real.some((message) => message.role === 'user');
  const hasAssistantMessage = real.some((message) => message.role === 'assistant');
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
        'You generate short, content-focused titles for chat conversations.',
        '',
        'RULES',
        '- 3 to 6 words. No more.',
        '- Title MUST describe the USER\'S subject or task, not the assistant\'s identity or greeting.',
        '- Never include any of these words: "AlphaX", "AlphaX Buddy", "Brainlift Central", "Buddy",',
        '  "Personalized", "Onboarding", "Assistant", "Available", "Awaits", "Guidance", "Chat",',
        '  "Conversation", "Help", "Welcome", "Hello", "Hi".',
        '- No agent self-references ("personal assistant", "your research helper", etc.).',
        '- Title Case. No quotes. No trailing punctuation. No emoji.',
        '',
        'Return only the title. Nothing else.',
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
