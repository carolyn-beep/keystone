import React, { useRef, useState } from 'react';
import { ArrowUp, Check, Loader2 } from 'lucide-react';
import { useMessage, useThread, type ToolCallMessagePartProps } from '@assistant-ui/react';
import {
  buildAskUserResult,
  countAskUserRequiredAnswered,
  findFirstUnansweredRequired,
  isAskUserDraftComplete,
  isAskUserQuestionAnswered,
  type AskUserDraftAnswer,
  type AskUserDraftAnswers,
  type AskUserQuestion,
  type AskUserQuestionToolInput,
  type AskUserQuestionToolResult,
} from '@shared/chat-ask-user';
import { cn } from '@/lib/utils';

type Props = ToolCallMessagePartProps<
  AskUserQuestionToolInput,
  AskUserQuestionToolResult
>;

/**
 * Tool UI for `ask_user_question`.
 *
 * Lifecycle (per assistant-ui docs — "Tool Status Handling" + "Deferred
 * Rendering" in /docs/guides/tool-ui):
 *
 *   - `result` present → render the answered summary. The card stays in
 *     thread history once submitted; the LLM's next turn carries forward.
 *   - args still streaming (`questions` not yet a populated array) → render
 *     a skeleton. Touching `args.questions` before it's complete throws,
 *     which is exactly the bug we are fixing.
 *   - `status.type === 'incomplete'` → render a small error.
 *   - Args ready, no result → mount the inner form. The form owns its own
 *     local state so its initializer sees the FINAL `questions` array, not
 *     a partial one.
 *
 * `addResult` is called exactly once per card lifetime (guarded by a ref),
 * per the docs callout: "Call addResult(...) exactly once to complete the
 * tool call."
 */
export function AskUserQuestionCard(props: Props) {
  const { args, result, status } = props;

  // Stale-card detection: if the student typed a free-form reply in the
  // composer (or the agent moved on for any other reason), a newer message
  // exists after our parent in the thread. Use the surrounding `useMessage`
  // context to grab our parent message id reliably (`props.parentId` is
  // declared optional on `ToolCallMessagePart` and isn't always populated
  // by the AI SDK runtime), then look it up in the thread's message list.
  //
  // `optional: true` keeps both hooks safe in test environments that render
  // the component without runtime providers — the selectors return `null`
  // and we treat that as "not stale" (no state to compare against).
  const myMessageId = useMessage({
    optional: true,
    selector: (messageState) => messageState.id,
  });
  const isStale = useThread({
    optional: true,
    selector: (threadState) => {
      if (!myMessageId) return false;
      const messages = threadState.messages;
      const index = messages.findIndex((message) => message.id === myMessageId);
      if (index === -1) return false;
      return index < messages.length - 1;
    },
  }) === true;

  // Only branch into the answered summary if the persisted result actually
  // carries a valid answers array. A truthy-but-malformed `result` shows up
  // for tool calls left orphaned by earlier broken renders (call landed,
  // submit never fired). For those, fall through to the form/skeleton path.
  if (result && Array.isArray(result.answers) && result.answers.length > 0) {
    return <AnsweredSummary args={args} result={result} />;
  }

  if (isStale) {
    return <SupersededQuestion args={args} />;
  }

  if (status.type === 'incomplete') {
    return (
      <div className="ask-user-card ask-user-card-error" role="alert">
        Question card was interrupted. Try again.
      </div>
    );
  }

  // While the model streams the tool-call JSON, args fields fill in
  // incrementally — `questions[0]` may exist with only `id` while `prompt`
  // and `options` are still arriving. Mounting the form here would lock
  // those partials into `useState` and the prompt/options would never
  // appear. Defer until streaming finishes (`requires-action` = args
  // complete + awaiting client result, `complete` = result already in).
  // See assistant-ui docs §"Tool Status Handling" and §"Deferred Rendering".
  if (status.type === 'running') {
    return (
      <div className="ask-user-card ask-user-card-skeleton" aria-busy>
        <Loader2 size={14} className="animate-spin" aria-hidden />
        <span>Preparing question…</span>
      </div>
    );
  }

  const questions = args?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    // Defensive — should not happen once status is `requires-action`.
    return (
      <div className="ask-user-card ask-user-card-skeleton" aria-busy>
        <Loader2 size={14} className="animate-spin" aria-hidden />
        <span>Preparing question…</span>
      </div>
    );
  }

  return (
    <AskUserForm
      key={props.toolCallId}
      toolCallId={props.toolCallId}
      questions={questions}
      addResult={props.addResult}
    />
  );
}

function readConversationIdFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('c');
  return raw && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
}

/**
 * Fire-and-forget POST to a server endpoint that records the failed-submit
 * state. Replaces the user-facing diagnostic strip — when a user reports
 * "I filled everything but couldn't submit," grep server logs for the event
 * by `userId`, `conversationId`, or `toolCallId` and the per-question state
 * tells us exactly which field was actually blank.
 */
