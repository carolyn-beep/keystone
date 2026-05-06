/**
 * `ask_user_question` tool — shared types and pure helpers.
 *
 * The tool is client-resolved: it has no server `execute` function. The LLM
 * emits the call with the questions; the client renders a form; the user
 * submits; the client calls `addResult(...)` on the tool-call message part;
 * the AI SDK auto-resubmits the conversation (via
 * `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`) so
 * the LLM continues from the answers.
 *
 * Reference sites:
 *   - server tool stub:    server/ai/chat/tools/ask-user.ts
 *   - tool UI registry:    client/src/components/chat/native-chat-thread-config.tsx
 *   - UI component:        client/src/components/chat/AskUserQuestionCard.tsx
 *   - runtime auto-resume: client/src/hooks/useNativeChatRuntime.ts
 */

/**
 * One question inside an `ask_user_question` tool call.
 *
 * Source: tool input schema (LLM-emitted args).
 */
export interface AskUserQuestion {
  /**
   * Stable identifier the LLM provides. The answer comes back keyed by this
   * id so the agent can reason about "the answer to question X" without
   * positional ambiguity. Should be unique within a single tool call.
   */
  id: string;
  /** The question text the student sees. Plain text in v1 (no markdown). */
  prompt: string;
  /** Optional list of preset choices. Empty/omitted = free-text only. */
  options?: string[];
  /**
   * Whether the student can pick multiple options. Default false.
   * Free-text is independent of this flag — see `allowFreeText`.
   */
  multiSelect?: boolean;
  /** Whether to render a free-text input alongside any options. Default true. */
  allowFreeText?: boolean;
  /** Optional questions don't gate the submit button. Default false. */
  optional?: boolean;
}

/**
 * One answer in the tool result, paired with its question by `id`.
 */
export interface AskUserAnswer {
  /** Matches `AskUserQuestion.id`. */
  id: string;
  /**
   * Options the student selected. Always an array — length 0 or 1 for
   * single-select, 0..N for multi-select. Empty if the student answered
   * only via free text.
   */
  selectedOptions: string[];
  /**
   * Free-text answer if the student typed one. Trimmed; empty string is
   * normalized to undefined before the result is sent.
   */
  freeText?: string;
}

export interface AskUserQuestionToolInput {
  questions: AskUserQuestion[];
}

export interface AskUserQuestionToolResult {
  answers: AskUserAnswer[];
}

/**
 * Component-local draft state, keyed by `question.id`. Exported so the pure
 * helpers below have a documented input type.
 */
export interface AskUserDraftAnswer {
  selectedOptions: ReadonlySet<string>;
  freeText: string;
}

export type AskUserDraftAnswers = Readonly<Record<string, AskUserDraftAnswer>>;

/**
 * True iff this question has any answer in the draft — at least one selected
 * option OR non-empty trimmed free text.
 */
export function isAskUserQuestionAnswered(
  question: AskUserQuestion,
  draft: AskUserDraftAnswers,
): boolean {
  const answer = draft[question.id];
  if (!answer) return false;
  if (answer.selectedOptions.size > 0) return true;
  return answer.freeText.trim().length > 0;
}

/**
 * Returns true iff every REQUIRED question is satisfied by the draft.
 * Optional questions never block submission; users can submit them blank.
 *
 * Used to gate the submit button so the student cannot send a partial
 * response. See spec FR3.
 */
export function isAskUserDraftComplete(
  questions: readonly AskUserQuestion[],
  draft: AskUserDraftAnswers,
): boolean {
  if (questions.length === 0) {
    return false;
  }

  return questions.every((question) => {
    if (question.optional) return true;
    return isAskUserQuestionAnswered(question, draft);
  });
}

/**
 * Progress counter for required questions. Optional questions are excluded
 * from both the numerator and denominator so the counter always reads as
 * "X of N required answered" where N = required question count.
 */
export function countAskUserRequiredAnswered(
  questions: readonly AskUserQuestion[],
  draft: AskUserDraftAnswers,
): { answered: number; required: number } {
  const required = questions.filter((question) => !question.optional);
  const answered = required.filter((question) => isAskUserQuestionAnswered(question, draft)).length;
  return { answered, required: required.length };
}

/**
 * Returns the first required question that is not yet answered, or null if
 * every required question has an answer. Used by the submit click handler
 * to scroll/focus the user to the gap when they try to submit early.
 */
export function findFirstUnansweredRequired(
  questions: readonly AskUserQuestion[],
  draft: AskUserDraftAnswers,
): AskUserQuestion | null {
  for (const question of questions) {
    if (question.optional) continue;
    if (!isAskUserQuestionAnswered(question, draft)) return question;
  }
  return null;
}

/**
 * Normalize the component-local draft into the wire-format result.
 *
 * Rules:
 *   - `selectedOptions` is emitted in source-order from `question.options`,
 *     not in click-order, so the same picks always serialize the same way.
 *   - Selected entries that aren't in `question.options` are filtered out
 *     defensively (the UI only emits valid picks, but never trust input).
 *   - `freeText` is trimmed; an empty string is normalized to `undefined`.
 *   - Questions missing from `draft` produce an empty answer (defensive —
 *     the submit gate prevents this in practice).
 */
export function buildAskUserResult(
  questions: readonly AskUserQuestion[],
  draft: AskUserDraftAnswers,
): AskUserQuestionToolResult {
  const answers: AskUserAnswer[] = questions.map((question) => {
    const answer = draft[question.id];
    if (!answer) {
      return { id: question.id, selectedOptions: [] };
    }

    const validOptionSet = new Set(question.options ?? []);
    const selectedOptions = (question.options ?? []).filter((option) => (
      answer.selectedOptions.has(option) && validOptionSet.has(option)
    ));

    const trimmedFreeText = answer.freeText.trim();
    const result: AskUserAnswer = {
      id: question.id,
      selectedOptions,
    };
    if (trimmedFreeText.length > 0) {
      result.freeText = trimmedFreeText;
    }
    return result;
  });

  return { answers };
}
