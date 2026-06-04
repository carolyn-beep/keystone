import { useMemo } from 'react';
import type { TokenLevel } from '@/lib/grading-tokens';

/**
 * Resolves `[DOKX:id]` citation tokens to the cited entity using data already
 * loaded in the grading tabs. No network call: the full DOK tree (facts, DOK2
 * summaries, DOK3 insights) is already fetched by the tabs / Dashboard, so the
 * resolver is a pure function over that in-memory data.
 *
 * Unknown ids (stale / edited / deleted / not-loaded entities) resolve to
 * `null`; the renderer then falls back to inert plain text.
 */

/** Minimal fact shape needed to render a DOK1 chip. */
export interface FactRef {
  id: number;
  fact: string;
  score: number | null;
  /** Source citation/url (DOK1 only). */
  source?: string | null;
}

/** Minimal DOK2 summary shape needed to render a DOK2 chip. */
export interface DOK2SummaryRef {
  id: number;
  /** Human-readable label for the summary. */
  displayTitle?: string | null;
  category?: string | null;
  /** DOK2 uses `grade` as its score. */
  grade: number | null;
}

/** Minimal DOK3 insight shape needed to render a DOK3 chip. */
export interface DOK3InsightRef {
  id: number;
  text: string;
  score: number | null;
}

export interface ResolvedEntity {
  level: TokenLevel;
  id: number;
  /** Display text of the cited item. */
  text: string;
  score: number | null;
  /** Source url/citation; populated for DOK1 only. */
  sourceUrl?: string | null;
}

export type TokenResolver = (level: TokenLevel, id: number) => ResolvedEntity | null;

export interface TokenResolverInput {
  facts: FactRef[];
  dok2Summaries: DOK2SummaryRef[];
  dok3Insights: DOK3InsightRef[];
}

/**
 * Build the resolver as a pure function. Exported separately from the hook so
 * it can be unit-tested without React.
 */
export function buildTokenResolver(input: TokenResolverInput): TokenResolver {
  const factMap = new Map(input.facts.map(f => [f.id, f]));
  const dok2Map = new Map(input.dok2Summaries.map(s => [s.id, s]));
  const dok3Map = new Map(input.dok3Insights.map(i => [i.id, i]));

  return (level, id) => {
    if (level === 1) {
      const fact = factMap.get(id);
      if (!fact) return null;
      return { level, id, text: fact.fact, score: fact.score, sourceUrl: fact.source ?? null };
    }
    if (level === 2) {
      const summary = dok2Map.get(id);
      if (!summary) return null;
      return {
        level,
        id,
        text: summary.displayTitle || summary.category || `Summary ${id}`,
        score: summary.grade,
      };
    }
    const insight = dok3Map.get(id);
    if (!insight) return null;
    return { level, id, text: insight.text, score: insight.score };
  };
}

/** React hook wrapper: memoizes the resolver against its inputs. */
export function useTokenResolver(input: TokenResolverInput): TokenResolver {
  const { facts, dok2Summaries, dok3Insights } = input;
  return useMemo(
    () => buildTokenResolver({ facts, dok2Summaries, dok3Insights }),
    [facts, dok2Summaries, dok3Insights],
  );
}
