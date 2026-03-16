/**
 * Batch runner: runs preformat ONLY on BrainLifts flagged as needing it.
 * Reads existing batch-results.json, filters to needsPreformat=true,
 * re-runs the formatter, and updates the results in place.
 *
 * Usage: npx tsx --env-file=.env scripts/preformat-batch-needs-only.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import pLimit from 'p-limit';
import { fetchWorkflowyContent } from '../server/utils/external-sources';
import { preformatHierarchy } from '../server/services/brainlift-preformat';
import type { HierarchyNode } from '../shared/hierarchy-types';

const RESULTS_PATH = 'Samples/json-formatter/batch-results.json';
const CONCURRENCY = 10;

function countNodes(nodes: HierarchyNode[]): number {
  let count = 0;
  function walk(n: HierarchyNode) { count++; n.children.forEach(walk); }
  nodes.forEach(walk);
  return count;
}

async function main() {
  const raw = readFileSync(RESULTS_PATH, 'utf8');
  const data = JSON.parse(raw);
  const results: any[] = data.results;

  // Filter to only those flagged as needing preformat
  const toRun = results.filter(r => r.evaluation?.needsPreformat && !r.error);
  console.log(`\n=== PREFORMAT BATCH (needs-only): ${toRun.length} BrainLifts (concurrency: ${CONCURRENCY}) ===\n`);

  const limit = pLimit(CONCURRENCY);
  let doneCount = 0;

  const promises = toRun.map((existing) =>
    limit(async () => {
      const label = `[${doneCount + 1}/${toRun.length}] ${existing.author}`;

      try {
        console.log(`${label} — fetching...`);
        const fetchResult = await fetchWorkflowyContent(existing.url);
        const hierarchy = fetchResult.hierarchy;
        const originalNodeCount = countNodes(hierarchy);

        console.log(`${label} — preformatting (${originalNodeCount} nodes)...`);
        const result = await preformatHierarchy(hierarchy);

        if (result) {
          const formattedNodeCount = countNodes(result.cleanHierarchy);
          existing.success = true;
          existing.passed = result.report.passed;
          existing.contentLossPercent = result.report.contentLossPercent;
          existing.hallucinationCount = result.report.hallucinationCount;
          existing.duplicateCount = result.report.duplicateCount;
          existing.originalNodeCount = originalNodeCount;
          existing.formattedNodeCount = formattedNodeCount;
          existing.totalTimeMs = result.timing.total;
          existing.chunkCount = result.stats.chunkCount;
          existing.missingCount = result.report.details.missingFromOutput.length;
          existing.hallucinationTexts = result.report.details.possibleHallucinations;
          existing.missingTexts = result.report.details.missingFromOutput;
          existing.error = null;

          const status = result.report.passed ? 'PASS' : 'FAIL';
          console.log(`${label} — ${status} | loss=${result.report.contentLossPercent.toFixed(1)}% halluc=${result.report.hallucinationCount} time=${(result.timing.total / 1000).toFixed(0)}s`);
        } else {
          existing.success = false;
          existing.passed = false;
          existing.error = 'Pipeline returned null (crash)';
          console.log(`${label} — CRASH`);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        existing.error = error;
        console.log(`${label} — ERROR: ${error.substring(0, 80)}`);
      }

      doneCount++;
      console.log(`  [PROGRESS] ${doneCount}/${toRun.length} done`);

      // Save incrementally
      writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2));
    })
  );

  await Promise.all(promises);
  writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2));

  // Summary
  const completed = toRun.filter(r => r.contentLossPercent !== null);
  const passed = completed.filter(r => r.passed);
  console.log('\n=== SUMMARY ===');
  console.log(`Ran: ${toRun.length} | Passed: ${passed.length} | Failed: ${completed.length - passed.length}`);
  if (completed.length > 0) {
    const avgLoss = completed.reduce((s: number, r: any) => s + r.contentLossPercent, 0) / completed.length;
    const avgHalluc = completed.reduce((s: number, r: any) => s + r.hallucinationCount, 0) / completed.length;
    console.log(`Avg content loss: ${avgLoss.toFixed(1)}%`);
    console.log(`Avg hallucinations: ${avgHalluc.toFixed(1)}`);
  }
}

main().catch(console.error);
