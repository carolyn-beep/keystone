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
  MarkdownSectionResult,
} from './types';
import { PROMPT_BUILDERS } from './section-prompts';
import { parseMarkdownToHierarchy } from './markdown-parser';
import { callModel } from '../client';

const MODEL = 'anthropic/claude-haiku-4.5';
const LLM_CONCURRENCY = 15;
const verboseLog = () => process.env.VERBOSE_PRE_FORMATTER_LOG === 'true';

/**
 * Main entry point. Dispatches parallel LLM calls for all chunks
 * and aggregates results into PreformatLLMResults.
 */
export async function runPreformatLLMCalls(
  chunks: PreformatChunk[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PreformatLLMResults> {
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
          const result = await callChunkLLM(chunk);
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
 * Call LLM for a single chunk via unified client.
 * Retries and error classification are handled by the client.
 */
async function callChunkLLM(
  chunk: PreformatChunk,
): Promise<unknown> {
  const promptBuilder = PROMPT_BUILDERS[chunk.type];
  const config = promptBuilder(chunk);

  const result = await callModel({
    model: MODEL,
    system: config.system,
    messages: [{ role: 'user', content: config.user }],
    temperature: 0,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: config.jsonSchema as { name: string; strict?: boolean; schema: Record<string, unknown> },
    },
    retries: 3,
    caller: 'preformat.llmCaller',
  });

  return JSON.parse(result.content);
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

