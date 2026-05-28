/**
 * Screen2: "How DOK1s Are Graded"
 *
 * Spec 03 body content. Composition (post polish-fix round):
 *  - LEFT column: 2x2 workflow grid (icon + bold title + body, no arrows) →
 *    rule callout (Shield medallion, italic serif) → 2x2 evidence-mode grid
 *    (icon LEFT in circle badge, title + body RIGHT, left-aligned) →
 *    full-width unreachable-reasons strip (info icon LEFT, header + bullets
 *    in a horizontal flex row).
 *  - RIGHT column: 5-point scale stack (rounded-square ScoreBadge atoms,
 *    grid-auto-rows: 1fr) + NON-GRADEABLE off-scale card below.
 *  - Closer line spans full width above the shell footer.
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/03-dok1-screens/spec.md
 */

import type React from 'react';
import { Ban, FileText, Globe, Info, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ExplainerScreen } from '../ExplainerScreen';
import { ScoreBadge } from '../atoms/ScoreBadge';
import type { RubricScore } from '../types';
import stepChecksIllustration from './illustrations/screen2-step1-checks.webp';
import stepSearchesIllustration from './illustrations/screen2-step2-searches.webp';
import stepNoEvidenceIllustration from './illustrations/screen2-step3-no-evidence.webp';
import stepScoresIllustration from './illustrations/screen2-step4-scores.webp';
import ruleLaurelIllustration from './illustrations/rule-laurel.webp';

interface WorkflowStep {
  illustration: string;
  alt: string;
  title: string;
  body: string;
}

const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  {
    illustration: stepChecksIllustration,
    alt: 'Hand with magnifying glass inspecting a line of text in an open book',
    title: 'Checks your source first',
    body: 'The grader first tries the source you cited, like the URL you pasted.',
  },
  {
    illustration: stepSearchesIllustration,
    alt: 'Hand holding a lantern over several open scrolls on a desk',
    title: 'Searches if needed',
    body: "If it can't open that source, it searches for another usable source and tells you it did.",
  },
  {
    illustration: stepNoEvidenceIllustration,
    alt: 'Open empty leather satchel with nothing inside',
    title: 'No evidence = no grade',
    body: 'The claim is not scored and does not count to your overall DOK1 score.',
  },
  {
    illustration: stepScoresIllustration,
    alt: 'Balance scale weighing a scroll against a wax seal, quill resting on the base',
    title: 'Then it scores the claim',
    body: 'If evidence is found, the grader applies the 1-5 scale shown here.',
  },
];

interface EvidenceMode {
  Icon: LucideIcon;
  title: string;
  body: string;
}

const EVIDENCE_MODES: readonly EvidenceMode[] = [
  {
    Icon: Globe,
    title: 'Direct source',
    body: 'Read the URL you cited. Best case.',
  },
  {
    Icon: FileText,
    title: 'Cached transcript',
    body: 'Used a saved transcript, like for a YouTube video.',
  },
  {
    Icon: Search,
    title: 'Fallback search',
    body: "Couldn't reach your URL, so the grader searched for another source. The rationale will say so.",
  },
  {
    Icon: Ban,
    title: 'None',
    body: "Nothing worked. The claim is non-gradeable and won't affect your Brainlift or DOK1 overall score.",
  },
];

const UNREACHABLE_REASONS: readonly string[] = [
  'Dead links (404)',
  'Sites that block automated access',
  "Content types the grader can't parse yet (like some videos or images)",
  'Paywalled sites',
];

interface RubricRow {
  score: RubricScore;
  label: string;
  description: string;
}

const RUBRIC_ROWS: readonly RubricRow[] = [
  { score: 5, label: 'VERIFIED', description: 'Claim is well-supported by the supplied evidence.' },
  { score: 4, label: 'MOSTLY VERIFIED', description: 'Claim is largely supported by the supplied evidence, with minor caveats.' },
  { score: 3, label: 'PARTIALLY SUPPORTED', description: 'Supplied evidence is limited, mixed, or supports only part of the claim.' },
  { score: 2, label: 'QUESTIONABLE', description: 'Claim is oversimplified, misleading, or poorly supported by the supplied evidence.' },
  { score: 1, label: 'LIKELY FALSE', description: 'Claim contradicts the supplied evidence.' },
];

const NON_GRADEABLE: RubricRow = {
  score: 0,
  label: 'NON-GRADEABLE',
  description: 'No accessible evidence available. Excluded from your DOK1 average until you fix it.',
};

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

function ScaleRow({ row }: { row: RubricRow }): JSX.Element {
  return (
    <div className="flex items-center gap-3.5">
      <ScoreBadge score={row.score} size="md" className="shrink-0" />
      <div className="min-w-0">
        <div className="font-serif font-bold text-[12px] tracking-wide text-foreground leading-tight">
          {row.label}.
        </div>
        <div className="text-[11px] text-muted-foreground leading-snug mt-[3px]">
          {row.description}
        </div>
      </div>
    </div>
  );
}

