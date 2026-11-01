import React, { useState } from 'react';
import { useMessage, useThread, useThreadRuntime, type ToolCallMessagePartProps } from '@assistant-ui/react';
import type { MessageState, ThreadState } from '@assistant-ui/core';
import {
  AlertTriangle,
  BookOpenText,
  Check,
  ExternalLink,
  Loader2,
  MessageSquareReply,
  PenLine,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type {
  DraftSkillToolInput,
  DraftSkillToolResult,
  SkillDraft,
  SkillDraftWarning,
} from '@shared/chat-skill-draft';
import { SKILL_DESCRIPTION_MAX_LENGTH } from '@shared/chat-skill-draft';
import { formatSkillQualityReviewForChat, type SkillQualityReview } from '@shared/chat-skill-review';
import { useCreateSkill, useReviewSkillDraft } from '@/hooks/useSkills';
import { SkillQualityReviewSection } from './SkillQualityReviewSection';
import {
  buildSkillDraftEditorUrl,
  stashSkillDraftHandoff,
} from '@/components/skills/skill-draft-handoff';
import { cn } from '@/lib/utils';

type Props = ToolCallMessagePartProps<DraftSkillToolInput, DraftSkillToolResult>;

const DRAFT_TOOL_NAME = 'draft_skill';
const BODY_PREVIEW_LINES = 18;

/**
 * Tool UI for `draft_skill` (admin only).
 *
 * Lifecycle:
 *   - streaming   → skeleton while the model writes the draft.
 *   - draft       → the reviewable card: name, visibility, when-to-use, body,
 *                   references, format warnings, Publish / Open in editor.
 *   - superseded  → frozen summary once a LATER draft_skill call exists, either
 *                   later in the same assistant message (the model fixed its own
 *                   format warnings before replying) or in a later message. A
 *                   plain reply does not freeze the card: the admin iterates in
 *                   chat and the newest draft must stay actionable.
 *   - published   → confirmation with a link to the skill. The card writes
 *                   `{ kind: 'published' }` back via addResult so the
 *                   conversation records the outcome.
 */
export function SkillDraftCard(props: Props): JSX.Element {
  const { args, result, status, addResult, toolCallId } = props;

  const myMessageId = useMessage({
    optional: true,
    selector: (m: MessageState) => m.id,
  });
  const supersededInMessage =
    useMessage({
      optional: true,
      selector: (m: MessageState) => {
        const parts = m.content as ReadonlyArray<{ type: string; toolCallId?: string; toolName?: string }>;
        const idx = parts.findIndex((part) => part.type === 'tool-call' && part.toolCallId === toolCallId);
        if (idx === -1) return false;
        return parts.slice(idx + 1).some((part) => part.type === 'tool-call' && part.toolName === DRAFT_TOOL_NAME);
      },
    }) === true;
  const supersededInThread =
    useThread({
      optional: true,
      selector: (t: ThreadState) => {
        if (!myMessageId) return false;
        const idx = t.messages.findIndex((m) => m.id === myMessageId);
        if (idx === -1) return false;
        return t.messages.slice(idx + 1).some((m) =>
          (m.content as ReadonlyArray<{ type: string; toolName?: string }>).some(
            (part) => part.type === 'tool-call' && part.toolName === DRAFT_TOOL_NAME,
          ),
        );
      },
    }) === true;
  const isSuperseded = supersededInMessage || supersededInThread;

  if (result && result.kind === 'published') {
    return <PublishedCard skillName={result.skillName} visibility={result.visibility} />;
  }

  if (status.type === 'incomplete') {
    return (
      <div
        className="skill-draft-card my-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] text-warning"
        role="alert"
      >
        The skill draft was interrupted. Ask for it again.
      </div>
    );
  }

  if (!result || status.type === 'running') {
    const name = typeof args?.name === 'string' && args.name ? `: ${args.name}` : '';
    return (
      <div
        className="skill-draft-card skill-draft-card-skeleton my-3 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-[12px] italic text-muted-foreground"
        aria-busy
      >
        <Loader2 size={13} className="animate-spin" aria-hidden />
        <span>Drafting skill{name}…</span>
      </div>
    );
  }

  if (isSuperseded) {
    return <SupersededCard draft={result.draft} />;
  }

  return (
    <DraftCard
      key={props.toolCallId}
      draft={result.draft}
      warnings={result.warnings}
      addResult={addResult}
    />
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-1.5',
        className,
      )}
    >
      {children}
    </span>
  );
}

