/**
 * Bespoke HTTP client for the Pangram AI-writing-detection API.
 *
 * Pangram is NOT an LLM. It is a tight third-party classification API.
 * Explicit per CLAUDE.md: do NOT route this through the unified AI client
 * (which is for LLM chat completions via OpenRouter).
 *
 * Internal codename only -- never surface "Pangram" in user/agent-facing copy.
 * External label everywhere is "AI Writing Signal".
 */

import {
  PangramHttpError,
  PangramNetworkError,
  PangramResponseError,
  PangramTimeoutError,
  type PangramRequest,
  type PangramResponse,
} from './types';

const PANGRAM_ENDPOINT = 'https://text.api.pangram.com/v3';
const DEFAULT_TIMEOUT_MS = 30_000;
const BODY_EXCERPT_LIMIT = 500;

/**
 * Throw fast at server startup if the Pangram API key is missing.
 * Mirrors the loud-fail treatment of DATABASE_URL / OPENROUTER_API_KEY.
 */
export function assertPangramConfigured(): void {
  const key = process.env.PANGRAM_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error(
      'PANGRAM_API_KEY environment variable must be set. ' +
        'See .env.example for the AI Writing Signal feature.',
    );
  }
}

interface AnalyzeOptions {
  timeoutMs?: number;
}

/**
 * Call Pangram with the given text. Returns a parsed PangramResponse.
 * Throws typed errors (Http / Network / Timeout / Response) so callers can
 * classify and decide retry policy.
 */
export async function analyzeText(
  req: PangramRequest,
  opts: AnalyzeOptions = {},
): Promise<PangramResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const apiKey = process.env.PANGRAM_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    // Defensive: startup guard should already have failed, but never call
    // without auth if for some reason it didn't.
    throw new Error('PANGRAM_API_KEY is not set');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(PANGRAM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new PangramTimeoutError(timeoutMs);
    }
    throw new PangramNetworkError(
      `Pangram network failure: ${err?.message ?? String(err)}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let bodyExcerpt = '';
    try {
      const body = await response.text();
      bodyExcerpt = body.length > BODY_EXCERPT_LIMIT
        ? body.slice(0, BODY_EXCERPT_LIMIT) + '...[truncated]'
        : body;
    } catch {
      bodyExcerpt = '<unable to read body>';
    }
    throw new PangramHttpError(
      `Pangram request failed with status ${response.status}`,
      response.status,
      bodyExcerpt,
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err: any) {
    throw new PangramResponseError(
      `Pangram returned malformed JSON: ${err?.message ?? String(err)}`,
      err,
    );
  }

  // Light structural validation -- defensive against shape drift.
  if (!parsed || typeof parsed !== 'object') {
    throw new PangramResponseError('Pangram response is not an object');
  }
  const obj = parsed as Record<string, unknown>;
  const requiredStringFields = ['text', 'version', 'headline', 'prediction', 'prediction_short'];
  for (const field of requiredStringFields) {
    if (typeof obj[field] !== 'string') {
      throw new PangramResponseError(`Pangram response missing ${field}`);
    }
  }
  const requiredNumberFields = [
    'fraction_ai',
    'fraction_ai_assisted',
    'fraction_human',
    'num_ai_segments',
    'num_ai_assisted_segments',
    'num_human_segments',
  ];
  for (const field of requiredNumberFields) {
    if (typeof obj[field] !== 'number') {
      throw new PangramResponseError(`Pangram response missing ${field}`);
    }
  }
  if (!Array.isArray(obj.windows)) {
    throw new PangramResponseError('Pangram response missing windows');
  }
  return obj as unknown as PangramResponse;
}