function reportAskUserSubmitBlocked({
  toolCallId,
  questions,
  draft,
}: {
  toolCallId: string;
  questions: readonly AskUserQuestion[];
  draft: AskUserDraftAnswers;
}): void {
  const conversationId = readConversationIdFromUrl();
  const payload = {
    conversationId,
    toolCallId,
    questions: questions.map((question) => {
      const answer = draft[question.id] ?? { selectedOptions: new Set<string>(), freeText: '' };
      const trimmedLength = answer.freeText.trim().length;
      return {
        id: question.id,
        optional: question.optional === true,
        optionCount: question.options?.length ?? 0,
        multiSelect: question.multiSelect === true,
        allowFreeText: question.allowFreeText !== false,
        selectedCount: answer.selectedOptions.size,
        freeTextLength: answer.freeText.length,
        freeTextTrimmedLength: trimmedLength,
        answered: answer.selectedOptions.size > 0 || trimmedLength > 0,
        promptPreview: question.prompt.slice(0, 200),
      };
    }),
  };

  void fetch('/api/chat/diagnostics/ask-user-blocked', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Diagnostic logging — never let a failure here surface to the user.
  });
}

/**
 * The actual form. Mounted only after the outer gate confirms `questions` is
 * a fully-streamed array, so the state initializer captures the final shape.
 */
