/**
 * Homepage-landing opener mechanism.
 *
 * Goal: every time the user lands on the chat homepage (`/` with no `?c=`),
 * the in-app coach meets them with a streamed welcome shaped by the
 * contextual system prompt (the brainlift-count heuristic in
 * `buildBrainliftHeuristics` decides what journey-stage opener to produce).
 * The prompt text introduces the platform and previews what the user can do
 * here.
 *
 * Why streaming matters: a server-pre-generated greeting injected into
 * `initialMessages` arrives as a finished block — the user sees it pop in,
 * not stream. We want the same texture as every other turn.
 *
 * Why not hardcode the greeting text: throws away the contextual heuristics
 * already encoded in the system prompt.
 *
 * Mechanism:
 *
 *   1. `resolveChatConversationSelection` (in `useChatConversations.ts`)
 *      returns `shouldCreateConversation: true` for ANY bare-`/` landing,
 *      regardless of whether the user has prior conversations. The
 *      homepage is the "greet me" surface; existing conversations are
 *      reached only through `/?c=ID`.
 *
 *   2. `ChatHome` reacts to that flag by creating a new conversation. In
 *      its `onSuccess`, it stores the new id in `openerPendingForId` —
 *      this is the SINGLE place where the opener gets armed. Manual New
 *      chat clicks (`handleCreateConversation`) and the post-delete
 *      fallback create do NOT arm it.
 *
 *   3. `NativeChatThread` receives `needsOpener={openerPendingForId === id}`
 *      as a prop. Its `OpenerTrigger` child fires exactly one
 *      `runtime.thread.append({ role: "user", text: OPENER_PROMPT })` when
 *      `needsOpener` is true and `initialMessages` is empty. A module-level
 *      `Set<number>` guards against StrictMode double-mount, HMR, and
 *      parent remounts.
 *
 *   4. The runtime sends the message to `/api/chat/stream`. The server does
 *      NOT special-case it — `OPENER_PROMPT` is a real instruction, the LLM
 *      follows it, the response streams back exactly like any other turn.
 *      Both the user message and the assistant response get persisted.
 *
 *   5. The client's custom `UserMessage` component (in
 *      `native-chat-thread-config.tsx`) checks every user message against
 *      `isOpenerPromptMessage()` and renders `null` when it matches. The
 *      message is in the DB and the runtime state — it is just hidden from
 *      the visible thread.
 *
 * Why bake the instruction into the prompt itself rather than use an opaque
 * sentinel + server stripping:
 *   - One source of truth for the trigger logic — the prompt text IS the
 *     trigger AND the directive. Nothing to keep in sync.
 *   - Zero server complexity. The stream handler stays a pass-through.
 *   - The prompt content remains useful in logs and traces: reading it
 *     tells you exactly what the agent was asked to do.
 *
 * Why pure client state (no DB column) for the gate:
 *   - The trigger condition ("this is a homepage-landing auto-create") is a
 *     transient routing fact, not a property of the conversation. Encoding
 *     it as a column would require setting it on every landing-create and
 *     clearing it after the first stream — server round-trips for state
 *     that lives a few hundred milliseconds.
 *   - Hidden behind a single React state cell in `ChatHome`. No flag to
 *     track in queries, no caches to invalidate.
 *
 * Behavior summary:
 *   - Bare `/` landing            → opener fires (every time)
 *   - `/?c=ID` direct navigation  → no opener
 *   - "New chat" / Cmd+K          → no opener
 *   - Sidebar conversation click  → no opener
 *   - Auto-create after deleting last conversation → no opener
 *
 * Edge cases:
 *   - StrictMode / HMR double-mount: blocked by the module-level Set guard
 *     in `NativeChatThread`.
 *   - User refreshes mid-opener: URL is now `/?c=ID`, so the homepage path
 *     does not re-trigger; the partial assistant turn resumes normally and
 *     the persisted user turn stays hidden by the client filter.
 *
 * Reference sites (search `OPENER_PROMPT` and `openerPending` to find every
 * load-bearing site):
 *   - client/src/chat/chat-opener.ts                   (this file)
 *   - client/src/hooks/useChatConversations.ts         (selection: bare `/`
 *                                                       always requests create)
 *   - client/src/pages/ChatHome.tsx                    (`openerPendingForId`
 *                                                       gate)
 *   - client/src/components/chat/NativeChatThread.tsx  (`OpenerTrigger`)
 *   - client/src/components/chat/native-chat-thread-config.tsx
 *                                                      (UserMessage filter)
 *
 * Branding note: the detection tag `[OPENER]` is brand-agnostic. The body of
 * the prompt is sourced from `brand.config.chatOpenerInstruction`, so each
 * brand owns its own opener language (each brand defines its own tone in
 * its config). The brand selector at `client/src/brand/index.ts`
 * resolves the active brand at module-import time, so this constant is set
 * exactly once per page load.
 */

import { brand } from '@/brand';

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
