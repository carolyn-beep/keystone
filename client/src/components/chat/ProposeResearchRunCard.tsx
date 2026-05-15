import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMessage, useThread, type ToolCallMessagePartProps } from '@assistant-ui/react';
import { AlertCircle, ExternalLink, Loader2, Radar, Send, Sparkles } from 'lucide-react';
import { LaunchError, useLaunchResearchStream } from '@/hooks/useLaunchResearchStream';
import { useRunSpecEditor } from '@/hooks/useRunSpecEditor';
import { useConversationBrainlift } from '@/hooks/useConversationBrainlift';
import {
  RETRIEVAL_TYPES,
  type RetrievalType,
} from '@shared/research-stream';
import type {
  ProposeResearchRunToolExecuteResult,
  ProposeResearchRunToolInput,
  ProposeResearchRunToolResult,
} from '@shared/chat-research-stream';
import { cn } from '@/lib/utils';

type CombinedResult =
  | ProposeResearchRunToolExecuteResult
  | ProposeResearchRunToolResult;

type Props = ToolCallMessagePartProps<ProposeResearchRunToolInput, CombinedResult>;

const SLOT_TYPE_LABELS: Record<RetrievalType, string> = {
  Substack: 'Substack',
  AcademicPaper: 'Academic',
  Twitter: 'Twitter',
  Video: 'Video',
  Podcast: 'Podcast',
  News: 'News',
};

function readConversationIdFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('c');
  return raw && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
}

function isLaunchedResult(result: CombinedResult | undefined): result is { kind: 'launched'; runId: number } {
  return Boolean(result && typeof result === 'object' && 'kind' in result && result.kind === 'launched');
}

function isStoredBlockedResult(
  result: CombinedResult | undefined,
): result is { kind: 'blocked'; existingRunId: number } {
  return Boolean(result && typeof result === 'object' && 'kind' in result && result.kind === 'blocked');
}

function isExecuteResult(result: CombinedResult | undefined): result is ProposeResearchRunToolExecuteResult {
  return Boolean(result && typeof result === 'object' && 'blocked' in result);
}

/**
 * Tool UI for `propose_research_run`. Compact inline card rendered in the
 * AlphaX chat thread, designed in the neo-editorial idiom: warm parchment
 * surfaces, serif type for content, small-caps sans-serif for labels.
 *
 * Lifecycle states:
 *   - streaming  → skeleton while tool args + result are arriving.
 *   - blocked    → "a swarm is already running" with Watch progress link.
 *                  Calls `addResult({ kind: 'blocked', existingRunId })` once.
 *   - editable   → seeded RunSpec editor; Launch button posts to /launch.
 *   - launched   → "launched as run #N" with link to research-stream tab.
 *   - stale      → frozen read-only when a newer message lands in the thread.
 */
export function ProposeResearchRunCard(props: Props): JSX.Element {
  const { result, status, addResult } = props;

  // Stale detection mirrors AskUserQuestionCard.tsx:49-69. `optional: true`
  // keeps both hooks safe in tests that mount without a runtime provider.
  const myMessageId = useMessage({
    optional: true,
    selector: (m) => m.id,
  });
  const isStale =
    useThread({
      optional: true,
      selector: (t) => {
        if (!myMessageId) return false;
        const idx = t.messages.findIndex((m) => m.id === myMessageId);
        if (idx === -1) return false;
        return idx < t.messages.length - 1;
      },
    }) === true;

  // The card is bound to the same brainlift as the chat conversation.
  const conversationId = readConversationIdFromUrl();
  const conversationBrainlift = useConversationBrainlift(conversationId ?? 0);
  const slug = conversationBrainlift.data?.brainlift?.slug ?? '';

  // ----- Launched: terminal read-only state ---------------------------------
  if (isLaunchedResult(result)) {
    return <LaunchedCard runId={result.runId} slug={slug} />;
  }

  // ----- Stored blocked (addResult already fired) ---------------------------
  if (isStoredBlockedResult(result)) {
    return <BlockedCard existingRunId={result.existingRunId} slug={slug} addResultOnce={null} />;
  }

  // ----- Streaming skeleton -------------------------------------------------
  if (!isExecuteResult(result)) {
    if (status.type === 'running' || !result) {
      return (
        <div
          className="propose-research-card propose-research-card-skeleton my-3 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-[12px] italic text-muted-foreground"
          aria-busy
        >
          <Loader2 size={13} className="animate-spin" aria-hidden />
          <span>Preparing research swarm proposal...</span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="propose-research-card my-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] text-warning" role="alert">
          The research proposal was interrupted. Ask AlphaX to try again.
        </div>
      );
    }
  }

  // From here on, result is the execute result (blocked | unblocked).
  const executeResult = result as ProposeResearchRunToolExecuteResult;

  // ----- Blocked (server short-circuited) -----------------------------------
  if (executeResult.blocked === true) {
    return (
      <BlockedCard
        existingRunId={executeResult.existingRunId}
        slug={slug}
        addResultOnce={(payload) => addResult(payload)}
      />
    );
  }

  // ----- Stale read-only ----------------------------------------------------
  if (isStale) {
    return <StaleCard runRequest={executeResult.runRequest} />;
  }

  // ----- Editable -----------------------------------------------------------
  return (
    <EditableCard
      runRequest={executeResult.runRequest}
      slug={slug}
      addResult={addResult}
    />
  );
}

