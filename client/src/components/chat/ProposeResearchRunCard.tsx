import React, { useEffect, useMemo, useRef } from 'react';
import { useMessage, useThread, type ToolCallMessagePartProps } from '@assistant-ui/react';
import { AlertCircle, ExternalLink, Loader2, Radar, Rocket } from 'lucide-react';
import { useConversationBrainlift } from '@/hooks/useConversationBrainlift';
import {
  buildResearchStreamConfigureUrl,
  stashResearchStreamProposal,
} from '@/components/research-stream/proposal-handoff';
import { RETRIEVAL_TYPE_META, PREVIEW_SLOTS } from '@/components/research-stream/retrieval-meta';
import type { RetrievalType, RunRequest } from '@shared/research-stream';
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

function readConversationIdFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('c');
  return raw && /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : null;
}

function isStoredBlockedResult(
  result: CombinedResult | undefined,
): result is { kind: 'blocked'; existingRunId: number } {
  return Boolean(result && typeof result === 'object' && 'kind' in result && result.kind === 'blocked');
}

function isExecuteResult(result: CombinedResult | undefined): result is ProposeResearchRunToolExecuteResult {
  return Boolean(result && typeof result === 'object' && 'blocked' in result);
}

/** Catch any message history that still carries the legacy launched payload
 *  from before the handoff pivot. Render those as historical proposals rather
 *  than crashing trying to read a non-existent runRequest. */
function isLegacyKindResult(result: CombinedResult | undefined): boolean {
  return Boolean(result && typeof result === 'object' && 'kind' in result && (result as { kind: string }).kind !== 'blocked');
}

function buildResearchStreamTabUrl(slug: string): string {
  return `/grading/${slug}?tab=research-stream`;
}

/**
 * Tool UI for `propose_research_run`. The card is a non-editable preview of
 * the agent's proposal. The student reviews and launches in the Research
 * Stream's Customize panel, not here. Clicking the CTA stashes the proposal
 * to sessionStorage and navigates to the panel pre-filled.
 *
 * Lifecycle states:
 *   - streaming  → skeleton while tool args + result are arriving.
 *   - blocked    → "a swarm is already running" with Watch progress link.
 *                  Calls `addResult({ kind: 'blocked', existingRunId })` once.
 *   - preview    → read-only proposal summary; CTA hands off to Customize.
 *   - stale      → frozen read-only when a newer message lands in the thread.
 */
export function ProposeResearchRunCard(props: Props): JSX.Element {
  const { result, status, addResult } = props;

  // Stale detection mirrors AskUserQuestionCard.tsx. `optional: true` keeps
  // both hooks safe in tests that mount without a runtime provider.
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

  const conversationId = readConversationIdFromUrl();
  const conversationBrainlift = useConversationBrainlift(conversationId ?? 0);
  const slug = conversationBrainlift.data?.brainlift?.slug ?? '';

  // ----- Stored blocked (addResult already fired previously) ----------------
  if (isStoredBlockedResult(result)) {
    return <BlockedCard existingRunId={result.existingRunId} slug={slug} addResultOnce={null} />;
  }

  // ----- Legacy launched payload from pre-handoff message history -----------
  // The card no longer launches, but old conversations may carry these. Treat
  // them as historical (same visual as stale) so we don't crash.
  if (isLegacyKindResult(result)) {
    return <StaleCard topic={null} />;
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
    return <StaleCard topic={executeResult.runRequest.topic ?? null} />;
  }

  // ----- Preview (the default interactive state) ----------------------------
  return <PreviewCard runRequest={executeResult.runRequest} slug={slug} />;
}

// ---------------------------------------------------------------------------
// Preview variant — non-editable horizontal summary + CTA that hands off to
// the Customize screen. Layout: topic + stats top row, optional notes pill,
// agent-type chips row, dark Review & Launch button.
// ---------------------------------------------------------------------------

