import { Fragment } from 'react';
import { segmentText, type TokenLevel } from '@/lib/grading-tokens';
import type { TokenResolver } from '@/hooks/useTokenResolver';
import { CitationChip } from './CitationChip';

/**
 * Renders rationale text with `[DOKX:id]` citation tokens turned into small
 * superscript reference markers. Pure with respect to its props (no data
 * fetching): it segments the given text and renders text runs as text, token
 * runs as <CitationChip>.
 *
 * Assigns each cited item a footnote number in order of first appearance,
 * shared across repeat citations of the same item, and skips unresolvable
 * tokens (which render as inert plain text) so numbering never shows gaps.
 *
 * Applies to whichever text is currently shown (rewritten OR raw), since the
 * raw view may also contain tokens.
 */
export interface RationaleTextProps {
  text: string | null | undefined;
  resolve: TokenResolver;
  onNavigate: (level: TokenLevel, id: number) => void;
  className?: string;
}

export function RationaleText({ text, resolve, onNavigate, className }: RationaleTextProps) {
  const segments = segmentText(text ?? '');
  const numbering = new Map<string, number>();
  let nextNumber = 1;

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <Fragment key={i}>{seg.value}</Fragment>;
        }
        const { level, id } = seg.token;
        // Unresolvable tokens render inert and consume no footnote number.
        if (!resolve(level, id)) {
          return (
            <CitationChip
              key={i}
              token={seg.token}
              resolve={resolve}
              onNavigate={onNavigate}
              index={0}
            />
          );
        }
        const key = `${level}:${id}`;
        let number = numbering.get(key);
        if (number === undefined) {
          number = nextNumber++;
          numbering.set(key, number);
        }
        return (
          <CitationChip
            key={i}
            token={seg.token}
            resolve={resolve}
            onNavigate={onNavigate}
            index={number}
          />
        );
      })}
    </span>
  );
}
