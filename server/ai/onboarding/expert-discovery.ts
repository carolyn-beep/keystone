/**
 * Search-grounded expert discovery for the onboarding wizard
 * (features/ux-redesign/onboarding-wizard, spec 06).
 *
 * One Exa pass (a single natural-language `searchWeb` query) feeds a single
 * fast-tier extraction call through the unified AI client. The model cites
 * evidence by the bracketed result NUMBERS from the prompt (never by typing
 * URLs — verbatim echoing was fragile); code maps ids back to the real result
 * URLs, drops out-of-range ids, dedupes, and caps at 5. The pipeline NEVER
 * throws: any search/model failure (missing EXA_API_KEY, Exa error, model
 * timeout, garbage JSON) logs and returns `[]`, so discovery can never 5xx
 * the wizard — the step falls back to manual entry.
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

/**
 * Build ONE natural-language search query from accumulated wizard state.
 * Exa's semantic search handles narrative queries well; an A/B against
 * Haiku-generated keyword queries (2026-06-12, 3 brainlifts) showed this
 * framing extracts solidly while the keyword arm came back near-empty.
 */
function buildQuery(ctx: DiscoverExpertsContext): string {
  const areas = ctx.categories.filter((c) => c.trim().length > 0);
  const expertiseLine = areas.length > 0
    ? `\n\nTo conduct it well, they want to become an expert in: ${areas.join(', ')}.`
    : '';
  return (
    `A student is working on this project: ${ctx.topic}.${expertiseLine}\n\n` +
    `Find the leading researchers, practitioners, founders, builders — any leading ` +
    `voices worth following based on their work in these areas.`
  );
}

/** Run the search, tolerating failure. Returns `[]` if the query rejected. */
async function runSearch(query: string): Promise<WebSearchResult[]> {
  try {
    return await searchWeb(query, { numResults: 8 });
  } catch (error) {
    console.error('[onboarding.expertDiscovery] search query failed:', error);
    return [];
  }
}

const EXTRACTION_SYSTEM =
  'You extract real subject-matter experts from web search results. ' +
  'You ONLY name experts who are directly supported by the provided search ' +
  'result snippets — never from your own memory or training data. Every ' +
  'expert you return MUST cite the bracketed number(s) of the result(s) that ' +
  'ground them. If the snippets do not clearly support a named person, do ' +
  'not invent one.';

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
    '{"candidates":[{"name":string,"who":string,"why":string,"focus":string|null,"where":string,"evidenceIds":number[]}]}',
    '',
    '- "who": a one-line identity (e.g. "Marine ecologist at NOAA").',
    '- "why": why they matter for this topic, grounded in the snippets.',
    '- "where": a handle, affiliation, or site for the expert.',
    '- "evidenceIds": the bracketed result numbers from the list above that support this person, e.g. [1, 3].',
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

/**
 * Ground, dedupe, and cap the raw model candidates. Evidence arrives as
 * 1-based result ids; ids are bounds-checked and mapped back to the real
 * search-result URLs in code, so the model never has to reproduce a URL
 * byte-for-byte. Returns at most MAX_CANDIDATES well-formed candidates.
 */
function groundAndDedupe(raw: unknown, results: WebSearchResult[]): ExpertCandidate[] {
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
    const evidence = Array.isArray(e.evidenceIds) ? e.evidenceIds : [];

    if (!name) continue;

    // Grounding: keep only in-range result ids (1-based), mapped to URLs.
    const groundedUrls = Array.from(
      new Set(
        evidence
          .filter(
            (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= results.length,
          )
          .map((n) => results[n - 1].url),
      ),
    );
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
    const results = await runSearch(buildQuery(ctx));
    if (results.length === 0) return [];

    const { content } = await callModel({
      model: DISCOVERY_MODEL,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: buildExtractionPrompt(ctx, results) }],
      temperature: 0,
      caller: 'onboarding.expertDiscovery',
      timeout: DISCOVERY_TIMEOUT_MS,
    });

    return groundAndDedupe(parseCandidatePayload(content), results);
  } catch (error) {
    console.error('[onboarding.expertDiscovery] discovery failed, returning []:', error);
    return [];
  }
}
