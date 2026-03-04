/**
 * DOK3 Auto-Linker
 *
 * Links DOK3 insights to DOK2 summaries using LLM semantic matching.
 * Enforces a multi-source constraint: ≥2 DOK2s from ≥2 unique sources.
 * When the constraint cannot be met, links best matches but flags the insight.
 *
 * Pattern follows dok4AutoLinker.ts: Haiku via OpenRouter, fetch-based.
 */

import { storage } from '../storage';

const MODEL = 'anthropic/claude-haiku-4.5';

// Minimum semantic relevance score to create a link
const SEMANTIC_LINK_THRESHOLD = 0.5;

// Multi-source constraint minimums
const MIN_DOK2_COUNT = 2;
const MIN_SOURCE_COUNT = 2;

export interface DOK2Summary {
  id: number;
  sourceName: string;
  sourceUrl: string | null;
  displayTitle: string | null;
  points: Array<{ text: string }>;
}

export interface DOK3Insight {
  id: number;
  text: string;
}

export interface LinkResult {
  insightId: number;
  dok2SummaryIds: number[];
  flagged: boolean;
}

/**
 * Auto-link DOK3 insights to DOK2 summaries.
 *
 * For each insight:
 * - Calls LLM to score relevance of each DOK2 summary
 * - Selects top DOK2s satisfying multi-source constraint
 * - If constraint can't be met: links best matches, flags the insight
 *
 * Non-throwing: errors are logged and insights stay pending_linking.
 */
export async function autoLinkDOK3Insights(
  brainliftId: number,
  insights: DOK3Insight[],
  dok2Summaries: DOK2Summary[],
): Promise<LinkResult[]> {
  if (insights.length === 0) return [];
  if (dok2Summaries.length === 0) return [];

  console.log(`[DOK3 AutoLinker] Linking ${insights.length} insights to ${dok2Summaries.length} DOK2 summaries`);

  const results: LinkResult[] = [];

  for (const insight of insights) {
    try {
      const result = await linkSingleInsight(brainliftId, insight, dok2Summaries);
      if (result) {
        results.push(result);
      }
    } catch (err) {
      console.error(`[DOK3 AutoLinker] Failed to link insight ${insight.id}:`, err);
      // Non-throwing: insight stays pending_linking
    }
  }

  return results;
}

/**
 * Link a single DOK3 insight to DOK2 summaries via LLM semantic matching.
 */
async function linkSingleInsight(
  brainliftId: number,
  insight: DOK3Insight,
  dok2Summaries: DOK2Summary[],
): Promise<LinkResult | null> {
  // Get LLM rankings
  const rankings = await callSemanticModel(insight.text, dok2Summaries);

  // Select DOK2s with multi-source constraint
  const { selected, flagged } = selectWithMultiSourceConstraint(rankings, dok2Summaries);

  if (selected.length === 0) return null;

  // Persist links
  await storage.linkDOK3Insight(insight.id, brainliftId, selected);

  // Flag if multi-source constraint was not met
  if (flagged) {
    await storage.setDOK3LinkingFlagged(insight.id, brainliftId);
  }

  console.log(`[DOK3 AutoLinker] Insight ${insight.id}: linked to ${selected.length} DOK2s, flagged=${flagged}`);

  return {
    insightId: insight.id,
    dok2SummaryIds: selected,
    flagged,
  };
}

/**
 * Call LLM to rank DOK2 summaries by relevance to the insight text.
 */
