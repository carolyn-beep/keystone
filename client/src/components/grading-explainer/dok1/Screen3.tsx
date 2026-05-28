/**
 * Screen3: "How to Write Good DOK1 Facts"
 *
 * Spec 03 body content (post fix-handoff). Composition:
 *  - NO hero block. Body starts directly with the template card (matches
 *    Screen 2's hero-less rhythm).
 *  - Template card: a four-level hierarchy diagram showing WHERE a DOK1 fact
 *    lives in the BrainLift Knowledge Tree (Category → Source → DOK1-Facts →
 *    Fact / Fact). Renders as an indented tree with monospace text; no prose
 *    rules below it.
 *  - DO / DON'T two-column comparison, each bullet keyed to a bespoke
 *    Victorian-engraving illustration generated in a matched set.
 *  - Worked examples as a single horizontal row of 4 cards (1x4), equal
 *    heights via grid-auto-rows: 1fr.
 *  - Italic serif closer line.
 *
 * Source of truth for the DOK1 template structure: BrainLift Knowledge Tree
 * hierarchy (Category > Source > DOK1-Facts > Fact). Handoff:
 * /tmp/dok1-screen3-fix-handoff.md.
 */

import type React from 'react';
import { ExplainerScreen } from '../ExplainerScreen';
import type { RubricScore } from '../types';
import do1Illustration from './illustrations/screen3-do-1.webp';
import do2Illustration from './illustrations/screen3-do-2.webp';
import do3Illustration from './illustrations/screen3-do-3.webp';
import do4Illustration from './illustrations/screen3-do-4.webp';
import do5Illustration from './illustrations/screen3-do-5.webp';
import dont1Illustration from './illustrations/screen3-dont-1.webp';
import dont2Illustration from './illustrations/screen3-dont-2.webp';
import dont3Illustration from './illustrations/screen3-dont-3.webp';
import dont4Illustration from './illustrations/screen3-dont-4.webp';
import dont5Illustration from './illustrations/screen3-dont-5.webp';
import ruleOfThumbIllustration from './illustrations/screen3-rule-of-thumb.webp';

interface BulletRow {
  illustration: string;
  alt: string;
  text: string;
}

const DO_ITEMS: readonly BulletRow[] = [
  {
    illustration: do1Illustration,
    alt: 'Finger pointing at a labelled name on a parchment page',
    text: 'Lead with a concrete subject: a name, a finding, a study, a system, a person.',
  },
  {
    illustration: do2Illustration,
    alt: 'Brass calipers measuring a line of numbers on a printed page',
    text: 'Include specific numbers, metrics, or named details. Specifics are what make a fact verifiable.',
  },
  {
    illustration: do3Illustration,
    alt: 'A hand placed flat on an open book, anchoring the page',
    text: 'Stay close to what the source actually says.',
  },
  {
    illustration: do4Illustration,
    alt: 'A chain link tied to the corner of a parchment scroll',
    text: 'Cite a URL the grader can open. Paywalled or blocked pages can become non-gradeable.',
  },
  {
    illustration: do5Illustration,
    alt: 'A single dash bullet point on an otherwise blank parchment',
    text: 'One fact per bullet point.',
  },
];

const DONT_ITEMS: readonly BulletRow[] = [
  {
    illustration: dont1Illustration,
    alt: 'Several scrolls bundled together with twine',
    text: "Summarize the whole article. That's a DOK2.",
  },
  {
    illustration: dont2Illustration,
    alt: 'A quill pen with an empty thought-bubble above it',
    text: "Add your own opinion or take. That's a DOK3.",
  },
  {
    illustration: dont3Illustration,
    alt: 'A balance scale tipped heavily off to one side',
    text: "Overstate the source. If it says 'correlates with,' don't write 'causes.'",
  },
  {
    illustration: dont4Illustration,
    alt: 'A blank parchment with only a faint smudge and question mark',
    text: "Write so vaguely the fact could come from anywhere ('AI is changing education').",
  },
  {
    illustration: dont5Illustration,
    alt: 'Several scrolls crushed together into one tangled bundle',
    text: 'Smush multiple distinct facts into one bullet point.',
  },
];

interface WorkedExample {
  score: RubricScore;
  label: string;
  text: string;
  why: string;
}

