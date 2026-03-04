/**
 * DOK4 Insight Relevance Ranker
 *
 * Batch-ranks how relevant each DOK3 insight is to each DOK4 SPOV.
 * Used during manual-mode import to pre-sort insights in the DOK4 linking UI.
 *
 * Each DOK4 SPOV is a defensible position that builds on DOK3 insights.
 * The ranker helps the user decide which insights to link by estimating
 * which insights most strongly support each SPOV.
 *
 * Pattern: One LLM call per SPOV (parallelized with p-limit).
 * Model: Haiku 4.5 via OpenRouter.
 */

import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { storage } from '../storage';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'anthropic/claude-haiku-4.5';

interface SpovInput {
  id: number;
  text: string;
}

interface InsightInput {
  id: number;
  text: string;
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
  };

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
    if (response.status === 429) throw new Error(`RATE_LIMIT: ${MODEL}`);
    throw new Error(`API error: ${response.status} - ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response content');
  return content as string;
}

const SYSTEM_PROMPT = `You are a research assistant helping a student link their DOK4 SPOVs (Spiky Points of View) to supporting DOK3 insights.

Context: The student has built a "BrainLift" — a structured knowledge base from multiple sources. They wrote DOK3 insights (cross-source analytical claims that synthesize ideas from multiple sources) and DOK4 SPOVs (original, defensible intellectual positions that build on those insights).

Your task: Given one DOK4 SPOV and a list of DOK3 insights, rate how strongly each insight supports or provides foundation for the SPOV.

Rules:
- Score from 0.01 (no connection) to 0.99 (directly underpins the SPOV's core argument)
- An insight is relevant if it provides evidence, reasoning, or analytical foundation that the SPOV builds upon
- Most insights should NOT be highly relevant — be discriminating. A typical distribution: 1-3 insights above 0.7, the rest below 0.4

Respond with ONLY a JSON object mapping each insight number to its score. Example: {"1": 0.82, "2": 0.15, "3": 0.67}`;

function buildUserPrompt(
  spovText: string,
  insights: InsightInput[],
): string {
  const insightBlocks = insights
    .map((ins, i) => `Insight ${i + 1}: ${ins.text}`)
    .join('\n\n');

  return `DOK4 SPOV:
"${spovText}"

DOK3 INSIGHTS:

${insightBlocks}`;
}

function parseRankings(
  raw: string,
  insights: InsightInput[],
  spovId: number,
): Record<string, number> {
  // Extract JSON from potential markdown wrapping
  let jsonStr = raw.trim();
  const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) jsonStr = match[1].trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, number>;

    // Convert numbered keys to insight IDs
    const rankings: Record<string, number> = {};
    for (const [key, score] of Object.entries(parsed)) {
      const idx = parseInt(key) - 1;
      if (idx >= 0 && idx < insights.length && typeof score === 'number') {
        const insightId = insights[idx].id;
        rankings[String(insightId)] = Math.max(0.01, Math.min(0.99, score));
      }
    }
    return rankings;
  } catch (err) {
    console.error(`[DOK4 Ranker] [SPOV ${spovId}] Failed to parse rankings: ${raw.substring(0, 200)}`);
    return {};
  }
}

/**
 * Rank DOK3 insights by relevance to each DOK4 SPOV and persist to DB.
 * Called during manual-mode import after DOK4 SPOVs are saved.
 */
export async function rankInsightsForSpovs(
  spovs: SpovInput[],
  insights: InsightInput[],
): Promise<void> {
  if (spovs.length === 0 || insights.length === 0) return;

  console.log(`[DOK4 Ranker] Ranking ${insights.length} insights for ${spovs.length} SPOVs`);

  const limit = pLimit(5);

  await Promise.all(spovs.map(spov => limit(async () => {
    try {
      const userPrompt = buildUserPrompt(spov.text, insights);
      const raw = await pRetry(
        () => callModel(SYSTEM_PROMPT, userPrompt),
        { retries: 2, minTimeout: 1000 }
      );
      const rankings = parseRankings(raw, insights, spov.id);

      if (Object.keys(rankings).length > 0) {
        await storage.setDOK4InsightRankings(spov.id, rankings);
        console.log(`[DOK4 Ranker] SPOV ${spov.id}: ranked ${Object.keys(rankings).length} insights`);
      }
    } catch (err) {
      console.error(`[DOK4 Ranker] Failed for SPOV ${spov.id}:`, err);
      // Non-blocking — SPOV will show insights in default order
    }
  })));
}