function DraftCard({
  draft,
  warnings,
  addResult,
}: {
  draft: SkillDraft;
  warnings: SkillDraftWarning[];
  addResult: Props['addResult'];
}): JSX.Element {
  const createSkill = useCreateSkill();
  const reviewSkill = useReviewSkillDraft();
  const threadRuntime = useThreadRuntime();
  const [visibility, setVisibility] = useState<SkillDraft['visibility']>(draft.visibility);
  const [showFullBody, setShowFullBody] = useState(false);
  const [openReference, setOpenReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<SkillQualityReview | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const bodyLines = draft.body.split('\n');
  const isTruncated = !showFullBody && bodyLines.length > BODY_PREVIEW_LINES;
  const shownBody = isTruncated ? bodyLines.slice(0, BODY_PREVIEW_LINES).join('\n') : draft.body;
  const nameTaken = warnings.some((warning) => warning.code === 'name-taken');
  const isPublishing = createSkill.isPending;
  const isReviewing = reviewSkill.isPending;

  async function handleReview() {
    setReviewError(null);
    try {
      const result = await reviewSkill.mutateAsync({
        name: draft.name,
        description: draft.description,
        body: draft.body,
        visibility,
        references: draft.references,
      });
      setReview(result);
    } catch (reviewFailure) {
      setReviewError(reviewFailure instanceof Error ? reviewFailure.message : 'The quality review failed.');
    }
  }

  function handleSendReviewToChat() {
    if (!review) return;
    void threadRuntime.append(
      `${formatSkillQualityReviewForChat(review)}\n\nRevise the draft to address this review, then show me the new draft.`,
    );
  }

  async function handlePublish() {
    setError(null);
    try {
      const saved = await createSkill.mutateAsync({
        name: draft.name,
        description: draft.description,
        body: draft.body,
        visibility,
        references: draft.references.map((reference) => ({
          path: reference.path,
          content: reference.content,
        })),
        shareIdentifiers: [],
      });
      addResult({ kind: 'published', skillName: saved.name, visibility });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Could not publish the skill.');
    }
  }

  function handleOpenInEditor() {
    stashSkillDraftHandoff({ ...draft, visibility });
    if (typeof window !== 'undefined') {
      window.location.assign(buildSkillDraftEditorUrl());
    }
  }

  return (
    <div className="skill-draft-card my-3 overflow-hidden rounded-xl border border-border bg-card-elevated shadow-card">
      {/* Header strip */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-5 py-2.5">
        <BookOpenText size={13} className="text-primary" aria-hidden />
        <span className="text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
          Skill Draft
        </span>
        <span className="ml-auto rounded-md bg-muted/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {draft.changeSummary ? 'Revised' : 'First draft'}
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Name + visibility */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <Label>Name</Label>
            <p className="truncate font-mono text-[15px] text-foreground">{draft.name}</p>
          </div>
          <div>
            <Label>Visibility</Label>
            <div className="inline-flex rounded-md border border-border bg-card p-0.5" role="radiogroup" aria-label="Visibility">
              {(['public', 'private'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={visibility === option}
                  onClick={() => setVisibility(option)}
                  className={cn(
                    'rounded px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors',
                    visibility === option
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Private-first nudge: the real quality check is running the skill. */}
        <p className="-mt-2 font-serif italic text-[11.5px] leading-relaxed text-muted-light">
          {visibility === 'public'
            ? 'Public goes live for every user at once. Private first lets you test it in a fresh chat, then switch it to public in Skills.'
            : 'Private: only you, and anyone you share it with, can use it. Test it in a fresh chat, then make it public from Skills when it is ready.'}
        </p>

        {/* What changed (revisions only) */}
        {draft.changeSummary ? (
          <div className="rounded-md border border-success/20 bg-success-soft/40 px-3.5 py-2.5">
            <Label className="text-success mb-1">What changed</Label>
            <p className="font-serif italic text-[12.5px] leading-relaxed text-foreground">
              {draft.changeSummary}
            </p>
          </div>
        ) : null}

        {/* When to use */}
        <div>
          <Label>When to use</Label>
          <p className="font-serif text-[14px] leading-relaxed text-foreground">{draft.description}</p>
          <p className="mt-1 text-right text-[10px] text-muted-light">
            {draft.description.length} / {SKILL_DESCRIPTION_MAX_LENGTH}
          </p>
        </div>

        {/* Body */}
        <div>
          <Label>Skill body</Label>
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card px-3.5 py-3 font-mono text-[12px] leading-[1.55] text-foreground">
            {shownBody}
            {isTruncated ? '\n…' : ''}
          </pre>
          {bodyLines.length > BODY_PREVIEW_LINES ? (
            <button
              type="button"
              onClick={() => setShowFullBody((current) => !current)}
              className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary hover:underline"
            >
              {showFullBody ? 'Show less' : `Show all ${bodyLines.length} lines`}
            </button>
          ) : null}
        </div>

        {/* References */}
        {draft.references.length > 0 ? (
          <div>
            <Label>References</Label>
            <ul className="space-y-1.5">
              {draft.references.map((reference) => {
                const isOpen = openReference === reference.path;
                return (
                  <li key={reference.path} className="rounded-md border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => setOpenReference(isOpen ? null : reference.path)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    >
                      <span className="truncate font-mono text-[12px] text-foreground">{reference.path}</span>
                      <span className="shrink-0 text-[10px] text-muted-light">
                        {reference.content.split('\n').length} lines
                      </span>
                    </button>
                    {isOpen ? (
                      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2.5 font-mono text-[11.5px] leading-[1.55] text-foreground">
                        {reference.content}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* Format checks */}
        {warnings.length > 0 ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3.5 py-2.5">
            <Label className="text-warning mb-1.5">Format checks</Label>
            <ul className="space-y-1">
              {warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`} className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground">
                  <AlertTriangle size={12} className="mt-[3px] shrink-0 text-warning" aria-hidden />
                  <span>{warning.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Quality review: does it fire, can it run, is it good */}
        {review ? (
          <div className="space-y-2">
            <SkillQualityReviewSection review={review} />
            <button
              type="button"
              onClick={handleSendReviewToChat}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted/60"
            >
              <MessageSquareReply size={13} aria-hidden />
              <span>Send review to chat for a revised draft</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-dashed border-border px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => void handleReview()}
              disabled={isReviewing || isPublishing}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReviewing ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <ShieldCheck size={13} aria-hidden />}
              <span>{isReviewing ? 'Reviewing… about half a minute' : 'Run quality review'}</span>
            </button>
            <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Trigger test against the live catalogue, a check that every tool exists, and a scored critique. A few cents.
            </p>
          </div>
        )}

        {reviewError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive-soft px-3.5 py-2.5 text-[12px] text-destructive" role="alert">
            {reviewError}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive-soft px-3.5 py-2.5 text-[12px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {/* Actions */}
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={isPublishing || nameTaken}
            className={cn(
              'flex items-center justify-center gap-2 rounded-md px-5 py-3 text-[13px] font-semibold transition-colors',
              isPublishing || nameTaken
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : 'bg-foreground text-background hover:bg-foreground/90',
            )}
          >
            {isPublishing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
            <span>{isPublishing ? 'Publishing…' : 'Publish skill'}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenInEditor}
            disabled={isPublishing}
            className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PenLine size={14} aria-hidden />
            <span>Open in editor</span>
          </button>
        </div>

        <p className="-mt-2 text-center font-serif italic text-[11.5px] leading-relaxed text-muted-light">
          {nameTaken
            ? 'Pick another name before publishing.'
            : 'Want changes? Reply below and a revised draft will follow.'}
        </p>
      </div>
    </div>
  );
}

function PublishedCard({
  skillName,
  visibility,
}: {
  skillName: string;
  visibility?: SkillDraft['visibility'];
}): JSX.Element {
  const skillsHref = `/skills?view=edit&name=${encodeURIComponent(skillName)}`;
  const linkClass =
    'inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] font-semibold text-primary hover:underline';
  return (
    <div className="skill-draft-card skill-draft-card-published my-3 rounded-lg border border-success/30 bg-success-soft/40 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Check size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.25em] font-semibold text-success">
            Skill published{visibility ? ` · ${visibility}` : ''}
          </span>
          <p className="font-serif text-[13px] leading-relaxed text-foreground">
            <span className="font-mono">{skillName}</span>
            {visibility === 'private'
              ? ' is live for you in new conversations. Test it in a fresh chat, then make it public from Skills when it is ready.'
              : ' is live for new conversations. Start a fresh chat to try it.'}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            <a href="/?new=1" className={linkClass}>
              <span>Test in a new chat</span>
              <ExternalLink size={11} aria-hidden />
            </a>
            <a href={skillsHref} className={linkClass}>
              <span>Open in Skills</span>
              <ExternalLink size={11} aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupersededCard({ draft }: { draft: SkillDraft }): JSX.Element {
  return (
    <div
      className="skill-draft-card skill-draft-card-superseded my-3 rounded-lg border border-border bg-card/60 px-4 py-3 opacity-70"
      aria-disabled
    >
      <div className="flex items-start gap-2.5">
        <BookOpenText size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.25em] font-semibold text-muted-foreground">
            Earlier draft
          </span>
          <p className="font-serif italic text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-mono not-italic">{draft.name}</span>
            {draft.changeSummary ? ` · ${draft.changeSummary}` : ''} · replaced by a later draft below.
          </p>
        </div>
      </div>
    </div>
  );
}
