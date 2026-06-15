/**
 * Out-of-scope filter for the onboarding starter pack
 * (features/ux-redesign/onboarding-wizard, spec 05 FR2).
 *
 * After the quick swarm assembles candidate resources, this asks ONE fast-tier
 * model which candidates clearly fall OUT of the project's declared scope. The
 * model is told that "None" is an explicitly legal — and often correct — answer:
 * it must not force-fit exclusions, so an empty result is expected when every
 * candidate fits.
 *
 * Fail-open contract: empty inputs skip the model entirely; any model error,
 * timeout, or unparseable response logs and resolves `[]`. The function NEVER
 * rejects and an error NEVER causes a candidate to be discarded — items only
 * leave the pack when the model affirmatively (and parseably) names them.
 */

import { callModel } from '../client';

const FILTER_MODEL = 'anthropic/claude-haiku-4.5';
const FILTER_TIMEOUT_MS = 20_000;

export interface ScopeFilterItem {
  id: number;
  topic: string;
  facts: string;
  url: string;
}

const FILTER_SYSTEM =
  'You decide which candidate resources clearly fall WITHIN a project\'s declared ' +
  'out-of-scope list. Be conservative: only flag a resource when it plainly belongs ' +
  'to an out-of-scope topic. "None" is a valid and often correct answer — never ' +
  'force-fit exclusions. When every resource fits the project, return an empty list.';

function buildPrompt(items: ScopeFilterItem[], outOfScope: string[]): string {
  const scopeBlock = outOfScope.map((t) => `- ${t}`).join('\n');
  const itemBlock = items
    .map((it) => `[id ${it.id}] ${it.topic}\nURL: ${it.url}\n${it.facts}`)
    .join('\n\n');

  return [
    'Out-of-scope topics for this project:',
    scopeBlock,
    '',
    'Candidate resources:',
    itemBlock,
    '',
    'Which candidate ids clearly fall OUT of scope (belong to an out-of-scope topic above)?',
    'Reply with ONLY a JSON array of the offending ids, e.g. [3, 7].',
    'If none of the candidates are out of scope — which is common and perfectly fine — reply with [] (or "None").',
  ].join('\n');
}

/**
 * Pull the discard id list out of a model response. Accepts a bare JSON array,
 * a `{ "discard": [...] }` wrapper, code fences, and a bare "None". Returns a
 * numeric id list, or `null` when nothing parseable was found.
 */
function parseDiscardIds(content: string): number[] | null {
  const trimmed = content.trim();
  if (/^none\b/i.test(trimmed)) return [];

  // Strip a leading ```json / ``` fence if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? trimmed).trim();

  const tryParse = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  // Direct array, or a `{ discard: [...] }` wrapper.
  let parsed = tryParse(body);
  if (parsed === undefined) {
    // Fall back to the first [...] or {...} block.
    const arr = body.match(/\[[\s\S]*\]/);
    const obj = body.match(/\{[\s\S]*\}/);
    parsed = arr ? tryParse(arr[0]) : obj ? tryParse(obj[0]) : undefined;
  }
  if (parsed === undefined) return null;

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { discard?: unknown }).discard)
      ? (parsed as { discard: unknown[] }).discard
      : null;
  if (list === null) return null;

  return list.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/**
 * Return the subset of `items` ids the model judges out of scope. Fail-open:
 * resolves `[]` on empty inputs or any failure; never rejects.
 */
export async function filterOutOfScopeItems(
  items: ScopeFilterItem[],
  outOfScope: string[],
): Promise<number[]> {
  if (items.length === 0 || outOfScope.length === 0) return [];

  try {
    const { content } = await callModel({
      model: FILTER_MODEL,
      system: FILTER_SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(items, outOfScope) }],
      temperature: 0,
      timeout: FILTER_TIMEOUT_MS,
      caller: 'onboarding.scopeFilter',
    });

    const discardIds = parseDiscardIds(content);
    if (discardIds === null) {
      console.error('[onboarding.scopeFilter] unparseable response, keeping all items:', content.slice(0, 200));
      return [];
    }

    // Intersect with the real candidate id set — drop any hallucinated ids.
    const candidateIds = new Set(items.map((it) => it.id));
    return discardIds.filter((id) => candidateIds.has(id));
  } catch (error) {
    console.error('[onboarding.scopeFilter] filter failed, keeping all items:', error);
    return [];
  }
}