const WORKED_EXAMPLES: readonly WorkedExample[] = [
  {
    score: 5,
    label: 'Strong',
    text: "Teens who use screens in the hour before bed take 22 minutes longer to fall asleep, on average, than teens who don't.",
    why: 'Specific group, specific metric, clear comparison group. Easy to verify against the source.',
  },
  {
    score: 3,
    label: 'Partially supported',
    text: 'Phone use before bed causes teens to lose a full hour of sleep every night.',
    why: 'The source shows screen time correlates with 20-60 minutes less sleep, not a guaranteed hour, and never claims causation. The fact overstates the source in two ways: bigger effect, stronger claim.',
  },
  {
    score: 2,
    label: 'Weak',
    text: 'Phones at night are bad for sleep.',
    why: 'Vague. No group, no metric, no link to source. Could have been written without reading anything.',
  },
  {
    score: 1,
    label: 'Likely false',
    text: 'Phone use in the dark raises adolescent melatonin levels by 40%.',
    why: 'The cited source shows nighttime light suppresses melatonin. The claim contradicts the evidence.',
  },
];

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

interface HierarchyLevel {
  depth: number;
  label: string;
  tone: 'category' | 'source' | 'group' | 'fact';
}

const HIERARCHY: readonly HierarchyLevel[] = [
  { depth: 0, label: 'Category', tone: 'category' },
  { depth: 1, label: 'Source Title - Source URL', tone: 'source' },
  { depth: 2, label: 'DOK1 - Facts', tone: 'group' },
  { depth: 3, label: 'Fact', tone: 'fact' },
  { depth: 3, label: 'Fact', tone: 'fact' },
];

function HierarchyRow({ row }: { row: HierarchyLevel }): JSX.Element {
  // The fact level is the visual hero — it's what the user is being taught to
  // produce. Other levels are scaffolding and read as muted reference.
  const isFact = row.tone === 'fact';
  return (
    <div
      className="font-mono text-[13px] leading-relaxed"
      style={{ paddingLeft: `${row.depth * 1.75}rem` }}
    >
      <span className={isFact ? 'text-foreground font-semibold' : 'text-muted-foreground'}>
        — {row.label}
      </span>
    </div>
  );
}