async function callSemanticModel(
  insightText: string,
  dok2Summaries: DOK2Summary[],
): Promise<{ dok2Id: number; score: number }[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const dok2List = dok2Summaries
    .map((s, i) => {
      const title = s.displayTitle || s.points[0]?.text || 'Untitled';
      const pointsText = s.points.map(p => p.text).join('; ');
      return `${i + 1}. [ID: ${s.id}] ${title} — ${pointsText}`;
    })
    .join('\n');

  const systemPrompt = `You are linking a student's DOK3 cross-source insight to relevant DOK2 summaries.

A DOK3 insight is a cross-source analytical claim that synthesizes information from multiple DOK2 summaries. DOK2 summaries are the student's interpretation of individual sources. Your job is to identify which DOK2 summaries are most relevant as evidence or foundation for the insight.

Score each DOK2 summary from 0.01 (no relevance) to 0.99 (directly supports the insight's core claim).
Most summaries should be below 0.5 -- be discriminating.

Respond ONLY with a JSON object: {"rankings": [{"dok2Id": <id>, "score": <number>}, ...]}`;

  const userPrompt = `DOK3 INSIGHT:
"${insightText}"

DOK2 SUMMARIES:
${dok2List}`;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'dok3_rankings',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            rankings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  dok2Id: { type: 'number' },
                  score: { type: 'number' },
                },
                required: ['dok2Id', 'score'],
                additionalProperties: false,
              },
            },
          },
          required: ['rankings'],
          additionalProperties: false,
        },
      },
    },
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://replit.com',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`API error: ${response.status} - ${errBody.substring(0, 200)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response content');

  const parsed = JSON.parse(content) as { rankings: { dok2Id: number; score: number }[] };
  return parsed.rankings || [];
}

/**
 * Normalize a source identifier for deduplication.
 * Prefers sourceUrl (lowercase, strip trailing slashes), falls back to sourceName (lowercase, trimmed).
 */
function normalizeSource(dok2: DOK2Summary): string {
  if (dok2.sourceUrl) {
    return dok2.sourceUrl.toLowerCase().replace(/\/+$/, '');
  }
  return dok2.sourceName.toLowerCase().trim();
}

/**
 * Select top-scoring DOK2s that satisfy the multi-source constraint.
 *
 * Strategy: greedy selection.
 * 1. Sort all rankings by score descending
 * 2. Filter to scores >= threshold (if enough exist)
 * 3. Greedily pick DOK2s ensuring ≥2 unique sources
 * 4. If constraint can't be met: pick top DOK2s anyway, set flagged=true
 */
function selectWithMultiSourceConstraint(
  rankings: { dok2Id: number; score: number }[],
  dok2Summaries: DOK2Summary[],
): { selected: number[]; flagged: boolean } {
  if (rankings.length === 0) return { selected: [], flagged: false };

  // Build DOK2 lookup
  const dok2Map = new Map(dok2Summaries.map(s => [s.id, s]));

  // Sort by score descending
  const sorted = [...rankings].sort((a, b) => b.score - a.score);

  // First try with threshold filter
  const aboveThreshold = sorted.filter(r => r.score >= SEMANTIC_LINK_THRESHOLD);

  // Use above-threshold if we have enough, otherwise use all rankings
  const candidates = aboveThreshold.length >= MIN_DOK2_COUNT ? aboveThreshold : sorted;
  const usingFallback = aboveThreshold.length < MIN_DOK2_COUNT;

  // Greedy selection: ensure multi-source constraint
  const selected: number[] = [];
  const selectedSources = new Set<string>();

  // Pass 1: greedily pick to maximize source diversity
  for (const r of candidates) {
    const dok2 = dok2Map.get(r.dok2Id);
    if (!dok2) continue;

    const source = normalizeSource(dok2);

    if (selected.length < MIN_DOK2_COUNT || !selectedSources.has(source)) {
      selected.push(r.dok2Id);
      selectedSources.add(source);
    }

    // Stop when we have enough DOK2s with enough sources
    if (selected.length >= MIN_DOK2_COUNT && selectedSources.size >= MIN_SOURCE_COUNT) {
      break;
    }
  }

  // If we still don't have enough, add remaining top scorers
  if (selected.length < MIN_DOK2_COUNT) {
    for (const r of candidates) {
      if (!selected.includes(r.dok2Id)) {
        const dok2 = dok2Map.get(r.dok2Id);
        if (!dok2) continue;
        selected.push(r.dok2Id);
        selectedSources.add(normalizeSource(dok2));
        if (selected.length >= MIN_DOK2_COUNT) break;
      }
    }
  }

  // Determine if flagged
  const flagged = usingFallback || selectedSources.size < MIN_SOURCE_COUNT;

  return { selected, flagged };
}
