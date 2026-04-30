import { tool } from 'ai';
import { z } from 'zod';

/**
 * `ask_user_question` is a CLIENT-RESOLVED tool. It has no `execute` function:
 * the LLM emits the call, the AI SDK leaves it pending, and the client UI
 * (see `client/src/components/chat/AskUserQuestionCard.tsx`) collects the
 * student's answer and calls `addResult(...)` to fill it in. The runtime is
 * configured with `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`,
 * so the conversation auto-resumes once the answer lands.
 *
 * See `shared/chat-ask-user.ts` for the full type contract.
 */

const askUserQuestionSchema = z.object({
  id: z.string().min(1).describe('Stable identifier for this question; the answer comes back keyed by this id.'),
  prompt: z.string().min(1).describe('The question text the student will see.'),
  options: z.array(z.string().min(1)).optional().describe('Optional preset choices. Omit for free-text-only.'),
  multiSelect: z.boolean().optional().describe('Allow picking more than one option. Defaults to false.'),
  allowFreeText: z.boolean().optional().describe('Render a free-text input alongside any options. Defaults to true.'),
});

export function buildAskUserQuestionTool() {
  return {
    ask_user_question: tool({
      description:
        'Ask the student a structured question (or batch of related questions) with optional preset choices and/or free-text. '
        + 'Prefer this over rendering markdown bullet questions when you need a clean, structured answer back. '
        + 'Pass one question for a single ask, or several to collect a related batch in one card.',
      inputSchema: z.object({
        questions: z.array(askUserQuestionSchema).min(1).describe('One or more questions to ask the student.'),
      }),
      // No `execute` — this tool is resolved by the client UI.
    }),
  };
}
