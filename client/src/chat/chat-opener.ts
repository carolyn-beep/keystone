/**
 * Homepage-landing opener prompt and cooldown helpers.
 *
 * The opener is only considered for an empty conversation that `ChatHome`
 * auto-created from the bare homepage route. The cross-session gate is a
 * user-scoped localStorage timestamp: each user on the same browser gets their
 * own 48h cooldown.
 */

import { brand } from '@/brand';

export const CHAT_OPENER_COOLDOWN_MS = 48 * 60 * 60 * 1000;

export function getChatOpenerStorageKey(userId: string): string {
  return `chat-opener:last-sent-at:${userId}`;
}

function getBrowserStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function shouldSendChatOpener(
  userId: string,
  now = Date.now(),
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;

  try {
    const rawLastSentAt = storage.getItem(getChatOpenerStorageKey(userId));
    if (!rawLastSentAt) return true;

    const lastSentAt = Number.parseInt(rawLastSentAt, 10);
    if (!Number.isFinite(lastSentAt)) return true;

    return now - lastSentAt > CHAT_OPENER_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markChatOpenerSent(
  userId: string,
  now = Date.now(),
  storage: Storage | null = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(getChatOpenerStorageKey(userId), String(now));
  } catch {
    // If localStorage is unavailable, skip persistence and avoid blocking chat.
  }
}

/**
 * The exact text inserted into the priming user message. Doubles as the
 * instruction the LLM follows: it asks the agent to open the conversation
 * per the system prompt's journey-stage heuristics. The opening tag makes
 * the message trivially detectable by the client filter and gives a
 * developer reading raw logs a clear signal of what kind of turn this is.
 */
export const OPENER_PROMPT = `[OPENER] ${brand.config.chatOpenerInstruction}`;

/**
 * Returns true if a message is the opener-prompt user message produced by
 * the client trigger. Accepts both shapes that exist in this codebase:
 *
 *   - Runtime `ThreadMessage` (from `useMessage()` / `useThread`): uses
 *     `content: [{ type: "text", text }]`.
 *   - Persisted / wire-format `UIMessage` (AI SDK, `onFinish.messages`,
 *     `initialMessages`): uses `parts: [{ type: "text", text }]`.
 *
 * Centralized so the client filter has one place to change if the prompt
 * text ever evolves.
 */
export function isOpenerPromptMessage(message: {
  role?: string;
  content?: ReadonlyArray<unknown>;
  parts?: ReadonlyArray<unknown>;
}): boolean {
  if (message.role !== 'user') {
    return false;
  }
  const firstPart = message.content?.[0] ?? message.parts?.[0];
  if (!firstPart || typeof firstPart !== 'object') {
    return false;
  }
  const part = firstPart as { type?: unknown; text?: unknown };
  return part.type === 'text'
    && typeof part.text === 'string'
    && part.text.startsWith('[OPENER]');
}
