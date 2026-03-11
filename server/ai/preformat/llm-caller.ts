/**
 * Parallel LLM Classification Calls for BrainLift Pre-Formatting.
 *
 * Dispatches section-specific prompts to Haiku via OpenRouter,
 * parses structured JSON responses, and aggregates results.
 */

import pLimit from 'p-limit';
import type {
  PreformatChunk,
  PreformatLLMResults,
  OwnerResult,
  PurposeResult,
  ExpertsChunkResult,
  SpovsChunkResult,
  InsightsChunkResult,
  CategoryChunkResult,
  UnknownChunkResult,
  UnstructuredChunkResult,
  KnowledgeTreeChunkResult,
  PromptConfig,
  MarkdownSectionResult,
} from './types';
import { PROMPT_BUILDERS } from './section-prompts';
import { parseMarkdownToHierarchy } from './markdown-parser';

const MODEL = 'anthropic/claude-haiku-4.5';
const LLM_CONCURRENCY = 15;
const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const verboseLog = () => process.env.VERBOSE_PRE_FORMATTER_LOG === 'true';

/**
 * Main entry point. Dispatches parallel LLM calls for all chunks
 * and aggregates results into PreformatLLMResults.
 */
export async function runPreformatLLMCalls(
  chunks: PreformatChunk[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PreformatLLMResults> {
  // Fail-fast if no API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (chunks.length > 0 && !apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  // Empty input -> empty results
  if (chunks.length === 0) {
    return emptyResults();
  }

  const limit = pLimit(LLM_CONCURRENCY);
  let completedCount = 0;

  // Dispatch all calls in parallel with concurrency control
  const chunkResults = await Promise.all(
    chunks.map((chunk, idx) =>
      limit(async () => {
        const callStart = Date.now();
        if (verboseLog()) {
          console.log(`  [LLM Call ${idx + 1}/${chunks.length}] Starting: type=${chunk.type} label="${chunk.label}" inputLen=${chunk.markdown.length}`);
        }
        try {
          const result = await callChunkLLM(chunk, apiKey!);
          const duration = Date.now() - callStart;
          if (verboseLog()) {
            console.log(`  [LLM Call ${idx + 1}/${chunks.length}] OK: type=${chunk.type} label="${chunk.label}" ${duration}ms`);
          }
          completedCount++;
          onProgress?.(completedCount, chunks.length);
          return { chunk, result };
        } catch (err) {
          const duration = Date.now() - callStart;
          // Always log failures (not gated by verbose)
          console.warn(
            `  [LLM Call ${idx + 1}/${chunks.length}] FAILED: type=${chunk.type} label="${chunk.label}" ${duration}ms — ${err instanceof Error ? err.message : err}`,
          );
          completedCount++;
          onProgress?.(completedCount, chunks.length);
          return { chunk, result: null };
        }
      }),
    ),
  );

  return aggregateResults(chunkResults);
}

/**
 * Call LLM for a single chunk with retry logic.
 */
async function callChunkLLM(
  chunk: PreformatChunk,
  apiKey: string,
): Promise<unknown> {
  const promptBuilder = PROMPT_BUILDERS[chunk.type];
  const config = promptBuilder(chunk);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callOpenRouter(config, apiKey);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Non-retryable errors: skip immediately
      if (lastError instanceof NonRetryableError) {
        throw lastError;
      }

      // Last attempt: throw
      if (attempt === MAX_RETRIES) {
        throw lastError;
      }

      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = 100 * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Single OpenRouter API call with response parsing.
 */
async function callOpenRouter(
  config: PromptConfig,
  apiKey: string,
): Promise<unknown> {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: config.system },
      { role: 'user', content: config.user },
    ],
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: config.jsonSchema,
    },
  };

  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network error -- retryable
    throw new RetryableError(
      `Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const status = response.status;
    const errBody = await response.text().catch(() => '');

    if (RETRYABLE_STATUS_CODES.has(status)) {
      throw new RetryableError(`API error ${status}: ${errBody.substring(0, 200)}`);
    }

    // Non-retryable HTTP errors (400, 401, 403, etc.)
    throw new NonRetryableError(`API error ${status}: ${errBody.substring(0, 200)}`);
  }

  // Parse response
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new RetryableError('No response content from LLM');
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new RetryableError(`Malformed JSON response: ${content.substring(0, 200)}`);
  }
}

/**
 * Parse sectionMarkdown into parsedNodes for any MarkdownSectionResult.
 */
function attachParsedNodes<T extends MarkdownSectionResult>(result: T): T {
  result.parsedNodes = parseMarkdownToHierarchy(result.sectionMarkdown || '');
  return result;
}

/**
 * Aggregate per-chunk results into a single PreformatLLMResults.
 */
function aggregateResults(
  chunkResults: Array<{ chunk: PreformatChunk; result: unknown }>,
): PreformatLLMResults {
  const results = emptyResults();

  for (const { chunk, result } of chunkResults) {
    if (result === null) continue;

    switch (chunk.type) {
      case 'owner':
        if (!results.owner) {
          results.owner = result as OwnerResult;
        }
        break;

      case 'purpose':
        if (!results.purpose) {
          results.purpose = attachParsedNodes(result as PurposeResult);
        }
        break;

      case 'experts': {
        const expertsResult = attachParsedNodes(result as ExpertsChunkResult);
        if (!results.experts) {
          results.experts = expertsResult;
        } else {
          // Merge: append nodes from additional chunks
          results.experts.parsedNodes.push(...expertsResult.parsedNodes);
          results.experts.sectionMarkdown += '\n' + expertsResult.sectionMarkdown;
          results.experts.strippedTemplateInstructions.push(...expertsResult.strippedTemplateInstructions);
        }
        break;
      }

      case 'spovs': {
        const spovsResult = attachParsedNodes(result as SpovsChunkResult);
        if (!results.spovs) {
          results.spovs = spovsResult;
        } else {
          results.spovs.parsedNodes.push(...spovsResult.parsedNodes);
          results.spovs.sectionMarkdown += '\n' + spovsResult.sectionMarkdown;
        }
        break;
      }

      case 'insights': {
        const insightsResult = attachParsedNodes(result as InsightsChunkResult);
        if (!results.insights) {
          results.insights = insightsResult;
        } else {
          results.insights.parsedNodes.push(...insightsResult.parsedNodes);
          results.insights.sectionMarkdown += '\n' + insightsResult.sectionMarkdown;
        }
        break;
      }

      case 'category': {
        const catResult = result as CategoryChunkResult;
        catResult.parsedNodes = parseMarkdownToHierarchy(catResult.sectionMarkdown || '');
        results.categories.push(catResult);
        break;
      }

      case 'knowledge_tree': {
        const ktResult = result as KnowledgeTreeChunkResult;
        for (const cat of ktResult.categories) {
          cat.parsedNodes = parseMarkdownToHierarchy(cat.sectionMarkdown || '');
        }
        results.categories.push(...ktResult.categories);
        break;
      }

      case 'unknown': {
        const unknownResult = attachParsedNodes(result as UnknownChunkResult);
        results.unknownSections.push(unknownResult);
        break;
      }

      case 'unstructured': {
        const unstructured = attachParsedNodes(result as UnstructuredChunkResult);
        // Unstructured outputs a single sectionMarkdown containing the entire document.
        // The parser extracts all sections from it. We store parsed nodes for merger.
        // For backwards compatibility, also try to extract owner from parsed nodes.
        if (!results.purpose) {
          results.purpose = unstructured;
        }
        // Store the unstructured result as a special unknown section for merging
        results.unknownSections.push({
          classification: 'dok_content' as const,
          sectionMarkdown: unstructured.sectionMarkdown,
          parsedNodes: unstructured.parsedNodes,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Create empty PreformatLLMResults.
 */
function emptyResults(): PreformatLLMResults {
  return {
    owner: null,
    purpose: null,
    experts: null,
    spovs: null,
    insights: null,
    categories: [],
    unknownSections: [],
    scratchpad: [],
  };
}

/**
 * Simple sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Error class for retryable failures (network, 429, 500, malformed JSON).
 */
class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * Error class for non-retryable failures (400, 401, 403).
 */
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}
