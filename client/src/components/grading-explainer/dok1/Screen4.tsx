/**
 * Screen4: "After Your Fact Is Graded"
 *
 * Spec 03 body content. Composition:
 *  - NO hero block. Body starts directly with the anatomy subpanel below
 *    title/subtitle.
 *  - Anatomy subpanel: a faithful styled clone of the real DOK1 fact card
 *    (FactRow.tsx) shown at modal-friendly scale, centered, with four
 *    dot-and-line connector callouts (EVIDENCE MODE, SCORE, RATIONALE,
 *    SOURCE) anchored to the corresponding UI elements on the card.
 *    A clone (not the real FactRow) is used because:
 *      - the real component depends on TanStack Query, a real Fact row, and
 *        admin/grading handlers we don't want firing inside the explainer;
 *      - the real card hides the rationale behind an "Understand Score"
 *        expand panel; pedagogy requires it visible by default;
 *      - the real card has no visible "Evidence Mode" chip; we need one for
 *        the EVIDENCE MODE callout to land somewhere.
 *    The clone matches the real card's tokens, typography, spacing, scores
 *    treatment, and source-link hover state.
 *  - Editing-and-regrading 2x2 grid: four rule cards, equal-height, with the
 *    Hard Floor Rule visually emphasized (warm tinted header band + small-
 *    caps prefix tag).
 *  - Italic serif closer line.
 *
 * Connector lines are drawn in an SVG overlay using coordinates measured
 * from refs (anchor points on the card + callout label positions). The
 * coords recompute on resize so the lines stay attached if the container is
 * reflowed (e.g. modal width change).
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/03-dok1-screens/spec.md
 */

import * as React from 'react';
import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ExplainerScreen } from '../ExplainerScreen';
import { SectionLabel } from '../atoms/SectionLabel';
import checklistIcon from '@/assets/icons/checklist.svg';
import ruleContextIllustration from './illustrations/screen4-rule-context.webp';
import ruleHardFloorIllustration from './illustrations/screen4-rule-hardfloor.webp';
import ruleNewProblemsIllustration from './illustrations/screen4-rule-newproblems.webp';
import ruleContinuityIllustration from './illustrations/screen4-rule-continuity.webp';

// ---------------------------------------------------------------------------
// Canonical example data (verbatim from handoff — Strong (5) teen-sleep fact
// matching Screen 3's worked example for narrative continuity).
// ---------------------------------------------------------------------------

const EXAMPLE_FACT = {
  originalId: '4.2',
  fact: "Teens who use screens in the hour before bed take 22 minutes longer to fall asleep, on average, than teens who don't.",
  score: 5,
  scoreLabel: 'Verified',
  sourceUrl: 'https://www.example-research.org/teen-screen-time-sleep',
  sourceDisplay: 'example-research.org',
  rationale:
    'The cited study reports a 22-minute delay in sleep onset for the screen-using group versus the control group. The fact matches the source on cohort, metric, and magnitude. No caveats.',
};

// ---------------------------------------------------------------------------
// Callout copy.
// ---------------------------------------------------------------------------