function PreviewCard({
  runRequest,
  slug,
}: {
  runRequest: ProposeResearchRunToolInput;
  slug: string;
}): JSX.Element {
  const ctaDisabled = !slug;

  // Resolve the 5-slot preview. Use the agent's pinned types when given;
  // otherwise fall back to preferredTypes; otherwise the Mixed preview.
  const slotTypes: Array<RetrievalType | undefined> = useMemo(() => {
    const fromOverrides = (runRequest.slotOverrides ?? [])
      .map((s) => s.type)
      .filter((t): t is RetrievalType => Boolean(t));
    const fromPreferred = runRequest.preferredTypes ?? [];
    const seq = fromOverrides.length > 0 ? fromOverrides : fromPreferred;
    if (seq.length === 0) return PREVIEW_SLOTS.map((s) => s.type);
    return Array.from({ length: 5 }, (_, i) => seq[i] ?? undefined);
  }, [runRequest]);

  const topic = runRequest.topic?.trim();
  const notes = runRequest.notes?.trim();

  const handleHandoff = () => {
    if (!slug) return;
    if (typeof window !== 'undefined') {
      stashResearchStreamProposal(slug, runRequest as RunRequest);
      window.location.assign(buildResearchStreamConfigureUrl(slug));
    }
  };

  return (
    <div className="propose-research-card my-3 rounded-xl border border-border bg-card-elevated shadow-card overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-card">
        <Radar size={13} className="text-primary" aria-hidden />
        <span className="text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
          Research Swarm Proposal
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Topic — full-width */}
        <div>
          <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-1.5">
            Topic
          </span>
          {topic ? (
            <p className="font-serif text-[16px] text-foreground leading-snug">
              {topic}
            </p>
          ) : (
            <p className="font-serif italic text-[14px] text-muted-light leading-snug">
              Auto-orchestrated from project context
            </p>
          )}
        </div>

        {/* Guidance (optional) — pill with inline label */}
        {notes && (
          <div className="rounded-md border border-success/20 bg-success-soft/40 px-3.5 py-2.5">
            <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-success mb-1">
              Guidance
            </span>
            <p className="font-serif italic text-[12.5px] text-foreground leading-relaxed">
              {notes}
            </p>
          </div>
        )}

        {/* Agent types — full-width row, equal columns */}
        <div>
          <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-2">
            Agent Types
          </span>
          <div className="grid grid-cols-5 gap-2">
            {slotTypes.map((type, idx) => (
              <TypePill key={idx} type={type} />
            ))}
          </div>
        </div>

        {/* CTA — flat dark button, full width. Rocket rumbles on hover. */}
        <button
          type="button"
          onClick={handleHandoff}
          disabled={ctaDisabled}
          className={cn(
            'group w-full flex items-center justify-center gap-2 px-5 py-3 rounded-md text-[13px] font-semibold transition-colors',
            ctaDisabled
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-foreground text-background hover:bg-foreground/90',
          )}
        >
          <Rocket
            size={14}
            aria-hidden
            className={cn(!ctaDisabled && 'group-hover:animate-rocket-rumble')}
          />
          <span>Review &amp; Launch</span>
        </button>

        {/* Helper */}
        <p className="text-center font-serif italic text-[11.5px] text-muted-light leading-relaxed -mt-2">
          Opens the Customize screen pre-filled with this proposal.
        </p>
      </div>
    </div>
  );
}

function TypePill({ type }: { type: RetrievalType | undefined }) {
  if (!type) {
    return (
      <span className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-card px-2 py-2 text-[11px] font-medium text-muted-light">
        <span className="w-[11px] h-[11px] rounded-full border border-dashed border-muted-light shrink-0" aria-hidden />
        <span className="truncate">Any</span>
      </span>
    );
  }
  const meta = RETRIEVAL_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span
      className="flex items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-[11px] font-medium"
      style={{ backgroundColor: meta.bg, color: meta.ink }}
    >
      <Icon size={12} aria-hidden className="shrink-0" />
      <span className="truncate">{meta.label}</span>
    </span>
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

  const href = buildResearchStreamTabUrl(slug);
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
            {existingRunId > 0 ? ` (run #${existingRunId})` : ''}. I&apos;ll suggest a new run once it
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
// Stale variant — frozen read-only when a newer message lands in the thread,
// or when the result is a legacy `launched` payload from before the pivot.
// ---------------------------------------------------------------------------

function StaleCard({ topic }: { topic: string | null }): JSX.Element {
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
            {topic
              ? `Swarm proposal from earlier in conversation: ${topic}.`
              : 'A swarm proposal from earlier in this conversation.'}
          </p>
        </div>
      </div>
    </div>
  );
}
