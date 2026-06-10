/**
 * Onboarding wizard suggestion generation (04-suggestion-steps FR1).
 *
 * Powers the wizard's tap-to-accept suggestion chips for four kinds:
 *   - topic        — short creativity prompt, 6-8 varied topic ideas (pre-create)
 *   - in-scope     — 5-8 phrases scoped to the topic
 *   - out-of-scope — 5-8 phrases scoped to topic + in-scope
 *   - categories   — 4-6 short category names mapping topic + both scope arrays
 *
 * Non-blocking by contract: any model error, timeout, or unparseable response
 * resolves to `[]`. These functions never reject — the wizard renders
 * input-only when suggestions are unavailable. Copy targets high-school
 * students.
 *
 * All calls go through the unified AI client (fast tier, temp 0.8, 10s
 * timeout, per-kind caller). Mirrors the parsing of
 * server/routes/purpose-suggestions.ts.
 */

import { callModel } from '../client';

export type OnboardingSuggestionKind = 'in-scope' | 'out-of-scope' | 'categories';

export interface OnboardingSuggestionContext {
  topic: string;
  inScope: string[];
  outOfScope: string[];
}

const FAST_MODEL = 'anthropic/claude-haiku-4.5';

const SYSTEM_PROMPT =
  'Return only valid JSON. No markdown, no explanation, no wrapping — just the raw JSON array of strings.';

/** Cap per kind, per the research figures. */
const CAP: Record<'topic' | OnboardingSuggestionKind, number> = {
  topic: 8,
  'in-scope': 8,
  'out-of-scope': 8,
  categories: 6,
};

const CALLER: Record<'topic' | OnboardingSuggestionKind, string> = {
  topic: 'onboarding.topicSuggestions',
  'in-scope': 'onboarding.inScopeSuggestions',
  'out-of-scope': 'onboarding.outOfScopeSuggestions',
  categories: 'onboarding.categoriesSuggestions',
};

/**
 * Render the "already shown" tail appended to a prompt so a refresh asks for
 * different items. Empty exclude → empty string (well-formed prompt with no
 * dangling bullet).
 */
function excludeBlock(exclude: string[] | undefined): string {
  if (!exclude || exclude.length === 0) return '';
  const lines = exclude.map((e) => `- ${e}`).join('\n');
  return `\n\nAlready shown (suggest different ones, do not repeat these):\n${lines}`;
}

/** Render a labelled list of items, or "(none yet)" when empty. */
function listOrNone(items: string[]): string {
  if (!items || items.length === 0) return '(none yet)';
  return items.map((i) => `- ${i}`).join('\n');
}

/**
 * Strip markdown fences and parse the model body into a clean string array.
 * Accepts a bare array or a `{ suggestions: [...] }` wrapper. Returns `[]`
 * for any unparseable / wrong-shape response (caller already wraps in
 * try/catch, but this keeps shape failures non-throwing too).
 */
function parseSuggestions(content: string, cap: number): string[] {
  const raw = content
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  const parsed: unknown = JSON.parse(raw);
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { suggestions?: unknown })?.suggestions)
      ? (parsed as { suggestions: unknown[] }).suggestions
      : null;
  if (!arr) return [];
  return arr
    .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
    .slice(0, cap);
}

/** Build the per-kind user prompt. */
function buildPrompt(
  kind: 'topic' | OnboardingSuggestionKind,
  ctx: OnboardingSuggestionContext,
  exclude?: string[],
): string {
  const tail = excludeBlock(exclude);

  switch (kind) {
    case 'topic':
      return (
        `Suggest 6-8 varied, interesting topics a high-school student might want to become an expert in. ` +
        `Mix fields: science, technology, arts, history, sports, business, culture. ` +
        `Each is a short noun phrase (2-5 words), not a sentence. Keep them concrete and student-friendly.\n\n` +
        `Return ONLY a JSON array of strings.` +
        tail
      );

    case 'in-scope':
      return (
        `A high-school student wants to become an expert in: "${ctx.topic}".\n\n` +
        `Suggest 5-8 specific sub-topics or angles that should be IN SCOPE for their learning — ` +
        `the parts of "${ctx.topic}" worth focusing on. Each is a short phrase (2-6 words), concrete and student-friendly.\n\n` +
        `Return ONLY a JSON array of strings.` +
        tail
      );

    case 'out-of-scope':
      return (
        `A high-school student is becoming an expert in: "${ctx.topic}".\n\n` +
        `In scope so far:\n${listOrNone(ctx.inScope)}\n\n` +
        `Suggest 5-8 related-but-OUT-OF-SCOPE topics — things that are easy to confuse with "${ctx.topic}" ` +
        `but that they should explicitly exclude to stay focused. Each is a short phrase (2-6 words).\n\n` +
        `Return ONLY a JSON array of strings.` +
        tail
      );

    case 'categories':
      return (
        `A high-school student is becoming an expert in: "${ctx.topic}".\n\n` +
        `In scope:\n${listOrNone(ctx.inScope)}\n\n` +
        `Out of scope:\n${listOrNone(ctx.outOfScope)}\n\n` +
        `Suggest 4-6 short category names that map out the territory — the buckets they'll organise their ` +
        `research into. Each is a short title (1-3 words), like chapter headings.\n\n` +
        `Return ONLY a JSON array of strings.` +
        tail
      );
  }
}

/** Run one suggestion call. Resolves `[]` on any failure — never rejects. */
async function generate(
  kind: 'topic' | OnboardingSuggestionKind,
  ctx: OnboardingSuggestionContext,
  exclude?: string[],
): Promise<string[]> {
  try {
    const result = await callModel({
      model: FAST_MODEL,
      messages: [{ role: 'user', content: buildPrompt(kind, ctx, exclude) }],
      system: SYSTEM_PROMPT,
      temperature: 0.8,
      timeout: 10_000,
      caller: CALLER[kind],
    });
    return parseSuggestions(result.content, CAP[kind]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[onboarding-suggestions] ${kind} degraded:`, message);
    return [];
  }
}

/**
 * Pre-create topic ideas (step 1). No brainlift exists yet, so there is no
 * scope context — just a short creativity prompt.
 */
export async function generateTopicSuggestions(exclude?: string[]): Promise<string[]> {
  return generate('topic', { topic: '', inScope: [], outOfScope: [] }, exclude);
}

/**
 * Slug-scoped suggestions (steps 2-4). The route reads `ctx` from the
 * brainlift row — never from client-echoed state.
 */
export async function generateOnboardingSuggestions(
  kind: OnboardingSuggestionKind,
  ctx: OnboardingSuggestionContext,
  exclude?: string[],
): Promise<string[]> {
  return generate(kind, ctx, exclude);
}
