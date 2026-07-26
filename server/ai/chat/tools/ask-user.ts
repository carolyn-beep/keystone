import { tool } from 'ai';
import { z } from 'zod';
import { brandId } from '../../../brand';

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

const isKeystone = brandId === 'keystone';

const ASK_USER_QUESTION_DESCRIPTION = isKeystone
  ? "Ask the student a structured question (or batch of related questions) with optional preset choices and/or free-text. Prefer this over rendering markdown bullet questions when you need a clean, structured answer back. Pass one question for a single ask, or several to collect a related batch in one card.\n\n"
    + "STRICT AUTHORSHIP RULE FOR `options`: NEVER populate `options[]` with substantive content about the student's topic. That includes candidate DOK2 summaries, candidate DOK3 insights, candidate DOK4 SPOVs, candidate stances, candidate framings, candidate angles — any phrasing that, if picked, would become the student's authored content. The radio-option UI is NOT a back door for hand-drafting. If you find yourself listing 3 or 4 candidate positions/insights/summaries for the student to pick from, STOP — drop the `options[]` array entirely and let the student answer in free-text. Their words must come from them, not from a list you wrote.\n\n"
    + "What `options` IS for: genuine pickable choices that exist independently of the substance the student must author. Examples: which brainlift this belongs to (list of their existing brainlifts), which source from search results to fetch next, pick-all-that-apply from a fixed enumerated set (mediums, formats, sprint stages), or short factual intake where the choices are not substantive content (e.g. 'business idea / personal experience / academic project / just exploring'). When in doubt: if a picked option would land in the brainlift as the student's stance/summary/insight, it does not belong in `options[]`."
  : 'Ask the student a structured question (or batch of related questions) with optional preset choices and/or free-text. '
    + 'Prefer this over rendering markdown bullet questions when you need a clean, structured answer back. '
    + 'Pass one question for a single ask, or several to collect a related batch in one card.';

const OPTIONS_DESCRIPTION = isKeystone
  ? "Optional preset choices. Omit for free-text-only. NEVER use this to surface candidate DOK2/3/4 content, candidate stances, candidate framings, or any substantive phrasing about the student's topic that would become their authored content if picked. Use only for genuine pickable choices independent of the substance the student must author."
  : 'Optional preset choices. Omit for free-text-only.';

const askUserQuestionSchema = z.object({
  id: z.string().min(1).describe('Stable identifier for this question; the answer comes back keyed by this id.'),
  prompt: z.string().min(1).describe('The question text the student will see.'),
  options: z.array(z.string().min(1)).optional().describe(OPTIONS_DESCRIPTION),
  multiSelect: z.boolean().optional().describe('Allow picking more than one option. Defaults to false.'),
  allowFreeText: z.boolean().optional().describe('Render a free-text input alongside any options. Defaults to true.'),
  optional: z.boolean().optional().describe('Mark the question as skippable. Defaults to false.'),
});

export function buildAskUserQuestionTool() {
  return {
    ask_user_question: tool({
      description: ASK_USER_QUESTION_DESCRIPTION,
      inputSchema: z.object({
        questions: z.array(askUserQuestionSchema).min(1).describe('One or more questions to ask the student.'),
      }),
      // No `execute` — this tool is resolved by the client UI.
    }),
  };
}