function AskUserForm({
  questions: incomingQuestions,
  addResult,
  toolCallId,
}: {
  questions: AskUserQuestion[];
  addResult: Props['addResult'];
  toolCallId: string;
}) {
  // De-dup defensively. Schema does not enforce id uniqueness; if the LLM
  // emits duplicates, keep first occurrence so React keys are stable.
  const [questions] = useState<AskUserQuestion[]>(() => {
    const seen = new Set<string>();
    const deduped: AskUserQuestion[] = [];
    for (const question of incomingQuestions) {
      if (!seen.has(question.id)) {
        seen.add(question.id);
        deduped.push(question);
      }
    }
    return deduped;
  });

  const [draft, setDraft] = useState<Record<string, AskUserDraftAnswer>>(() => {
    const initial: Record<string, AskUserDraftAnswer> = {};
    for (const question of questions) {
      initial[question.id] = emptyDraft();
    }
    return initial;
  });

  const submittedRef = useRef(false);
  const sectionRefs = useRef(new Map<string, HTMLElement | null>());
  // True after a failed submit click. Drives the per-question red-ring
  // highlight; clears per-question automatically as each one is answered.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  function setSelectedOption(question: AskUserQuestion, option: string) {
    setDraft((current) => {
      const previous = current[question.id] ?? emptyDraft();
      const nextSelected = new Set(previous.selectedOptions);
      if (question.multiSelect) {
        if (nextSelected.has(option)) {
          nextSelected.delete(option);
        } else {
          nextSelected.add(option);
        }
      } else if (nextSelected.has(option)) {
        nextSelected.delete(option);
      } else {
        nextSelected.clear();
        nextSelected.add(option);
      }
      return {
        ...current,
        [question.id]: { ...previous, selectedOptions: nextSelected },
      };
    });
  }

  function setFreeText(question: AskUserQuestion, value: string) {
    setDraft((current) => {
      const previous = current[question.id] ?? emptyDraft();
      return {
        ...current,
        [question.id]: { ...previous, freeText: value },
      };
    });
  }

  function handleSubmit() {
    if (submittedRef.current) return;
    const draftSnapshot = draft as AskUserDraftAnswers;
    if (!isAskUserDraftComplete(questions, draftSnapshot)) {
      // Don't silently no-op — scroll to the first gap and ring it red.
      // Also fire a server-side log so support can find the exact form
      // state from logs alone if the user opens a ticket.
      setSubmitAttempted(true);
      reportAskUserSubmitBlocked({ toolCallId, questions, draft: draftSnapshot });
      const missing = findFirstUnansweredRequired(questions, draftSnapshot);
      if (missing) {
        const node = sectionRefs.current.get(missing.id);
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    submittedRef.current = true;
    addResult(buildAskUserResult(questions, draftSnapshot));
  }

  const { answered, required } = countAskUserRequiredAnswered(
    questions,
    draft as AskUserDraftAnswers,
  );
  const showCounter = required > 1;
  const showQuestionLabels = questions.length > 1;

  return (
    <div className="ask-user-card" role="group" aria-label="Question for you">
      {questions.map((question, index) => {
        const answer = draft[question.id] ?? emptyDraft();
        const allowFreeText = question.allowFreeText !== false;
        const hasOptions = (question.options?.length ?? 0) > 0;
        const hasError =
          submitAttempted
          && !question.optional
          && !isAskUserQuestionAnswered(question, draft as AskUserDraftAnswers);

        return (
          <section
            key={question.id}
            ref={(node) => {
              sectionRefs.current.set(question.id, node);
            }}
            className={cn('ask-user-question', hasError && 'ask-user-question-error')}
          >
            {showQuestionLabels ? (
              <div className="ask-user-question-label">
                Question {index + 1} of {questions.length}
              </div>
            ) : null}
            <p className="ask-user-question-prompt">
              {question.prompt}
              {question.optional ? (
                <span className="ask-user-optional-tag"> (optional)</span>
              ) : null}
            </p>

            {hasOptions ? (
              <div
                className="ask-user-options"
                role={question.multiSelect ? 'group' : 'radiogroup'}
                aria-label={question.prompt}
              >
                {question.options!.map((option) => {
                  const selected = answer.selectedOptions.has(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      role={question.multiSelect ? 'checkbox' : 'radio'}
                      aria-checked={selected}
                      onClick={() => setSelectedOption(question, option)}
                      className={cn(
                        'ask-user-option',
                        selected && 'ask-user-option-selected',
                      )}
                    >
                      {selected ? (
                        <Check size={13} strokeWidth={2.5} className="ask-user-option-check" />
                      ) : null}
                      <span>{option}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {allowFreeText ? (
              <textarea
                rows={hasOptions ? 2 : 3}
                value={answer.freeText}
                onChange={(event) => setFreeText(question, event.target.value)}
                placeholder={hasOptions ? 'Or write your own answer…' : 'Type your answer…'}
                className="ask-user-free-text"
              />
            ) : null}
          </section>
        );
      })}

      {submitAttempted && answered < required ? (
        <p className="ask-user-submit-error" role="alert">
          Please answer the highlighted question{required - answered > 1 ? 's' : ''} to continue.
        </p>
      ) : null}

      <div className="ask-user-actions">
        {showCounter ? (
          <span className="ask-user-counter" aria-live="polite">
            {answered} of {required} answered
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleSubmit}
          aria-label="Submit answer"
          className="ask-user-submit"
        >
          <span>Submit</span>
          <ArrowUp size={14} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function AnsweredSummary({
  args,
  result,
}: {
  args: AskUserQuestionToolInput | undefined;
  result: AskUserQuestionToolResult;
}) {
  // The outer gate guarantees `result.answers` is a non-empty array, but we
  // may have lost the original args (e.g. cached run, persisted tool call).
  const questions = args?.questions ?? [];
  const answers = result.answers;

  return (
    <div className="ask-user-card ask-user-card-answered" role="group" aria-label="Your answers">
      {answers.map((answer, index) => {
        const question = questions.find((q) => q.id === answer.id);
        const parts: string[] = [];
        if (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0) {
          parts.push(answer.selectedOptions.join(', '));
        }
        if (answer.freeText) {
          parts.push(answer.freeText);
        }
        return (
          <div key={answer.id ?? `answer-${index}`} className="ask-user-answered-row">
            <div className="ask-user-question-label ask-user-answered-label">
              {answers.length > 1 ? `Question ${index + 1}` : 'Your answer'}
            </div>
            {question ? (
              <p className="ask-user-answered-prompt">{question.prompt}</p>
            ) : null}
            <p className="ask-user-answered-value">{parts.join(' — ')}</p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Frozen view of an unanswered question whose turn has passed. Rendered when
 * the student replied via the composer instead of the form (or the agent
 * moved on for any other reason). Non-interactive — chips and textarea are
 * disabled, no submit button.
 */
function SupersededQuestion({ args }: { args: AskUserQuestionToolInput | undefined }) {
  const questions = args?.questions ?? [];
  if (questions.length === 0) {
    return (
      <div className="ask-user-card ask-user-card-superseded" aria-disabled>
        <span className="ask-user-superseded-label">Question skipped</span>
      </div>
    );
  }

  return (
    <div className="ask-user-card ask-user-card-superseded" aria-disabled aria-label="Question skipped">
      <span className="ask-user-superseded-label">Question skipped</span>
      {questions.map((question, index) => {
        const hasOptions = (question.options?.length ?? 0) > 0;
        return (
          <section key={question.id ?? `q-${index}`} className="ask-user-question">
            {questions.length > 1 ? (
              <div className="ask-user-question-label">
                Question {index + 1} of {questions.length}
              </div>
            ) : null}
            <p className="ask-user-question-prompt">{question.prompt}</p>
            {hasOptions ? (
              <div className="ask-user-options" aria-hidden>
                {question.options!.map((option) => (
                  <span key={option} className="ask-user-option ask-user-option-disabled">
                    {option}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function emptyDraft(): AskUserDraftAnswer {
  return { selectedOptions: new Set<string>(), freeText: '' };
}
