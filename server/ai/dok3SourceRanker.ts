/**
 * DOK3 Source Relevance Ranker
 *
 * Batch-ranks how relevant each source is to each DOK3 insight.
 * Used during import to pre-sort sources in the linking UI.
 *
 * Each DOK3 insight is a cross-source analytical claim that synthesizes
 * multiple sources. The ranker helps the user decide which sources to
 * link by estimating which sources are most likely to contain supporting
 * evidence for a given insight.
 *
 * Pattern: One LLM call per insight (parallelized with p-limit).
 * Model: Haiku 4.5 via OpenRouter.
 */

import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { storage } from '../storage';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-haiku-4.5';

interface InsightInput {
  id: number;
  text: string;
}

interface SourceInput {
  sourceName: string;
  /** DOK2 displayTitles under this source — the actual analytical summaries the owner wrote */
  dok2Titles: string[];
}

async function callModel(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 512,
  };

  console.log(`[DOK3 Ranker] API request to ${MODEL}, prompt length: ${systemPrompt.length + userPrompt.length} chars`);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://replit.com',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`[DOK3 Ranker] API error ${response.status}: ${errBody.substring(0, 500)}`);
    if (response.status === 429) throw new Error(`RATE_LIMIT: ${MODEL}`);
    throw new Error(`API error: ${response.status} - ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.error('[DOK3 Ranker] No content in response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No response content');
  }
  return content as string;
}

const SYSTEM_PROMPT = `You are a research assistant helping a knowledge worker link analytical insights to their source materials.

Context: The user has built a "BrainLift" — a structured knowledge base from multiple sources. They wrote DOK2 summaries (interpretive analyses of individual sources) and DOK3 insights (cross-source analytical claims that synthesize ideas across multiple sources).

Your task: Given one DOK3 insight and a list of sources (each with their DOK2 summary titles showing what topics that source covers), rate how likely each source contains evidence relevant to the insight.

Rules:
- Score from 0.01 (no topical overlap) to 0.99 (directly addresses the insight's core claim)
- A source is relevant if its DOK2 summaries suggest it covers topics, evidence, or arguments that would support, challenge, or contextualize the insight
- Most sources should NOT be highly relevant — be discriminating. A typical distribution: 1-3 sources above 0.7, the rest below 0.4

Respond with ONLY a JSON object mapping each source number to its score. Example: {"1": 0.82, "2": 0.15, "3": 0.67}`;

function buildUserPrompt(
  insightText: string,
  sources: SourceInput[],
): string {
  const sourceBlocks = sources
    .map((s, i) => {
      const titles = s.dok2Titles.length > 0
        ? s.dok2Titles.map(t => `  - ${t}`).join('\n')
        : '  (no summaries)';
      return `Source ${i + 1}: ${s.sourceName}\n${titles}`;
    })
    .join('\n\n');

  return `DOK3 INSIGHT:
"${insightText}"

SOURCES AND THEIR DOK2 SUMMARIES:

${sourceBlocks}`;
}

function parseRankings(
  raw: string,
  sources: SourceInput[],
  insightId: number,
): Record<string, number> {
  console.log(`[DOK3 Ranker] [Insight ${insightId}] Raw LLM response: ${raw}`);

  // Extract JSON from potential markdown wrapping
  let jsonStr = raw.trim();
  const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    console.log(`[DOK3 Ranker] [Insight ${insightId}] Stripped markdown wrapping`);
    jsonStr = match[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    console.log(`[DOK3 Ranker] [Insight ${insightId}] Parsed JSON keys: ${Object.keys(parsed).join(', ')}`);
    console.log(`[DOK3 Ranker] [Insight ${insightId}] Parsed JSON values: ${JSON.stringify(parsed)}`);

    const result: Record<string, number> = {};

    for (let i = 0; i < sources.length; i++) {
      const key = sources[i].sourceName;
      // Try numbered key (what we asked for): "1", "2", etc.
      const val = parsed[String(i + 1)] ?? parsed[`Source ${i + 1}`];
      if (typeof val === 'number' && val >= 0 && val <= 1) {
        result[key] = Math.round(val * 100) / 100;
        console.log(`[DOK3 Ranker] [Insight ${insightId}] Source ${i + 1} "${key}" → ${result[key]} (matched by number)`);
      } else {
        // Fallback: try matching by source name directly
        const found = Object.entries(parsed).find(
          ([k]) => k.toLowerCase().includes(key.toLowerCase().substring(0, 20))
        );
        if (found && typeof found[1] === 'number') {
          result[key] = Math.round((found[1] as number) * 100) / 100;
          console.log(`[DOK3 Ranker] [Insight ${insightId}] Source ${i + 1} "${key}" → ${result[key]} (matched by name fallback, LLM key: "${found[0]}")`);
        } else {
          result[key] = 0.5;
          console.warn(`[DOK3 Ranker] [Insight ${insightId}] Source ${i + 1} "${key}" → 0.5 (DEFAULT — no match found! Tried key "${i + 1}" and name "${key.substring(0, 20)}")`);
        }
      }
    }

    return result;
  } catch (parseErr: any) {
    console.error(`[DOK3 Ranker] [Insight ${insightId}] JSON parse failed: ${parseErr.message}`);
    console.error(`[DOK3 Ranker] [Insight ${insightId}] Attempted to parse: ${jsonStr.substring(0, 500)}`);
    const result: Record<string, number> = {};
    for (const source of sources) {
      result[source.sourceName] = 0.5;
    }
    return result;
  }
}

async function rankSingleInsight(
  insight: InsightInput,
  sources: SourceInput[],
): Promise<Record<string, number>> {
  const userPrompt = buildUserPrompt(insight.text, sources);

  console.log(`[DOK3 Ranker] ─── Insight ${insight.id} ───`);
  console.log(`[DOK3 Ranker] [Insight ${insight.id}] Text: "${insight.text.substring(0, 120)}${insight.text.length > 120 ? '...' : ''}"`);
  console.log(`[DOK3 Ranker] [Insight ${insight.id}] Full user prompt:\n${userPrompt}`);

  const call = async () => {
    const raw = await callModel(SYSTEM_PROMPT, userPrompt);
    return parseRankings(raw, sources, insight.id);
  };

  return pRetry(call, {
    retries: 2,
    onFailedAttempt: (err) => {
      console.warn(`[DOK3 Ranker] Attempt ${err.attemptNumber} failed for insight ${insight.id}: ${err.error.message}`);
    },
  });
}

/**
 * Rank all sources for each insight in parallel.
 * Saves rankings to DB after all calls complete.
 */
export async function rankSourcesForInsights(
  insights: InsightInput[],
  sources: SourceInput[],
): Promise<Map<number, Record<string, number>>> {
  if (insights.length === 0 || sources.length === 0) {
    return new Map();
  }

  // Deduplicate sources by name
  const uniqueSources = Array.from(
    new Map(sources.map(s => [s.sourceName.toLowerCase().trim(), s])).values()
  );

  if (uniqueSources.length < 2) {
    console.log('[DOK3 Ranker] Fewer than 2 unique sources, skipping ranking');
    return new Map();
  }

  console.log(`[DOK3 Ranker] ═══════════════════════════════════════════════════`);
  console.log(`[DOK3 Ranker] Starting ranking: ${uniqueSources.length} sources, ${insights.length} insights, model: ${MODEL}`);
  console.log(`[DOK3 Ranker] Sources:`);
  for (let i = 0; i < uniqueSources.length; i++) {
    const s = uniqueSources[i];
    console.log(`[DOK3 Ranker]   Source ${i + 1}: "${s.sourceName}" (${s.dok2Titles.length} DOK2 titles)`);
    for (const t of s.dok2Titles) {
      console.log(`[DOK3 Ranker]     - ${t}`);
    }
  }
  console.log(`[DOK3 Ranker] ═══════════════════════════════════════════════════`);

  const limit = pLimit(10);
  const results = new Map<number, Record<string, number>>();

  await Promise.all(
    insights.map(insight =>
      limit(async () => {
        try {
          const rankings = await rankSingleInsight(insight, uniqueSources);
          results.set(insight.id, rankings);

          console.log(`[DOK3 Ranker] [Insight ${insight.id}] Final rankings: ${JSON.stringify(rankings)}`);

          // Save to DB immediately
          await storage.updateDOK3SourceRankings(insight.id, rankings);
        } catch (err: any) {
          console.error(`[DOK3 Ranker] [Insight ${insight.id}] FAILED entirely: ${err.message}`);
          // Use uniform defaults
          const defaults: Record<string, number> = {};
          for (const s of uniqueSources) defaults[s.sourceName] = 0.5;
          results.set(insight.id, defaults);
          await storage.updateDOK3SourceRankings(insight.id, defaults);
        }
      })
    )
  );

  console.log(`[DOK3 Ranker] ═══════════════════════════════════════════════════`);
  console.log(`[DOK3 Ranker] Completed: ${results.size}/${insights.length} insights ranked`);
  console.log(`[DOK3 Ranker] ═══════════════════════════════════════════════════`);
  return results;
}
