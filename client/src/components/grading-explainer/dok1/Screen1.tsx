/**
 * Screen1: "What is a DOK1?"
 *
 * Spec 03 body content: hero card, two-column comparison (mirrored layouts),
 * five core qualities grid, italic closer line.
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/03-dok1-screens/spec.md
 */

import { AlertTriangle, Atom, Check, Link2, Scale, Target, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ExplainerScreen } from '../ExplainerScreen';
import heroIllustration from './illustrations/screen1-hero.webp';

const EXAMPLES: readonly string[] = [
  'A fact from an article',
  'A statistic or number',
  'A direct quote',
  'A definition or technical detail',
  'A finding from a study',
];

const NOT_ITEMS: readonly string[] = [
  'Not a summary',
  'Not your own insight from the facts',
  'Not your opinion or position',
  'Not common knowledge with no source attached',
];

interface Quality {
  Icon: LucideIcon;
  label: string;
  description: string;
}

const QUALITIES: readonly Quality[] = [
  { Icon: Atom, label: 'Atomic', description: 'One fact per entry, not a paragraph or bundled summary.' },
  { Icon: Link2, label: 'Sourced', description: 'Tied to a single source the reader can open and check.' },
  { Icon: Scale, label: 'Objective', description: 'Anyone reading the same source should land on the same fact.' },
  { Icon: Target, label: 'Specific', description: 'Includes named details, metrics, or technical specifics.' },
];

const COMPARE_CARD_CLASS = 'rounded-lg bg-card-elevated shadow-card p-5 flex flex-col gap-3';
const COMPARE_HEADER_CLASS = 'flex items-center gap-2';
const COMPARE_HEADING_CLASS = 'font-serif font-bold text-[15px] leading-snug';
const COMPARE_LIST_CLASS = 'm-0 p-0 list-none flex flex-col gap-2';
const COMPARE_ITEM_CLASS = 'flex items-start gap-2 text-[14px] text-foreground leading-snug';
const COMPARE_ICON_CLASS = 'w-4 h-4 mt-[3px] shrink-0';

export function Screen1(): JSX.Element {
  return (
    <ExplainerScreen
      title="What is a DOK1?"
      subtitle="The raw material your BrainLift is built from"
    >
      {/* Hero: illustration LEFT, text RIGHT */}
      <div className="rounded-lg bg-card-elevated shadow-card p-6 flex items-center gap-6">
        <img
          src={heroIllustration}
          alt=""
          aria-hidden="true"
          className="w-24 h-24 shrink-0 object-contain"
        />
        <div className="flex flex-col gap-2 min-w-0">
          <h3 className="font-serif text-[18px] font-bold text-foreground m-0 leading-snug">
            DOK1 is the foundation of your BrainLift.
          </h3>
          <p className="m-0 text-[15px] text-foreground leading-relaxed">
            A DOK1 is a single fact, pulled from one source and traceable back to it. AI can pull these for you in seconds, but sloppy facts make everything you build on top of them sloppy too. Get them clean and the rest of your BrainLift gets sharper.
          </p>
        </div>
      </div>

      {/* Two-column comparison: layouts are intentionally mirrored. */}
      <div className="grid grid-cols-2 gap-3 items-stretch">
        {/* Left: what a DOK1 looks like */}
        <div className={COMPARE_CARD_CLASS}>
          <div className={COMPARE_HEADER_CLASS}>
            <span
              className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0"
              style={{ backgroundColor: 'var(--success-hex)' }}
              aria-hidden="true"
            >
              <Check className="w-3 h-3 text-white" strokeWidth={3.5} />
            </span>
            <span
              className={COMPARE_HEADING_CLASS}
              style={{ color: 'var(--success-hex)' }}
            >
              What a DOK1 looks like
            </span>
          </div>
          <ul className={COMPARE_LIST_CLASS}>
            {EXAMPLES.map((item) => (
              <li key={item} className={COMPARE_ITEM_CLASS}>
                <Check
                  className={COMPARE_ICON_CLASS}
                  style={{ color: 'var(--success-hex)' }}
                  strokeWidth={3}
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: what DOK1 is NOT */}
        <div className={COMPARE_CARD_CLASS}>
          <div className={COMPARE_HEADER_CLASS}>
            <AlertTriangle
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--danger-hex)' }}
              aria-hidden="true"
            />
            <span
              className={COMPARE_HEADING_CLASS}
              style={{ color: 'var(--danger-hex)' }}
            >
              What DOK1 is NOT
            </span>
          </div>
          <ul className={COMPARE_LIST_CLASS}>
            {NOT_ITEMS.map((item) => (
              <li key={item} className={COMPARE_ITEM_CLASS}>
                <X
                  className={COMPARE_ICON_CLASS}
                  style={{ color: 'var(--danger-hex)' }}
                  strokeWidth={3}
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Five Core Qualities */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" aria-hidden="true" />
          <h3 className="font-serif text-[14px] font-normal text-foreground m-0">
            The Four Core Qualities of DOK1
          </h3>
          <div className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {QUALITIES.map(({ Icon, label, description }) => (
            <div key={label} className="flex flex-col items-center text-center gap-1.5 px-1">
              <span
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10"
                aria-hidden="true"
              >
                <Icon className="w-[18px] h-[18px] text-primary" strokeWidth={1.75} />
              </span>
              <span className="font-serif font-bold text-[11px] text-foreground leading-tight">
                {label}
              </span>
              <span className="text-[10px] text-muted-foreground leading-snug">
                {description}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Closer */}
      <p className="font-serif italic text-[14px] text-center text-muted-foreground m-0 pt-1">
        Clean DOK1 facts are the foundation of every stronger BrainLift.
      </p>
    </ExplainerScreen>
  );
}