interface CalloutCopy {
  id: 'score' | 'understand' | 'rationale' | 'source';
  title: string;
  description: string;
  /**
   * Which corner the callout sits in inside the anatomy frame. Drives static
   * positioning; the connector dots and lines are computed dynamically from
   * refs.
   */
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

// Layout invariant: callouts on the LEFT anchor to left-side card elements
// (rationale text, source link in the AI Analysis panel); callouts on the
// RIGHT anchor to right-side card elements (score circle, UNDERSTAND SCORE
// button). Keeps connector lines from crossing the card body.
const CALLOUTS: readonly CalloutCopy[] = [
  {
    id: 'rationale',
    title: 'RATIONALE',
    description:
      "The grader's explanation of why you got that specific score. If a fallback evidence mode was used, or if the fact was non-gradeable, it tells you here too.",
    corner: 'top-left',
  },
  {
    id: 'source',
    title: 'SOURCE',
    description: 'A link back to the URL you cited.',
    corner: 'bottom-left',
  },
  {
    id: 'score',
    title: 'SCORE',
    description: "The grader's score on the 1-5 scale, or 0 for non-gradeable.",
    corner: 'top-right',
  },
  {
    id: 'understand',
    title: 'UNDERSTAND SCORE',
    description:
      "Click to expand the AI's rationale and source for this fact. Closed by default to keep the list scannable.",
    corner: 'bottom-right',
  },
];

// ---------------------------------------------------------------------------
// Editing-and-regrading rule cards.
// ---------------------------------------------------------------------------

interface RuleCard {
  illustration: string;
  alt: string;
  title: string;
  body: string;
}

const RULE_CARDS: readonly RuleCard[] = [
  // Hard Floor Rule sits top-left so it reads first in normal reading order.
  // Distinguished only by position + the shield illustration — no small-caps
  // tag prefix (it desynced this row's baseline vs the other three).
  {
    illustration: ruleHardFloorIllustration,
    alt: 'An open hand, palm up, gently cradling an upright parchment scroll',
    title: "You won't be punished for fixing it",
    body: 'If the edit directly addresses the previous feedback, the new score cannot be lower than the old score. You are rewarded for fixing what the grader asked you to fix.',
  },
  {
    illustration: ruleContextIllustration,
    alt: 'An open ledger book with a finger marking a previous page',
    title: 'Context carried forward',
    body: 'The grader sees the previous score, previous feedback, the old text, and the new text.',
  },
  {
    illustration: ruleNewProblemsIllustration,
    alt: 'A balance scale tipping downward with a small newly-added stone weight',
    title: 'New problems can lower the score',
    body: 'If the edit introduces new problems not present before, the grader can score lower, but it must explicitly identify the new problem.',
  },
  {
    illustration: ruleContinuityIllustration,
    alt: 'Two parchment scrolls side by side joined by an unbroken ribbon',
    title: 'Continuity in the rationale',
    body: 'The grader references the previous feedback in its new rationale so you see continuity between gradings.',
  },
];

// ---------------------------------------------------------------------------
// Shared section header (matches Screens 2/3).
// ---------------------------------------------------------------------------

function SectionHeader({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" aria-hidden="true" />
      <h3 className="font-serif text-[14px] font-normal text-foreground m-0 whitespace-nowrap">
        {children}
      </h3>
      <div className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anatomy card — faithful clone of FactRow.tsx tuned for the explainer.
//
// Each labeled element exposes a ref via props so the parent anatomy frame
// can measure its position relative to the SVG overlay coordinate space.
// ---------------------------------------------------------------------------

interface AnatomyCardRefs {
  scoreRef: React.RefObject<HTMLDivElement>;
  understandRef: React.RefObject<HTMLButtonElement>;
  rationaleRef: React.RefObject<HTMLDivElement>;
  sourceRef: React.RefObject<HTMLAnchorElement>;
}

function AnatomyFactCard({ refs }: { refs: AnatomyCardRefs }): JSX.Element {
  const { scoreRef, understandRef, rationaleRef, sourceRef } = refs;

  return (
    <div
      data-testid="anatomy-fact-card"
      className="rounded-xl overflow-hidden shadow-card bg-card-elevated w-[540px] shrink-0"
    >
      {/* Main row: 70/30 split — fact content LEFT, AI score + UNDERSTAND
          SCORE RIGHT — mirrors FactRow.tsx layout at a tighter scale that
          fits the modal. */}
      <div className="flex">
        {/* Left: fact ID + content */}
        <div className="flex gap-3 px-4 py-4 basis-[70%] shrink-0 min-w-0">
          <span className="font-serif text-[20px] leading-none text-muted-light tracking-wide shrink-0">
            {EXAMPLE_FACT.originalId}
          </span>
          <p className="font-serif text-[13px] leading-snug text-foreground m-0 italic min-w-0">
            {EXAMPLE_FACT.fact}
          </p>
        </div>

        {/* Vertical separator */}
        <div className="w-px bg-border my-4 shrink-0" />

        {/* Right: AI score + UNDERSTAND SCORE button. The button styling
            mirrors FactRow.tsx (dashed underline, uppercase, tracked, muted)
            and is non-interactive inside the explainer — clicking it would
            normally toggle the AI Analysis panel, but here that panel is
            always visible so the click is a no-op.
            Sizing is compacted vs the real card so the right column matches
            the height of the LEFT column (which is just three lines of italic
            serif). Tight gap + smaller score chip + smaller button keeps the
            card visually balanced. */}
        <div className="px-3 py-3 flex items-start justify-center basis-[30%]">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-[0.35em]">
              AI
            </span>
            <div
              ref={scoreRef}
              className="flex items-center justify-center w-8 h-8 rounded-full font-serif text-[16px] font-normal border border-border"
              style={{ color: 'var(--success-hex)' }}
            >
              {EXAMPLE_FACT.score}
            </div>
            <span
              className="text-[7px] uppercase tracking-[0.25em]"
              style={{ color: 'var(--success-hex)' }}
            >
              {EXAMPLE_FACT.scoreLabel}
            </span>
            <button
              ref={understandRef}
              type="button"
              onClick={(e) => e.preventDefault()}
              className="mt-1 whitespace-nowrap text-[8px] text-muted-light bg-transparent p-0 cursor-pointer text-center w-fit uppercase tracking-[0.25em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
            >
              Understand score
            </button>
          </div>
        </div>
      </div>

      {/* AI Analysis panel — always visible (real card hides this behind
          UNDERSTAND SCORE; we expose it so RATIONALE + SOURCE have anchor
          points). */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <img src={checklistIcon} alt="" className="w-3 h-3 opacity-40" />
          <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
            AI Analysis
          </span>
        </div>
        <p
          ref={rationaleRef}
          className="font-serif text-[11.5px] leading-snug text-foreground m-0"
        >
          {EXAMPLE_FACT.rationale}
        </p>
        {/* Source footer — matches the stacked label/link treatment used in
            the real FactRow's expanded AI Analysis panel: small-caps SOURCE
            label on top, URL on its own line below with an ExternalLink
            glyph trailing. */}
        <div className="mt-2 pt-2 border-t border-border">
          <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
            Source
          </span>
          <a
            ref={sourceRef}
            href={EXAMPLE_FACT.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-300"
          >
            {EXAMPLE_FACT.sourceDisplay}
            <ExternalLink size={9} className="inline-block ml-1 -mt-0.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Callout label — small-caps title + one-line description, parchment card.
// ---------------------------------------------------------------------------

const Callout = forwardRef<HTMLDivElement, { title: string; description: string; align: 'left' | 'right' }>(
  ({ title, description, align }, ref) => {
    return (
      <div
        ref={ref}
        className={[
          'w-[160px] flex flex-col gap-1.5',
          align === 'left' ? 'items-start text-left' : 'items-end text-right',
        ].join(' ')}
      >
        <SectionLabel className="text-[9px] tracking-[0.32em]">{title}</SectionLabel>
        <p className="m-0 text-[10.5px] text-muted-foreground leading-snug">
          {description}
        </p>
      </div>
    );
  }
);
Callout.displayName = 'Callout';

// ---------------------------------------------------------------------------
// Anatomy frame — owns the relative-positioned coordinate space, holds the
// card + 4 callouts + SVG connector overlay.
// ---------------------------------------------------------------------------

interface Point { x: number; y: number; }
interface Connector { id: CalloutCopy['id']; dot: Point; labelEdge: Point; }

function AnatomyFrame(): JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null);

  const scoreRef = useRef<HTMLDivElement>(null);
  const understandRef = useRef<HTMLButtonElement>(null);
  const rationaleRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLAnchorElement>(null);

  const calloutRefs: Record<CalloutCopy['id'], React.RefObject<HTMLDivElement>> = {
    score: useRef<HTMLDivElement>(null),
    understand: useRef<HTMLDivElement>(null),
    rationale: useRef<HTMLDivElement>(null),
    source: useRef<HTMLDivElement>(null),
  };

  const anchorRefs: Record<CalloutCopy['id'], React.RefObject<HTMLElement>> = {
    score: scoreRef,
    understand: understandRef,
    rationale: rationaleRef,
    source: sourceRef,
  };

  const [connectors, setConnectors] = useState<readonly Connector[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    function measure(): void {
      const frame = frameRef.current;
      if (!frame) return;
      const frameRect = frame.getBoundingClientRect();

      const next: Connector[] = [];
      for (const cb of CALLOUTS) {
        const anchorEl = anchorRefs[cb.id].current;
        const calloutEl = calloutRefs[cb.id].current;
        if (!anchorEl || !calloutEl) continue;

        const anchorRect = anchorEl.getBoundingClientRect();
        const calloutRect = calloutEl.getBoundingClientRect();

        // Dot sits on the edge of the anchor nearest the callout.
        const calloutCenter = {
          x: calloutRect.left + calloutRect.width / 2 - frameRect.left,
          y: calloutRect.top + calloutRect.height / 2 - frameRect.top,
        };
        const anchorCenter = {
          x: anchorRect.left + anchorRect.width / 2 - frameRect.left,
          y: anchorRect.top + anchorRect.height / 2 - frameRect.top,
        };
        // Offset the dot a few pixels outside the anchor's edge so it doesn't
        // overlap the first/last glyph of text anchors (the rationale
        // paragraph in particular has zero left-padding, so an inset dot
        // occludes a letter).
        const DOT_OFFSET = 3;
        const dot: Point = {
          x: calloutCenter.x < anchorCenter.x
            ? anchorRect.left - frameRect.left - DOT_OFFSET
            : anchorRect.right - frameRect.left + DOT_OFFSET,
          y: anchorRect.top + anchorRect.height / 2 - frameRect.top,
        };

        // Line ends at the inner vertical edge of the callout, midway up.
        const labelEdge: Point = {
          x: calloutCenter.x < anchorCenter.x
            ? calloutRect.right - frameRect.left + 4
            : calloutRect.left - frameRect.left - 4,
          y: calloutRect.top + calloutRect.height / 2 - frameRect.top,
        };

        next.push({ id: cb.id, dot, labelEdge });
      }
      setConnectors(next);
      setSize({ w: frameRect.width, h: frameRect.height });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    // Re-measure once fonts and images settle so the dots line up after the
    // initial layout pass.
    const t = window.setTimeout(measure, 50);

    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
    // anchorRefs / calloutRefs identities are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refFor(id: CalloutCopy['id']): React.RefObject<HTMLDivElement> {
    return calloutRefs[id];
  }

  return (
    <div
      ref={frameRef}
      className="relative mx-auto w-full max-w-[920px] flex items-center justify-center gap-5 py-1"
    >
      {/* Left column of callouts */}
      <div className="flex flex-col justify-between self-stretch py-2 gap-8">
        {CALLOUTS.filter((c) => c.corner.endsWith('left')).map((c) => (
          <Callout
            key={c.id}
            ref={refFor(c.id)}
            title={c.title}
            description={c.description}
            align="right"
          />
        ))}
      </div>

      <AnatomyFactCard refs={{ scoreRef, understandRef, rationaleRef, sourceRef }} />

      {/* Right column of callouts */}
      <div className="flex flex-col justify-between self-stretch py-2 gap-8">
        {CALLOUTS.filter((c) => c.corner.endsWith('right')).map((c) => (
          <Callout
            key={c.id}
            ref={refFor(c.id)}
            title={c.title}
            description={c.description}
            align="left"
          />
        ))}
      </div>

      {/* SVG overlay — connector lines + anchor dots. pointer-events: none so
          the card's hover states and links remain interactive through it. */}
      {size.w > 0 && (
        <svg
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          {connectors.map((c) => {
            // Gently curved path: a cubic Bezier with control points pulled
            // horizontally toward each endpoint, giving the line an "ink
            // ribbon" arc rather than a stiff right-angle.
            const dx = c.labelEdge.x - c.dot.x;
            const cp1 = { x: c.dot.x + dx * 0.5, y: c.dot.y };
            const cp2 = { x: c.dot.x + dx * 0.5, y: c.labelEdge.y };
            const d = `M ${c.dot.x} ${c.dot.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${c.labelEdge.x} ${c.labelEdge.y}`;
            return (
              <g key={c.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="var(--border-muted-hex)"
                  strokeWidth={1}
                  strokeLinecap="round"
                />
                <circle
                  cx={c.dot.x}
                  cy={c.dot.y}
                  r={3}
                  fill="var(--text-secondary-hex)"
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule card (regular variant + emphasized Hard Floor variant).
// ---------------------------------------------------------------------------

function RuleCardView({ card }: { card: RuleCard }): JSX.Element {
  const { illustration, alt, title, body } = card;
  return (
    // No card container, no border, no background fill — just a flex row.
    <div className="flex items-start gap-3">
      <span
        className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/5"
        aria-hidden="true"
      >
        <img src={illustration} alt={alt} className="w-10 h-10 object-contain" />
      </span>
      <div className="min-w-0 flex flex-col gap-1 pt-0.5">
        <div className="font-serif font-bold text-[13px] text-foreground leading-tight">
          {title}
        </div>
        <p className="m-0 text-[11.5px] text-muted-foreground leading-snug">
          {body}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen4
// ---------------------------------------------------------------------------

export function Screen4(): JSX.Element {
  return (
    <ExplainerScreen
      title="After Your Fact Is Graded"
      subtitle="What you see when grading finishes, and what happens when you edit."
      panelClassName="w-[min(calc(100vw-2rem),64rem)] max-w-none max-h-[96vh] p-6"
    >
      {/* ============ Subpanel 1: anatomy of a graded fact ============ */}
      <section className="flex flex-col gap-3">
        <SectionHeader>What you see after grading</SectionHeader>
        <AnatomyFrame />
      </section>

      {/* ============ Subpanel 2: editing and regrading rules ============ */}
      <section className="flex flex-col gap-3 pt-1">
        <SectionHeader>Editing and regrading</SectionHeader>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 [grid-auto-rows:1fr]">
          {RULE_CARDS.map((card) => (
            <RuleCardView key={card.title} card={card} />
          ))}
        </div>
      </section>

      {/* Closer */}
      <p className="font-serif italic text-[13px] text-center text-muted-foreground m-0 pt-1">
        Every grade is a starting point. Edit, iterate, and your BrainLift gets stronger.
      </p>
    </ExplainerScreen>
  );
}
