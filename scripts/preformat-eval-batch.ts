/**
 * Batch evaluator: runs the pre-format evaluator on all BrainLifts
 * and UPDATES the existing batch-results.json with evaluation data.
 *
 * Does NOT re-run the formatter. Just adds evaluation fields to each result.
 *
 * Usage: npx tsx --env-file=.env scripts/preformat-eval-batch.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import pLimit from 'p-limit';
import { fetchWorkflowyContent } from '../server/utils/external-sources';
import { evaluateNeedsPreformat, type EvaluationResult } from '../server/ai/preformat/evaluator';

const RESULTS_PATH = 'Samples/json-formatter/batch-results.json';
const CONCURRENCY = 10;

interface BatchResult {
  index: number;
  author: string;
  url: string;
  error: string | null;
  // existing fields...
  [key: string]: unknown;
  // fields we'll add:
  // evaluation: EvaluationResult | null
  // evaluationError: string | null
}

async function main() {
  // Load existing results
  const raw = readFileSync(RESULTS_PATH, 'utf8');
  const data = JSON.parse(raw);
  const results: BatchResult[] = data.results;

  console.log(`\n=== PREFORMAT EVALUATION BATCH: ${results.length} BrainLifts (concurrency: ${CONCURRENCY}) ===\n`);

  const limit = pLimit(CONCURRENCY);
  let doneCount = 0;

  const promises = results.map((result) =>
    limit(async () => {
      const label = `[${result.index + 1}/${results.length}] ${result.author}`;

      // Skip errored entries (no Workflowy content to evaluate)
      if (result.error) {
        result.evaluation = null;
        result.evaluationError = result.error;
        doneCount++;
        console.log(`${label} — SKIP (fetch error)`);
        return;
      }

      try {
        console.log(`${label} — fetching hierarchy...`);
        const fetchResult = await fetchWorkflowyContent(result.url);

        console.log(`${label} — evaluating...`);
        const evaluation = await evaluateNeedsPreformat(fetchResult.hierarchy);

        result.evaluation = evaluation;
        result.evaluationError = null;

        const verdict = evaluation.needsPreformat ? 'NEEDS PREFORMAT' : 'OK AS-IS';
        console.log(`${label} — ${verdict} | confidence=${evaluation.confidence} | ${evaluation.reasons[0]?.substring(0, 60) ?? ''}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        result.evaluation = null;
        result.evaluationError = error;
        console.log(`${label} — ERROR: ${error.substring(0, 80)}`);
      }

      doneCount++;
      console.log(`  [PROGRESS] ${doneCount}/${results.length} done`);

      // Save incrementally
      writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2));
    })
  );

  await Promise.all(promises);

  // Save final
  writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2));

  // Summary
  const evaluated = results.filter(r => r.evaluation);
  const needsPreformat = evaluated.filter(r => (r.evaluation as EvaluationResult).needsPreformat);
  const okAsIs = evaluated.filter(r => !(r.evaluation as EvaluationResult).needsPreformat);
  console.log('\n=== EVALUATION SUMMARY ===');
  console.log(`Evaluated: ${evaluated.length} | Needs preformat: ${needsPreformat.length} | OK as-is: ${okAsIs.length}`);
  console.log(`Errors/skipped: ${results.length - evaluated.length}`);
  console.log(`\nResults updated in ${RESULTS_PATH}`);
}

main().catch(console.error);
