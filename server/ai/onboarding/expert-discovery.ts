/**
 * Search-grounded expert discovery for the onboarding wizard
 * (features/ux-redesign/onboarding-wizard, spec 06).
 *
 * One Exa pass (2-3 `searchWeb` queries via Promise.allSettled) feeds a single
 * fast-tier extraction call through the unified AI client. Candidates are
 * grounded in code against the actual search-result URLs, deduped, and capped
 * at 5. The pipeline NEVER throws: any search/model failure (missing
 * EXA_API_KEY, Exa error, model timeout, garbage JSON) logs and returns `[]`,
 * so discovery can never 5xx the wizard — the step falls back to manual entry.
 *
 * Builder quarantine: this module deliberately does NOT import anything from
 * server/ai/brainlift-builder/ (suggest-experts.ts is the memory-based
 * anti-pattern). Only the expert field vocabulary (name/who/why/focus/where)
 * is carried over.
 */

import { searchWeb, type WebSearchResult } from '../../services/web-research';
import { callModel } from '../client';

const MAX_CANDIDATES = 5;
const DISCOVERY_MODEL = 'anthropic/claude-haiku-4.5';
const DISCOVERY_TIMEOUT_MS = 30_000;

export interface ExpertCandidate {
  name: string;
  who: string;
  why: string;
  focus: string | null;
  where: string;
  evidenceUrls: string[];
}

export interface DiscoverExpertsContext {
  topic: string;
  inScope: string[];
  categories: string[];
}

/** Build 2-3 search queries from accumulated wizard state. */
function buildQueries(ctx: DiscoverExpertsContext): string[] {
  const queries = [`leading researchers and practitioners on ${ctx.topic}`];

  const firstCategory = ctx.categories.find((c) => c.trim().length > 0);
  if (firstCategory) {
    queries.push(`${ctx.topic} ${firstCategory} experts`);
  }

  const scopeTerms = ctx.inScope.filter((s) => s.trim().length > 0).slice(0, 3);
  if (scopeTerms.length > 0) {
    queries.push(`${ctx.topic} ${scopeTerms.join(' ')} thought leaders`);
  }

  return queries;
}

/**
 * Run all queries, tolerating individual failures. Returns the flattened,
 * surviving results (empty if every query rejected).
 */
async function runSearches(queries: string[]): Promise<WebSearchResult[]> {
  const settled = await Promise.allSettled(queries.map((q) => searchWeb(q)));
  const results: WebSearchResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value);
    } else {
      console.error('[onboarding.expertDiscovery] search query failed:', outcome.reason);
    }
  }
  return results;
}

const EXTRACTION_SYSTEM =
  'You extract real subject-matter experts from web search results. ' +
  'You ONLY name experts who are directly supported by the provided search ' +
  'result snippets — never from your own memory or training data. Every ' +
  'expert you return MUST cite the exact result URL(s) that ground them. If ' +
  'the snippets do not clearly support a named person, do not invent one.';

function buildExtractionPrompt(ctx: DiscoverExpertsContext, results: WebSearchResult[]): string {
  const block = results
    .map((r, i) => `[${i + 1}] ${r.title ?? '(no title)'}\nURL: ${r.url}\n${r.text ?? ''}`)
    .join('\n\n');

  return [
    `Topic: ${ctx.topic}`,
    ctx.inScope.length ? `In scope: ${ctx.inScope.join(', ')}` : '',
    ctx.categories.length ? `Categories: ${ctx.categories.join(', ')}` : '',
    '',
    'Search results:',
    block,
    '',
    `Return up to ${MAX_CANDIDATES} experts as strict JSON with this exact shape:`,
    '{"candidates":[{"name":string,"who":string,"why":string,"focus":string|null,"where":string,"evidenceUrls":string[]}]}',
    '',
    '- "who": a one-line identity (e.g. "Marine ecologist at NOAA").',
    '- "why": why they matter for this topic, grounded in the snippets.',
    '- "where": a handle, affiliation, or site for the expert.',
    '- "evidenceUrls": one or more URLs taken VERBATIM from the result list above that support this person.',
    'Do not include anyone the snippets do not support. Return ONLY the JSON object.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Pull the first JSON object out of a model response (tolerates code fences). */
function parseCandidatePayload(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the first {...} block (handles fenced / prefixed output).
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * Ground, dedupe, and cap the raw model candidates against the real search
 * URL set. Returns at most MAX_CANDIDATES well-formed, grounded candidates.
 */
function groundAndDedupe(raw: unknown, searchUrls: Set<string>): ExpertCandidate[] {
  if (!raw || typeof raw !== 'object' || !('candidates' in raw)) return [];
  const list = (raw as { candidates: unknown }).candidates;
  if (!Array.isArray(list)) return [];

  const seenNames = new Set<string>();
  const out: ExpertCandidate[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const who = typeof e.who === 'string' ? e.who.trim() : '';
    const why = typeof e.why === 'string' ? e.why.trim() : '';
    const where = typeof e.where === 'string' ? e.where.trim() : '';
    const focus = typeof e.focus === 'string' && e.focus.trim().length > 0 ? e.focus.trim() : null;
    const evidence = isStringArray(e.evidenceUrls) ? e.evidenceUrls : [];

    if (!name) continue;

    // Grounding: keep only evidence URLs that appear in the real search set.
    const groundedUrls = evidence.filter((u) => searchUrls.has(u));
    if (groundedUrls.length === 0) continue;

    const dedupeKey = name.toLowerCase();
    if (seenNames.has(dedupeKey)) continue;
    seenNames.add(dedupeKey);

    out.push({ name, who, why, focus, where, evidenceUrls: groundedUrls });
    if (out.length >= MAX_CANDIDATES) break;
  }

  return out;
}

/**
 * Discover up to 5 search-grounded expert candidates for the wizard's topic.
 * Never throws — returns `[]` on any failure (fail open to manual entry).
 */
export async function discoverExperts(ctx: DiscoverExpertsContext): Promise<ExpertCandidate[]> {
  try {
    const queries = buildQueries(ctx);
    const results = await runSearches(queries);
    if (results.length === 0) return [];

    const searchUrls = new Set(results.map((r) => r.url));

    const { content } = await callModel({
      model: DISCOVERY_MODEL,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: buildExtractionPrompt(ctx, results) }],
      temperature: 0,
      caller: 'onboarding.expertDiscovery',
      timeout: DISCOVERY_TIMEOUT_MS,
    });

    return groundAndDedupe(parseCandidatePayload(content), searchUrls);
  } catch (error) {
    console.error('[onboarding.expertDiscovery] discovery failed, returning []:', error);
    return [];
  }
}
