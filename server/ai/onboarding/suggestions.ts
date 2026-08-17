/**
 * Onboarding wizard suggestion generation (04-suggestion-steps FR1).
 *
 * Powers the wizard's tap-to-accept suggestion chips for four kinds:
 *   - topic        — 6-8 templated suggestions, "[Project], specifically
 *                    focusing on [what aspect], in order to [why]", generated
 *                    in two stages (invent projects, then extend each into the
 *                    template). Tuned 2026-06-11 across 14 sim rounds against
 *                    prod brainlift data; see topic-anchors.ts for grounding.
 *   - in-scope     — 5-8 phrases scoped to the topic
 *   - out-of-scope — 5-8 phrases scoped to topic + in-scope
 *   - categories   — 4-6 short category names mapping topic + both scope arrays
 *
 * Non-blocking by contract: any model error, timeout, or unparseable response
 * resolves to `[]`. These functions never reject — the wizard renders
 * input-only when suggestions are unavailable. Copy targets high-school
 * students.
 *
 * All calls go through the unified AI client (fast tier, 10s timeout, per-kind
 * caller). Mirrors the parsing of server/routes/purpose-suggestions.ts.
 */

import type { OnboardingTopicSuggestion } from '@shared/routes';
import { callModel } from '../client';
import { sampleAnchors } from './topic-anchors';

export type OnboardingSuggestionKind = 'in-scope' | 'out-of-scope' | 'categories';

/**
 * A topic suggestion split for the three-part topic field. Shape is shared
 * with the client via @shared/routes (OnboardingTopicSuggestion).
 */
export type TopicSuggestion = OnboardingTopicSuggestion;

/**
 * Split a templated suggestion on the two fixed connectives. The UI prints
 * the connectives itself, so the parts must come from one generated sentence
 * (guarantees they compose grammatically). Returns null for any string that
 * doesn't match — callers drop those (fail-open, never throw).
 */
export function splitTopicSuggestion(text: string): TopicSuggestion | null {
  const m = /^(.+?),\s*specifically focusing on\s+(.+?),?\s+in order to\s+(.+)$/i.exec(text.trim());
  if (!m) return null;
  const [, topic, focus, why] = m.map((s) => s?.trim());
  if (!topic || !focus || !why) return null;
  return { text: text.trim(), topic, focus, why };
}

export interface OnboardingSuggestionContext {
  topic: string;
  inScope: string[];
  outOfScope: string[];
}

/** Scoped kinds (steps 2-4). */
const FAST_MODEL = 'anthropic/claude-haiku-4.5';

/**
 * Topic kind. Gemini won the 5-model bake-off on register: 3% business-school
 * slop vs haiku's 33% on the identical prompt (sim round 11), at 10x lower
 * cost. Two-stage pipeline at temp 1.0 measured 0% slop, 100% unique chips,
 * ~4.2s end to end (round 14).
 */
const TOPIC_MODEL = 'google/gemini-2.5-flash-lite';

const SYSTEM_PROMPT =
  'Return only valid JSON. No markdown, no explanation, no wrapping — just the raw JSON array of strings.';

/** Cap per kind, per the research figures. */
const CAP: Record<'topic' | OnboardingSuggestionKind, number> = {
  topic: 8,
  'in-scope': 8,
  'out-of-scope': 8,
  categories: 6,
};

const CALLER: Record<OnboardingSuggestionKind, string> = {
  'in-scope': 'onboarding.inScopeSuggestions',
  'out-of-scope': 'onboarding.outOfScopeSuggestions',
  categories: 'onboarding.categoriesSuggestions',
};

/**
 * The Keystone population, as the suggestion model needs to see it: mostly
 * entrepreneurial, a minority chasing audience / competitive / research goals.
 * Without this block the model falls back on its own "teen hobbyist"
 * stereotype (fermentation, gardening, beekeeping — 0% of real projects).
 */