// ---------------------------------------------------------------------------
// Editable variant
// ---------------------------------------------------------------------------

function EditableCard({
  runRequest,
  slug,
  addResult,
}: {
  runRequest: ProposeResearchRunToolInput;
  slug: string;
  addResult: Props['addResult'];
}): JSX.Element {
  const editor = useRunSpecEditor({ seed: runRequest });
  const { launch, isLaunching, error } = useLaunchResearchStream(slug);
  const submittedRef = useRef(false);
  const [launchedRunId, setLaunchedRunId] = useState<number | null>(null);

  const launchError = error;
  const isDailyLimit = launchError instanceof LaunchError && launchError.code === 'daily_limit_reached';
  const isConflict = launchError instanceof LaunchError && launchError.code === 'research_run_in_progress';
  const launchDisabled = isLaunching || isDailyLimit || !editor.isValid || submittedRef.current;

  const handleLaunch = useCallback(async () => {
    if (submittedRef.current) return;
    if (!slug) return;
    submittedRef.current = true;
    try {
      const res = await launch(editor.toRunRequest());
      setLaunchedRunId(res.runId);
      addResult({ kind: 'launched', runId: res.runId });
      if (typeof window !== 'undefined') {
        window.location.assign(`/brainlifts/${slug}?tab=research-stream`);
      }
    } catch {
      // Re-open the launch path so the student can retry once they understand
      // the error. The error is surfaced in the card via `launchError`.
      submittedRef.current = false;
    }
  }, [launch, editor, addResult, slug]);

  // If the card was already launched in this session, show the terminal view.
  if (launchedRunId !== null) {
    return <LaunchedCard runId={launchedRunId} slug={slug} />;
  }

  return (
    <div className="propose-research-card my-3 rounded-lg border border-border bg-card-elevated shadow-card overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
        <Radar size={14} className="text-primary" aria-hidden />
        <span className="text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
          Research Swarm Proposal
        </span>
      </div>

      <div className="px-4 py-3.5 space-y-3">
        {/* Topic */}
        <label className="block">
          <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-1">
            Topic
          </span>
          <input
            type="text"
            value={editor.topic}
            onChange={(e) => editor.setTopic(e.target.value)}
            placeholder="What should we research?"
            maxLength={500}
            className="w-full font-serif text-[14px] text-foreground bg-background border border-border rounded-md px-3 py-1.5 placeholder:text-muted-light placeholder:italic focus:outline-none focus:border-primary/40 transition-colors"
          />
          {editor.errors.topic && (
            <span className="block mt-1 text-[11px] text-destructive">{editor.errors.topic}</span>
          )}
        </label>

        {/* Slots */}
        <div>
          <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-1.5">
            Slots
          </span>
          <div className="space-y-1.5">
            {editor.slots.map((slot, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-card border border-border rounded-md px-2 py-1.5"
              >
                <span className="font-serif text-[13px] text-muted-light w-4 text-center shrink-0 tabular-nums">
                  {idx + 1}
                </span>
                <select
                  value={slot.type ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) editor.setSlotType(idx, v as RetrievalType);
                  }}
                  data-slot-type={idx}
                  className="font-sans text-[10px] uppercase tracking-[0.15em] font-semibold text-foreground bg-background border border-border rounded px-1.5 py-1 focus:outline-none focus:border-primary/40"
                >
                  <option value="">— Any —</option>
                  {RETRIEVAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SLOT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={slot.focus ?? ''}
                  onChange={(e) => editor.setSlotFocus(idx, e.target.value)}
                  placeholder="Focus (optional)"
                  maxLength={500}
                  data-slot-focus={idx}
                  className="flex-1 min-w-0 font-serif italic text-[12px] text-foreground bg-transparent border-0 border-b border-transparent px-1 py-0.5 placeholder:text-muted-light placeholder:not-italic focus:outline-none focus:border-primary/40"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <label className="block">
          <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-1">
            Notes
          </span>
          <textarea
            value={editor.notes}
            onChange={(e) => editor.setNotes(e.target.value)}
            placeholder="Soft constraints, e.g. post-2022 only"
            rows={2}
            maxLength={2000}
            className="w-full font-serif italic text-[12px] text-foreground bg-background border border-border rounded-md px-3 py-1.5 placeholder:text-muted-light placeholder:not-italic focus:outline-none focus:border-primary/40 transition-colors resize-y"
          />
        </label>

        {/* Inline error */}
        {launchError && <InlineLaunchError error={launchError} />}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] italic text-muted-foreground">
            <Sparkles size={11} className="inline -mt-0.5 mr-1" aria-hidden />
            5 agents will run in parallel
          </span>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={launchDisabled}
            className={cn(
              'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[11px] uppercase tracking-[0.2em] font-semibold transition-colors',
              launchDisabled
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isLaunching ? (
              <>
                <Loader2 size={12} className="animate-spin" aria-hidden />
                <span>Launching</span>
              </>
            ) : isConflict ? (
              <>
                <span>Blocked</span>
              </>
            ) : isDailyLimit ? (
              <>
                <span>Limit Reached</span>
              </>
            ) : (
              <>
                <Send size={12} aria-hidden />
                <span>Launch</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocked variant (server pending-check OR stored result)
// ---------------------------------------------------------------------------

function BlockedCard({
  existingRunId,
  slug,
  addResultOnce,
}: {
  existingRunId: number;
  slug: string;
  /** Called exactly once on first render via useEffect ref-guard. `null` skips. */
  addResultOnce: ((payload: ProposeResearchRunToolResult) => void) | null;
}): JSX.Element {
  const submittedRef = useRef(false);
  useEffect(() => {
    if (!addResultOnce) return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    addResultOnce({ kind: 'blocked', existingRunId });
  }, [addResultOnce, existingRunId]);

  const href = `/brainlifts/${slug}?tab=research-stream`;
  return (
    <div className="propose-research-card propose-research-card-blocked my-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-warning mb-1">
            Swarm In Flight
          </span>
          <p className="font-serif italic text-[12px] text-foreground leading-relaxed">
            A research swarm is already running for this project
            {existingRunId > 0 ? ` (run #${existingRunId})` : ''}. I'll suggest a new run once it
            finishes.
          </p>
          <a
            href={href}
            className="inline-flex items-center gap-1 mt-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold text-primary hover:underline"
          >
            <span>Watch progress</span>
            <ExternalLink size={11} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stale variant
// ---------------------------------------------------------------------------

function StaleCard({ runRequest }: { runRequest: ProposeResearchRunToolInput }): JSX.Element {
  const topic = runRequest.topic ?? '(no topic)';
  return (
    <div
      className="propose-research-card propose-research-card-stale my-3 rounded-lg border border-border bg-card/60 px-4 py-3 opacity-70"
      aria-disabled
    >
      <div className="flex items-start gap-2.5">
        <Radar size={14} className="text-muted-foreground shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-muted-foreground mb-1">
            Earlier Proposal
          </span>
          <p className="font-serif italic text-[12px] text-muted-foreground leading-relaxed">
            Swarm proposal from earlier in conversation: {topic}.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Launched terminal variant
// ---------------------------------------------------------------------------

function LaunchedCard({ runId, slug }: { runId: number; slug: string }): JSX.Element {
  const href = `/brainlifts/${slug}?tab=research-stream`;
  return (
    <div className="propose-research-card propose-research-card-launched my-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Sparkles size={14} className="text-success shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-success mb-1">
            Swarm Launched
          </span>
          <p className="font-serif italic text-[12px] text-foreground leading-relaxed">
            Launched as run #{runId}. Five agents are deploying now.
          </p>
          <a
            href={href}
            className="inline-flex items-center gap-1 mt-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold text-primary hover:underline"
          >
            <span>Watch progress</span>
            <ExternalLink size={11} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline error pill
// ---------------------------------------------------------------------------

function InlineLaunchError({ error }: { error: LaunchError | Error }): JSX.Element {
  const isLaunch = error instanceof LaunchError;
  if (isLaunch && error.code === 'research_run_in_progress') {
    const existingRunId = error.details?.existingRunId;
    return (
      <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
        <AlertCircle size={12} className="text-warning shrink-0 mt-0.5" aria-hidden />
        <p className="font-serif italic text-[11px] text-foreground leading-relaxed">
          A swarm is already running for this project
          {typeof existingRunId === 'number' ? ` (#${existingRunId})` : ''}. Wait for it to finish.
        </p>
      </div>
    );
  }
  if (isLaunch && error.code === 'daily_limit_reached') {
    const limit = error.details?.limit;
    const used = error.details?.used;
    return (
      <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
        <AlertCircle size={12} className="text-warning shrink-0 mt-0.5" aria-hidden />
        <p className="font-serif italic text-[11px] text-foreground leading-relaxed">
          Daily limit reached
          {typeof limit === 'number' && typeof used === 'number' ? ` (${used}/${limit})` : ''}.
          Resets at midnight UTC.
        </p>
      </div>
    );
  }
  if (isLaunch && error.code === 'invalid_run_request') {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2">
        <AlertCircle size={12} className="text-destructive shrink-0 mt-0.5" aria-hidden />
        <p className="font-serif italic text-[11px] text-foreground leading-relaxed">{error.message}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2">
      <AlertCircle size={12} className="text-destructive shrink-0 mt-0.5" aria-hidden />
      <p className="font-serif italic text-[11px] text-foreground leading-relaxed">
        {error.message || 'Launch failed. Try again.'}
      </p>
    </div>
  );
}
