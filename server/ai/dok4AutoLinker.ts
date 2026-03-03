/**
 * DOK4 Auto-Linker
 *
 * Links DOK4 SPOVs to DOK3 insights using two strategies:
 * 1. Explicit link references parsed from Workflowy ("Insight N" -> DOK3 by index)
 * 2. LLM semantic matching (fallback when no explicit links)
 *
 * Pattern follows dok3SourceRanker.ts: Haiku via OpenRouter, fetch-based.
 */

import { storage } from '../storage';

const MODEL = 'anthropic/claude-haiku-4.5';

// Minimum semantic relevance score to create a link
const SEMANTIC_LINK_THRESHOLD = 0.5;

interface DOK3Insight {
  id: number;
  text: string;
}

interface SemanticRanking {
  dok3Id: number;
  score: number;
}

/**
 * Auto-link DOK4 SPOVs to DOK3 insights.
 *
 * For each SPOV:
 * - If explicit refs exist and are valid: use them, first = primary
 * - If explicit refs are out of range: fall back to semantic
 * - If no explicit refs: use LLM semantic matching, highest score = primary
 *
 * Non-throwing: errors are logged and SPOVs stay pending_linking.
 */
export async function autoLinkDOK4Spovs(
  brainliftId: number,
  spovIds: number[],
  spovTexts: string[],
  dok3Insights: DOK3Insight[],
  explicitLinkRefs: (number[] | null)[],
): Promise<void> {
  if (spovIds.length === 0) return;
  if (dok3Insights.length === 0) {
    console.log(`[DOK4 AutoLinker] No DOK3 insights for brainlift ${brainliftId}, skipping auto-linking`);
    return;
  }

  console.log(`[DOK4 AutoLinker] Linking ${spovIds.length} SPOVs to ${dok3Insights.length} DOK3 insights`);

  for (let i = 0; i < spovIds.length; i++) {
    const spovId = spovIds[i];
    const spovText = spovTexts[i];
    const refs = explicitLinkRefs[i];

    try {
      await linkSingleSpov(brainliftId, spovId, spovText, dok3Insights, refs);
    } catch (err) {
      console.error(`[DOK4 AutoLinker] Failed to link SPOV ${spovId}:`, err);
      // Non-throwing: SPOV stays pending_linking
    }
  }
}

/**
 * Link a single SPOV to DOK3 insights.
 */
async function linkSingleSpov(
  brainliftId: number,
  spovId: number,
  spovText: string,
  dok3Insights: DOK3Insight[],
  explicitRefs: number[] | null,
): Promise<void> {
  let links: Array<{ dok3InsightId: number; isPrimary: boolean }> = [];

  // Strategy 1: Use explicit references if available and valid
  if (explicitRefs && explicitRefs.length > 0) {
    links = resolveExplicitLinks(explicitRefs, dok3Insights);

    // Fall back to semantic if explicit resolution produced no valid links
    if (links.length === 0) {
      console.log(`[DOK4 AutoLinker] Explicit refs for SPOV ${spovId} out of range, falling back to semantic`);
      links = await resolveSemanticLinks(spovText, dok3Insights);
    }
  } else {
    // Strategy 2: LLM semantic matching
    links = await resolveSemanticLinks(spovText, dok3Insights);
  }

  if (links.length > 0) {
    await storage.linkDOK4Spov(spovId, brainliftId, links);
    console.log(`[DOK4 AutoLinker] SPOV ${spovId}: linked to ${links.length} DOK3s, primary=${links.find(l => l.isPrimary)?.dok3InsightId}`);
  }
}

/**
 * Resolve explicit link references to DOK3 insight IDs.
 * References are 1-indexed positions in the DOK3 insights array (by insertion order).
 * First valid reference is designated primary.
 */
function resolveExplicitLinks(
  refs: number[],
  dok3Insights: DOK3Insight[],
): Array<{ dok3InsightId: number; isPrimary: boolean }> {
  const validLinks: Array<{ dok3InsightId: number; isPrimary: boolean }> = [];

  for (const ref of refs) {
    // 1-indexed: Insight 1 = dok3Insights[0]
    const index = ref - 1;
    if (index >= 0 && index < dok3Insights.length) {
      validLinks.push({
        dok3InsightId: dok3Insights[index].id,
        isPrimary: validLinks.length === 0, // First valid = primary
      });
    }
  }

  return validLinks;
}

/**
 * Use LLM to rank DOK3 insights by relevance to the SPOV text.
 * Creates links for insights above the threshold, highest score = primary.
 */
async function resolveSemanticLinks(
  spovText: string,
  dok3Insights: DOK3Insight[],
): Promise<Array<{ dok3InsightId: number; isPrimary: boolean }>> {
  try {
    const rankings = await callSemanticModel(spovText, dok3Insights);

    // Sort by score descending
    const sorted = rankings
      .filter(r => r.score >= SEMANTIC_LINK_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (sorted.length === 0) return [];

    return sorted.map((r, idx) => ({
      dok3InsightId: r.dok3Id,
      isPrimary: idx === 0, // Highest score = primary
    }));
  } catch (err) {
    console.error(`[DOK4 AutoLinker] Semantic matching failed:`, err);
    return [];
  }
}

/**
 * Call LLM to rank DOK3 insights by relevance to the SPOV.
 */
async function callSemanticModel(
  spovText: string,
  dok3Insights: DOK3Insight[],
): Promise<SemanticRanking[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const insightList = dok3Insights
    .map((ins, i) => `${i + 1}. [ID: ${ins.id}] ${ins.text}`)
    .join('\n');

  const systemPrompt = `You are linking a student's DOK4 SPOV (Spiky Point of View) to relevant DOK3 cross-source insights.

A DOK4 SPOV is a student's defensible, evidence-backed position. DOK3 insights are cross-source analytical claims the student made earlier. Your job is to identify which DOK3 insights are most relevant as supporting evidence or foundation for the SPOV.

Score each DOK3 insight from 0.01 (no relevance) to 0.99 (directly supports the SPOV's core argument).
Most insights should be below 0.5 -- be discriminating.

Respond ONLY with a JSON object: {"rankings": [{"dok3Id": <id>, "score": <number>}, ...]}`;

  const userPrompt = `DOK4 SPOV:
"${spovText}"

DOK3 INSIGHTS:
${insightList}`;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 512,
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

  // Parse JSON from response (may be wrapped in markdown code block)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]) as { rankings: SemanticRanking[] };
  return parsed.rankings || [];
}
