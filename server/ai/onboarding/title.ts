/**
 * Project-title generation for the onboarding wizard (Topic step).
 *
 * Turns the three-part topic field ("I'll be working on [topic] /
 * specifically focusing on [focus] / in order to [why]") into a real project
 * title. Style grounded in prod student titles (median 7 words, 45%
 * "Name: subtitle"); model picked in a 3-way bake-off on 14 live-shaped
 * inputs (2026-06-11): gemini-2.5-flash-lite, fastest at ~1.6s, $0.10/$0.40.
 * Llama 3.1 8B was cheaper but lifted brand names verbatim from the prompt's
 * style exemplars.
 *
 * Fail-open: resolves null on any model error / timeout / empty output —
 * callers fall back to the raw topic so creation never blocks.
 */

import { callModel } from '../client';

const TITLE_MODEL = 'google/gemini-2.5-flash-lite';

export interface ProjectTitleInput {
  topic: string;
  focus?: string;
  why?: string;
}

/**
 * Compose the full descriptive topic sentence, connectives included —
 * "X, specifically focusing on Y, in order to Z" (parts omitted when empty).
 * Persisted as brainlifts.onboarding_topic and fed to every downstream
 * prompt (suggestions, expert discovery, starter pack) in place of the
 * display title.
 */
export function composeTopicSentence(input: ProjectTitleInput): string {
  const parts = [input.topic.trim()];
  if (input.focus?.trim()) parts.push(`specifically focusing on ${input.focus.trim()}`);
  if (input.why?.trim()) parts.push(`in order to ${input.why.trim()}`);
  return parts.join(', ');
}

function buildPrompt(input: ProjectTitleInput): string {
  const lines = [`Working on: ${input.topic}`];
  if (input.focus?.trim()) lines.push(`Specifically focusing on: ${input.focus.trim()}`);
  if (input.why?.trim()) lines.push(`In order to: ${input.why.trim()}`);
  return (
    `A high-school student described their project in three fields:\n\n` +
    `${lines.join('\n')}\n\n` +
    `Write the project title for it. Real titles from this platform read like:\n` +
    `- CaseBreaker: Gen Z and the Cold Case Backlog\n` +
    `- Tool-Free Hot-Swap Electric Guitar\n` +
    `- RowFuel AI\n\n` +
    `4-8 words. If a name fits naturally, lead with it. ` +
    `Return ONLY the title text, nothing else.`
  );
}

/**
 * Generate a project title from the topic-step fields. Resolves null on any
 * failure or implausible output — never rejects.
 */
export async function generateProjectTitle(input: ProjectTitleInput): Promise<string | null> {
  try {
    const result = await callModel({
      model: TITLE_MODEL,
      messages: [{ role: 'user', content: buildPrompt(input) }],
      system: 'You write sharp, concrete project titles. Return only the title.',
      temperature: 0.8,
      timeout: 10_000,
      caller: 'onboarding.projectTitle',
    });
    const title = result.content
      .trim()
      .split('\n')[0]
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();
    if (!title || title.length > 120) return null;
    return title;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[onboarding-title] degraded:', message);
    return null;
  }
}
