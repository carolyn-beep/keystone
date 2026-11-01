/**
 * Batch runner: runs preformat pipeline on all BrainLifts from the CSV.
 * Saves results incrementally to Samples/json-formatter/batch-results.json.
 *
 * Usage: npx tsx --env-file=.env scripts/preformat-batch-run.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import pLimit from 'p-limit';
import { fetchWorkflowyContent } from '../server/utils/external-sources';
import { preformatHierarchy } from '../server/services/brainlift-preformat';
import type { HierarchyNode } from '../shared/hierarchy-types';

const CONCURRENCY = 10;

const OUTPUT_PATH = 'Samples/json-formatter/batch-results.json';

interface BatchEntry {
  author: string;
  url: string;
}

interface BatchResultSummary {
  index: number;
  author: string;
  url: string;
  success: boolean;
  passed: boolean;
  contentLossPercent: number | null;
  hallucinationCount: number | null;
  duplicateCount: number | null;
  originalNodeCount: number;
  formattedNodeCount: number;
  totalTimeMs: number | null;
  chunkCount: number | null;
  missingCount: number;
  hallucinationTexts: string[];
  missingTexts: string[];
  error: string | null;
}

function countNodes(nodes: HierarchyNode[]): number {
  let count = 0;
  function walk(n: HierarchyNode) { count++; n.children.forEach(walk); }
  nodes.forEach(walk);
  return count;
}

// Parse CSV
function parseCSV(): BatchEntry[] {
  const csv = readFileSync('Samples/json-formatter/Brainlifts - Full DOK Extraction.csv', 'utf8');
  const lines = csv.split('\n').filter(l => l.trim());
  const entries: BatchEntry[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/^([^,]+),(https:\/\/workflowy\.com\/s\/[^\s,]+)/);
    if (match) {
      const author = match[1].trim();
      const url = match[2].trim().split('#')[0]; // strip anchor
      if (!seen.has(url)) {
        seen.add(url);
        entries.push({ author, url });
      }
    }
  }
  return entries;
}

function saveResults(results: BatchResultSummary[]) {
  const data = {
    exportedAt: new Date().toISOString(),
    totalEntries: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed && !r.error).length,
    errors: results.filter(r => r.error).length,
    avgContentLoss: results.filter(r => r.contentLossPercent !== null).reduce((s, r) => s + r.contentLossPercent!, 0) / Math.max(results.filter(r => r.contentLossPercent !== null).length, 1),
    avgHallucinations: results.filter(r => r.hallucinationCount !== null).reduce((s, r) => s + r.hallucinationCount!, 0) / Math.max(results.filter(r => r.hallucinationCount !== null).length, 1),
    results,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
}

async function processOne(i: number, author: string, url: string, total: number): Promise<BatchResultSummary> {
  const label = `[${i + 1}/${total}] ${author}`;

  try {
    console.log(`${label} — fetching...`);
    const fetchResult = await fetchWorkflowyContent(url);
    const hierarchy = fetchResult.hierarchy;
    const originalNodeCount = countNodes(hierarchy);

    console.log(`${label} — preformatting (${originalNodeCount} nodes)...`);
    const result = await preformatHierarchy(hierarchy);

    if (result) {
      const formattedNodeCount = countNodes(result.cleanHierarchy);
      const r: BatchResultSummary = {
        index: i,
        author,
        url,
        success: true,
        passed: result.report.passed,
        contentLossPercent: result.report.contentLossPercent,
        hallucinationCount: result.report.hallucinationCount,
        duplicateCount: result.report.duplicateCount,
        originalNodeCount,
        formattedNodeCount,
        totalTimeMs: result.timing.total,
        chunkCount: result.stats.chunkCount,
        missingCount: result.report.details.missingFromOutput.length,
        hallucinationTexts: result.report.details.possibleHallucinations,
        missingTexts: result.report.details.missingFromOutput,
        error: null,
      };
      const status = r.passed ? 'PASS' : 'FAIL';
      console.log(`${label} — ${status} | loss=${r.contentLossPercent!.toFixed(1)}% halluc=${r.hallucinationCount} time=${(r.totalTimeMs! / 1000).toFixed(0)}s`);
      return r;
    } else {
      console.log(`${label} — CRASH`);
      return {
        index: i, author, url, success: false, passed: false,
        contentLossPercent: null, hallucinationCount: null, duplicateCount: null,
        originalNodeCount, formattedNodeCount: 0,
        totalTimeMs: null, chunkCount: null,
        missingCount: 0, hallucinationTexts: [], missingTexts: [],
        error: 'Pipeline returned null (crash)',
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log(`${label} — ERROR: ${error.substring(0, 80)}`);
    return {
      index: i, author, url, success: false, passed: false,
      contentLossPercent: null, hallucinationCount: null, duplicateCount: null,
      originalNodeCount: 0, formattedNodeCount: 0,
      totalTimeMs: null, chunkCount: null,
      missingCount: 0, hallucinationTexts: [], missingTexts: [],
      error,
    };
  }
}

async function main() {
  const entries = parseCSV();
  console.log(`\n=== PREFORMAT BATCH RUN: ${entries.length} BrainLifts (concurrency: ${CONCURRENCY}) ===\n`);

  const limit = pLimit(CONCURRENCY);
  let doneCount = 0;
  const allResults: BatchResultSummary[] = [];

  const promises = entries.map((entry, i) =>
    limit(async () => {
      const result = await processOne(i, entry.author, entry.url, entries.length);
      allResults.push(result);
      doneCount++;
      // Save incrementally
      saveResults(allResults.sort((a, b) => a.index - b.index));
      console.log(`  [PROGRESS] ${doneCount}/${entries.length} done`);
      return result;
    })
  );

  await Promise.all(promises);
  const results = allResults.sort((a, b) => a.index - b.index);
  saveResults(results);

  // Final summary
  console.log('\n=== FINAL SUMMARY ===');
  const completed = results.filter(r => r.contentLossPercent !== null);
  const passed = completed.filter(r => r.passed);
  const errored = results.filter(r => r.error);
  console.log(`Total: ${results.length} | Passed: ${passed.length} | Failed: ${completed.length - passed.length} | Errors: ${errored.length}`);
  if (completed.length > 0) {
    const avgLoss = completed.reduce((s, r) => s + r.contentLossPercent!, 0) / completed.length;
    const avgHalluc = completed.reduce((s, r) => s + r.hallucinationCount!, 0) / completed.length;
    console.log(`Avg content loss: ${avgLoss.toFixed(1)}%`);
    console.log(`Avg hallucinations: ${avgHalluc.toFixed(1)}`);
  }
  console.log(`\nResults saved to ${OUTPUT_PATH}`);
}

main().catch(console.error);