const PERSONA =
  `Keystone is an entrepreneurial high-school program where students graduate with a working business ` +
  `of their own; most are building real businesses, apps, and brands. A few chase other ambitions at ` +
  `the same bar: a real audience, a competitive result, research the field notices, often as their ` +
  `edge into college or a career. Money is rarely the constraint.`;

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
 * Accepts a bare array or a `{ suggestions: [...] }` wrapper. Tolerates prose
 * around the JSON (e.g. "Here are the suggestions: [...]") by falling back to
 * the outermost bracket slice — the same pattern as expert-discovery's
 * parseCandidatePayload. Returns `[]` for any unparseable / wrong-shape
 * response.
 */
function parseSuggestions(content: string, cap: number): string[] {
  const raw = content
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();

  const tryParse = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  const slice = (open: string, close: string): string | null => {
    const start = raw.indexOf(open);
    const end = raw.lastIndexOf(close);
    return start !== -1 && end > start ? raw.slice(start, end + 1) : null;
  };

  let parsed = tryParse(raw);
  if (parsed === undefined) {
    const arrBody = slice('[', ']');
    parsed = arrBody !== null ? tryParse(arrBody) : undefined;
  }
  if (parsed === undefined) {
    const objBody = slice('{', '}');
    parsed = objBody !== null ? tryParse(objBody) : undefined;
  }
  if (parsed === undefined) return [];

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

/**
 * Topic stage 1: invent concrete projects in the spirit of the rotating
 * anchors (real prod projects, one per theme bucket). Exclude applies here —
 * repeats are a project-level phenomenon.
 */
function buildTopicStage1Prompt(anchors: string[], exclude?: string[]): string {
  return (
    `Invent 6-8 projects a high-school student in the Keystone program might actually build or chase. ` +
    `${PERSONA}\n\n` +
    `Real projects from students on this platform:\n` +
    anchors.map((a) => `- ${a}`).join('\n') +
    `\n\n` +
    `Invent new projects with the same concrete, inventive energy: each one a specific thing someone ` +
    `could point at, with its own twist. Spread them across very different worlds.\n\n` +
    `Each project is a short phrase like the examples.\n\n` +
    `Return ONLY a JSON array of strings.` +
    excludeBlock(exclude)
  );
}

/**
 * Topic stage 2: extend each project into the three-part template. The
 * project stays verbatim as the [Topic] — replacing it with an abstracted
 * expertise field flattens the suggestions into school subjects (round 13).
 */
function buildTopicStage2Prompt(projects: string[]): string {
  return (
    `Extend each project below into this exact shape:\n` +
    `"[Project], specifically focusing on [what aspect], in order to [why]"\n\n` +
    `Keep the project as-is at the start. [what aspect] is the specific angle to master first. ` +
    `[why] is the ambition, short and first person.\n\n` +
    `For example, "a single-serve energy gel designed for halftime" becomes:\n` +
    `"A single-serve energy gel designed for halftime, specifically focusing on rapid glycogen delivery, in order to make a gel athletes actually feel"\n\n` +
    `Projects:\n` +
    projects.map((p) => `- ${p}`).join('\n') +
    `\n\n` +
    `Return ONLY a JSON array of strings, one per project, same order.`
  );
}

/** Build the user prompt for the scoped kinds (steps 2-4). */
function buildPrompt(
  kind: OnboardingSuggestionKind,
  ctx: OnboardingSuggestionContext,
  exclude?: string[],
): string {
  const tail = excludeBlock(exclude);

  switch (kind) {
    case 'in-scope':
      return (
        `A high-school student is working on: "${ctx.topic}".\n\n` +
        `Suggest 5-8 specific sub-topics or angles that should be IN SCOPE for their learning — ` +
        `the parts of this project worth focusing on. Each is a short phrase (2-6 words), concrete and student-friendly.\n\n` +
        `Return ONLY a JSON array of strings.` +
        tail
      );

    case 'out-of-scope':
      return (
        `A high-school student is working on: "${ctx.topic}".\n\n` +
        `In scope so far:\n${listOrNone(ctx.inScope)}\n\n` +
        `Suggest 5-8 topics that live close to this project but fall outside its scope — ` +
        `areas worth knowing exist but not worth going deep on. Each is a short phrase (2-6 words).\n\n` +
        `Return ONLY a JSON array of strings.` +
        tail
      );

    case 'categories': {
      const inBlock =
        ctx.inScope.length > 0
          ? `\n\nThe student has decided these areas are in scope:\n` +
            ctx.inScope.map((i) => `- ${i}`).join('\n')
          : '';
      const outBlock =
        ctx.outOfScope.length > 0
          ? `\n\nThe student explicitly decided not to focus on these areas for now:\n` +
            ctx.outOfScope.map((i) => `- ${i}`).join('\n') +
            `\n\nDo not suggest expertise areas that overlap with them.`
          : '';
      return (
        `You are helping map a student project into the expertise areas they should build.\n\n` +
        `The project may be a startup, app, creative project, research project, competition ` +
        `entry, athletic goal, or community initiative.\n\n` +
        `Internally consider:\n` +
        `- What arena this project belongs to\n` +
        `- What the project is trying to achieve\n` +
        `- What knowledge would make it excellent\n` +
        `- What skills are needed to build, test, grow, or prove it\n` +
        `- What a beginner would likely overlook\n` +
        `- What areas would most affect its success or failure\n\n` +
        `Rules:\n` +
        `- Each item must be an area of expertise, not a task\n` +
        `- Prefer specific over generic\n` +
        `- Include both obvious and non-obvious areas\n` +
        `- 4-6 items\n` +
        `- No duplicates, no markdown, no explanation\n\n` +
        `Project: "${ctx.topic}"` +
        inBlock +
        outBlock +
        `\n\nReturn ONLY a JSON array of strings.` +
        tail
      );
    }
  }
}

/** Run one scoped-kind call. Resolves `[]` on any failure — never rejects. */
async function generate(
  kind: OnboardingSuggestionKind,
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

/** One topic-pipeline stage call. Throws on failure; the pipeline catches. */
async function topicStageCall(prompt: string, caller: string): Promise<string[]> {
  const result = await callModel({
    model: TOPIC_MODEL,
    messages: [{ role: 'user', content: prompt }],
    system: SYSTEM_PROMPT,
    // 1.0: cross-call chip diversity is the product goal; 0.8 left strong
    // repeat modes (sim rounds 1-5).
    temperature: 1.0,
    timeout: 10_000,
    // Grade-5 tone block ON for topic chips (A/B 2026-06-12: toned register
    // preferred). Deliberately OFF for the scoped kinds below.
    userFacing: true,
    caller,
  });
  return parseSuggestions(result.content, CAP.topic);
}

/**
 * Pre-create topic ideas (step 1). No brainlift exists yet, so there is no
 * scope context. Two-stage pipeline ("K-extend", sim round 14): stage 1
 * invents concrete projects grounded in rotating real-project anchors,
 * stage 2 extends each into the template. Returns structured suggestions for
 * the three-part topic field; sentences that don't match the template are
 * dropped. Any failure in either stage resolves to `[]` — never rejects.
 */
export async function generateTopicSuggestions(exclude?: string[]): Promise<TopicSuggestion[]> {
  try {
    const projects = await topicStageCall(
      buildTopicStage1Prompt(sampleAnchors(6), exclude),
      'onboarding.topicSuggestions.projects',
    );
    if (projects.length === 0) return [];
    const sentences = await topicStageCall(
      buildTopicStage2Prompt(projects),
      'onboarding.topicSuggestions.extend',
    );
    return sentences
      .map(splitTopicSuggestion)
      .filter((s): s is TopicSuggestion => s !== null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[onboarding-suggestions] topic degraded:', message);
    return [];
  }
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