export function Screen2(): JSX.Element {
  return (
    <ExplainerScreen
      title="How DOK1s Are Graded"
      subtitle="The rubric, the inputs, the outcomes."
      panelClassName="w-[min(calc(100vw-2rem),64rem)] max-w-none max-h-[96vh] p-6"
    >
      {/* Two-column layout: workflow + evidence on the left, the tall 5-point
          scale on the right. NO hero. */}
      <div className="grid grid-cols-[1fr_290px] gap-5 items-stretch">
        {/* ============ LEFT COLUMN ============ */}
        <div className="flex flex-col gap-3.5 min-w-0">
          {/* Section: How the grader works — 2x2 grid (fix 1), each card has
              icon + bold title + body, no arrows. */}
          <section className="flex flex-col gap-2.5">
            <SectionHeader>How the grader works</SectionHeader>

            <div className="grid grid-cols-2 gap-2 [&>*]:h-full">
              {WORKFLOW_STEPS.map((step, idx) => (
                <div
                  key={step.title}
                  className="relative rounded-lg bg-card-elevated shadow-card px-3 py-2.5 flex flex-col items-center text-center gap-1.5"
                >
                  {/* Reading-order numeral: top-left corner */}
                  <span
                    className="absolute left-2 top-1.5 font-serif text-[15px] font-bold text-muted-foreground/60 leading-none tabular-nums"
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  <img
                    src={step.illustration}
                    alt={step.alt}
                    className="w-10 h-10 object-contain"
                  />
                  <div className="font-serif font-bold text-[12.5px] text-foreground leading-tight">
                    {step.title}
                  </div>
                  <p className="m-0 text-[11px] leading-snug text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Rule callout — classical epigraph: two-line italic serif text
              centered on the parchment, flanked by mirrored laurel branches.
              No background band, no medallion, no border. The leaves carry
              the weight; the text reads as a printed maxim. */}
          <aside className="flex items-center justify-center gap-0 py-1">
            <img
              src={ruleLaurelIllustration}
              alt=""
              aria-hidden="true"
              className="h-10 w-auto shrink-0 object-contain mix-blend-multiply -mr-1"
              style={{ transform: 'rotate(-105deg) skewY(8deg)' }}
            />
            <p className="m-0 font-serif italic text-[13px] text-foreground leading-relaxed text-center max-w-[34rem]">
              The grader cannot use outside knowledge to rescue a claim.
              <br />
              Your score is based only on the supplied evidence.
            </p>
            <img
              src={ruleLaurelIllustration}
              alt=""
              aria-hidden="true"
              className="h-10 w-auto shrink-0 object-contain mix-blend-multiply -ml-1"
              style={{ transform: 'scaleX(-1) rotate(-105deg) skewY(8deg)' }}
            />
          </aside>

          {/* Section: Evidence modes used in steps 1-3 — horizontal cards
              (fix 3), icon LEFT, title + body RIGHT, left-aligned. */}
          <section className="flex flex-col gap-2">
            <SectionHeader>Evidence modes used in steps 1-3</SectionHeader>

            <div className="grid grid-cols-2 gap-2 [&>*]:h-full">
              {EVIDENCE_MODES.map(({ Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-lg bg-card-elevated shadow-card px-3 py-2 flex items-center gap-2.5"
                >
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <Icon className="w-3.5 h-3.5 text-foreground" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-serif font-bold text-[12px] text-foreground leading-tight">
                      {title}
                    </div>
                    <p className="m-0 text-[10.5px] text-muted-foreground leading-snug mt-[2px]">
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Unreachable reasons — own full-width strip BELOW the evidence
                cards (fix 5). Info icon LEFT, header + horizontal bullets
                RIGHT. Parchment background, subtle border, generous padding. */}
            <div className="rounded-lg bg-warning-soft border border-border px-3.5 py-2 flex items-center gap-3">
              <span
                className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-card border border-border"
                aria-hidden="true"
              >
                <Info
                  className="w-3 h-3"
                  style={{ color: 'var(--warning-hex)' }}
                  strokeWidth={1.75}
                />
              </span>
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <div className="font-serif text-[11.5px] text-foreground leading-tight">
                  What commonly makes a source unreachable
                </div>
                <ul className="m-0 p-0 list-none flex flex-wrap gap-x-3.5 gap-y-0.5">
                  {UNREACHABLE_REASONS.map((reason) => (
                    <li
                      key={reason}
                      className="flex items-center gap-1.5 text-[10px] text-foreground leading-tight"
                    >
                      <span
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{ backgroundColor: 'var(--warning-hex)' }}
                        aria-hidden="true"
                      />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </div>

        {/* ============ RIGHT COLUMN: 5-point scale ============ */}
        <aside className="flex flex-col gap-3 min-h-0">
          <SectionHeader>The 5-point scale</SectionHeader>

          <div className="rounded-lg bg-card-elevated shadow-card p-4 flex-1 grid grid-cols-1 [grid-auto-rows:1fr] gap-3">
            {RUBRIC_ROWS.map((row) => (
              <ScaleRow key={row.score} row={row} />
            ))}
          </div>

          {/* OR divider — visually separates the 1-5 scale from the off-scale
              non-gradeable bucket. */}
          <div className="flex items-center gap-2.5" aria-hidden="true">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              Or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <ScaleRow row={NON_GRADEABLE} />
          </div>
        </aside>
      </div>

    </ExplainerScreen>
  );
}
