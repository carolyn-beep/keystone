import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import type { ParsedToken, TokenLevel } from '@/lib/grading-tokens';
import type { TokenResolver } from '@/hooks/useTokenResolver';
import { tokens, getScoreChipColors } from '@/lib/colors';

/**
 * Renders a single citation token as a small superscript reference marker, like
 * a footnote in a printed work. The grader writes self-contained prose and
 * attaches `[DOKX:id]` after the clause it supports; this renders that token as
 * a clickable numeral whose color encodes the DOK level (DOK1 steel blue, DOK2
 * olive, DOK3 amber) and whose popover shows the cited item's text, score,
 * (DOK1) source, and a "go to item" deep-link.
 *
 * The per-rationale sequence number is assigned by the parent RationaleText so
 * the same item cited twice shares one number. An unresolvable token renders as
 * inert plain text so stale/edited/deleted entities never produce a broken
 * marker.
 */

const LEVEL_LABEL: Record<TokenLevel, string> = { 1: 'DOK1', 2: 'DOK2', 3: 'DOK3' };

/** Per-level ink tone: distinct, desaturated, printed-feeling. */
const LEVEL_INK: Record<TokenLevel, { ink: string; soft: string }> = {
  1: { ink: tokens.info, soft: tokens.infoSoft },
  2: { ink: tokens.success, soft: tokens.successSoft },
  3: { ink: tokens.warning, soft: tokens.warningSoft },
};

export interface CitationChipProps {
  token: ParsedToken;
  resolve: TokenResolver;
  /** Deep-link to the cited item's tab (scroll + highlight). */
  onNavigate: (level: TokenLevel, id: number) => void;
  /** Per-rationale footnote number shown in the marker. */
  index: number;
}

export function CitationChip({ token, resolve, onNavigate, index }: CitationChipProps) {
  const [open, setOpen] = useState(false);
  const entity = resolve(token.level, token.id);

  // Unresolvable (e.g. the cited item was deleted/re-extracted after this grade
  // ran) -> omit the marker entirely. The grader writes self-contained prose, so
  // the sentence still reads correctly without it; never show the raw token.
  if (!entity) {
    return null;
  }

  const label = LEVEL_LABEL[token.level];
  const { ink, soft } = LEVEL_INK[token.level];
  const scoreColors = entity.score !== null ? getScoreChipColors(entity.score) : null;
  const ariaLabel = `${label} citation ${index}: ${entity.text}`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          onMouseEnter={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          className="align-super ml-[1px] inline-block rounded-[3px] px-[2px] font-sans text-[0.66em] font-bold leading-none tabular-nums cursor-pointer transition-colors hover:bg-[var(--cite-soft)] focus:outline-none focus-visible:ring-1 focus-visible:ring-current"
          style={{ color: ink, ['--cite-soft' as string]: soft }}
        >
          {index}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          collisionPadding={12}
          onMouseLeave={() => setOpen(false)}
          className="z-50 w-[clamp(15rem,90vw,20rem)] rounded-xl bg-card-elevated p-5 shadow-card text-foreground"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <span
              className="font-sans text-[10px] uppercase tracking-[0.28em] font-bold"
              style={{ color: ink }}
            >
              {label} <span className="text-muted-light">&middot; {index}</span>
            </span>
            {scoreColors && (
              <span
                className="rounded px-1.5 py-[2px] text-[10px] uppercase tracking-[0.15em] font-semibold tabular-nums"
                style={{ backgroundColor: scoreColors.bg, color: scoreColors.text }}
              >
                {entity.score}/5
              </span>
            )}
          </div>
          <p className="font-serif text-[13.5px] italic leading-[1.65] text-foreground m-0">
            {entity.text}
          </p>
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNavigate(token.level, token.id);
              }}
              className="inline-flex items-center gap-1 font-sans text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Go to item <ArrowUpRight size={12} />
            </button>
            {entity.sourceUrl && (
              <a
                href={entity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-sans text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink size={12} /> Source
              </a>
            )}
          </div>
          <Popover.Arrow className="fill-[hsl(40_30%_98%)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