function ComparisonColumn({
  heading,
  toneColorVar,
  items,
}: {
  heading: string;
  toneColorVar: string;
  items: readonly BulletRow[];
}): JSX.Element {
  return (
    <div className="rounded-lg bg-card-elevated shadow-card p-4 flex flex-col gap-3 h-full">
      <div className="font-serif font-bold text-[14px] leading-snug" style={{ color: toneColorVar }}>
        {heading}
      </div>
      {/* flex-1 + justify-between makes the bullet list fill the card's
          full inner height; bullets distribute evenly so there's no
          orphaned whitespace at the bottom when the card is stretched by
          the items-stretch parent. */}
      <ul className="m-0 p-0 list-none flex flex-col flex-1 justify-between gap-2.5">
        {items.map((item) => (
          <li
            key={item.text}
            className="flex items-center gap-2.5 text-[12px] text-foreground leading-snug"
          >
            <img
              src={item.illustration}
              alt={item.alt}
              className="w-8 h-8 shrink-0 object-contain"
            />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function colorForScore(score: RubricScore): string {
  switch (score) {
    case 5: return 'var(--success-hex)';
    case 4: return 'var(--info-hex)';
    case 3: return 'var(--secondary-hex)';
    case 2: return 'var(--warning-hex)';
    case 1: return 'var(--danger-hex)';
    case 0:
    default: return 'var(--news-hex)';
  }
}

// Vertical row: a chromatic editorial numeral acts as the marginalia / verse
// number for this entry, the fact sits below in serif italic with quote
// marks so it reads as a real DOK1 exhibit, and a clearly differentiated
// "Why this score" footnote follows beneath a hairline border.
function ExampleRow({ row }: { row: WorkedExample }): JSX.Element {
  const color = colorForScore(row.score);
  const display = row.score === 0 ? '—' : row.score;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2" style={{ color }}>
        <span
          aria-label={row.score === 0 ? 'Non-gradeable' : `Score ${row.score} out of 5`}
          className="font-serif text-[26px] leading-none font-bold tabular-nums"
        >
          {display}
        </span>
        <span aria-hidden="true" className="text-[10px] tracking-[0.4em] font-light opacity-60">
          / 5
        </span>
      </div>
      <p className="m-0 font-serif italic text-[12px] text-foreground leading-snug">
        &ldquo;{row.text}&rdquo;
      </p>
      <p className="m-0 text-[10.5px] text-muted-foreground leading-snug pt-1.5 border-t border-border/60">
        <span className="font-semibold uppercase tracking-[0.18em] text-[8.5px] mr-1.5 text-muted-foreground/80">
          Why this score
        </span>
        {row.why}
      </p>
    </div>
  );
}

export function Screen3(): JSX.Element {
  return (
    <ExplainerScreen
      title="How to Write Good DOK1 Facts"
      subtitle="A template, a few rules, and side-by-side examples."
      panelClassName="w-[min(calc(100vw-2rem),64rem)] max-w-none max-h-[96vh] p-6"
    >
      {/* Two-column body, mirroring Screen 2's grid pattern: instructional
          content on the LEFT, worked-examples scale on the RIGHT. */}
      <div className="grid grid-cols-[1fr_260px] gap-4 items-stretch pb-2">
        {/* ============ LEFT COLUMN ============ */}
        <div className="flex flex-col gap-3.5 min-w-0">
          {/* Template — a hierarchy diagram showing WHERE a DOK1 fact lives
              in the BrainLift Knowledge Tree, with an integrated rule-of-thumb
              footer tag. */}
          <section className="flex flex-col gap-2.5">
            <SectionHeader>The template</SectionHeader>

            <div className="rounded-lg bg-card-elevated shadow-card p-5 flex flex-col gap-4">
              <div className="rounded-md border border-border bg-card px-5 py-4 flex flex-col gap-1">
                {HIERARCHY.map((row, idx) => (
                  <HierarchyRow key={`${idx}-${row.label}`} row={row} />
                ))}
              </div>

              {/* Rule-of-thumb footer: bespoke bullseye illustration LEFT
                  (matching the DO/DON'T item illustration treatment), label
                  + italic body stacked RIGHT. The vertical stacking
                  replaces the previous middle-dot separator. */}
              <div className="flex items-center gap-4 pt-3 border-t border-border/70">
                <img
                  src={ruleOfThumbIllustration}
                  alt=""
                  aria-hidden="true"
                  className="w-14 h-14 shrink-0 object-contain"
                />
                <div className="min-w-0 flex flex-col gap-1.5">
                  <span className="text-[13px] uppercase tracking-[0.32em] font-bold text-foreground leading-tight">
                    Rule of thumb
                  </span>
                  <span className="font-serif italic text-[14px] text-muted-foreground leading-snug">
                    Aim for roughly 8-10 DOK1 facts per source.
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* DO / DON'T — two sub-columns under the template, each bullet
              carries a bespoke illustration in place of a generic icon. The
              section uses flex-1 so it absorbs any leftover vertical space
              from the items-stretch parent grid, keeping the left and right
              columns the same overall height. */}
          <section className="flex flex-col gap-2.5 flex-1 min-h-0">
            <SectionHeader>Do this, not that</SectionHeader>

            <div className="grid grid-cols-2 gap-3 items-stretch flex-1">
              <ComparisonColumn heading="Do" toneColorVar="var(--success-hex)" items={DO_ITEMS} />
              <ComparisonColumn heading="Don't" toneColorVar="var(--danger-hex)" items={DONT_ITEMS} />
            </div>
          </section>
        </div>

        {/* ============ RIGHT COLUMN: worked examples ============
            Mirrors Screen 2's 5-point-scale aside structure: SectionHeader +
            a single shadow-card containing a vertical stack with
            grid-auto-rows: 1fr so all rows have equal height. The chromatic
            score numeral acts as marginalia / verse-number for each entry. */}
        <aside className="flex flex-col gap-3 min-h-0">
          <SectionHeader>Worked examples</SectionHeader>

          <div className="rounded-lg bg-card-elevated shadow-card p-4 flex flex-col flex-1 justify-between gap-3">
            {WORKED_EXAMPLES.map((ex) => (
              <ExampleRow key={ex.score} row={ex} />
            ))}
          </div>
        </aside>
      </div>

    </ExplainerScreen>
  );
}
