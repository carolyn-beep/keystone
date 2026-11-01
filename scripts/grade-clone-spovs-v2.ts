/**
 * Grade existing SPOVs from the clone DB with the v2 rubric (Step 5 only).
 *
 * What this does:
 *   - Loads every graded SPOV from the clone DB
 *   - Builds the evaluation context from the existing DOK1-2-3 chain
 *   - Reuses the SPOV's cached divergence question + vanilla response (no extra LLM calls for Step 4)
 *   - Calls evaluateDOK4Quality() with the new v2 system prompt
 *   - Skips Step 3 (Traceability) -- no source rows in clone, would no-op anyway
 *   - Skips Step 6 (Antimemetic) -- not what we changed
 *   - Writes results to samples/v2-rubric-test-results.csv (summary) and .jsonl (full)
 *   - DOES NOT WRITE TO THE DATABASE
 *
 * Why divergence reuse: the divergence check is a property of the SPOV text, not the rubric.
 * The cached question + vanilla response on each SPOV row are still valid for the v2 S2 criterion.
 * Saves ~180 LLM calls for a 90-SPOV run.
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres@localhost:5432/dok1grader_clone npx tsx scripts/grade-clone-spovs-v2.ts [limit]
 *
 *   limit (optional): grade only the first N SPOVs (for smoke testing). Default: all.
 *
 * Safety: the script aborts unless DATABASE_URL contains "clone" in the database name,
 * to prevent accidentally regrading prod.
 */

import 'dotenv/config';

// ─── Safety check: refuse to run against anything that doesn't look like a clone ───

const dbUrl = process.env.DATABASE_URL ?? '';
const dbName = dbUrl.split('/').pop()?.split('?')[0] ?? '';
if (!dbName.includes('clone')) {
  console.error(`Refusing to run: DATABASE_URL points to "${dbName}", not a clone DB.`);
  console.error(`Set DATABASE_URL to a database whose name contains "clone".`);
  console.error(`Example: DATABASE_URL=postgresql://postgres@localhost:5432/dok1grader_clone npx tsx scripts/grade-clone-spovs-v2.ts`);
  process.exit(1);
}

// ─── Imports (after env validated, before reading DB) ───

import { promises as fs } from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db, pool } from '../server/db';
import { storage } from '../server/storage';
import { evaluateDOK4Quality, checkLLMDivergence } from '../server/ai/dok4Grader';
import { dok4Spovs, brainlifts } from '@shared/schema';

const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '10', 10);

// ─── Config ───

const SUMMARY_CSV = path.resolve('samples/v2-rubric-test-results.csv');
const FULL_JSONL = path.resolve('samples/v2-rubric-test-results.jsonl');

interface RowSummary {
  spov_id: number;
  brainlift_slug: string;
  word_count: number;
  old_score: number | null;
  old_quality_raw: number | null;
  new_score: number;
  delta: number;
  new_rationale_excerpt: string;
  spov_text_excerpt: string;
}

interface RowFull {
  spov_id: number;
  brainlift_slug: string;
  spov_text: string;
  word_count: number;
  old_score: number | null;
  old_quality_raw: number | null;
  new_score: number;
  position_summary: string;
  framework_dependency: string;
  key_evidence: string[];
  criteria: Record<string, { assessment: string; evidence: string }>;
  rationale: string;
  feedback: string;
  divergence_source: 'cached' | 'fresh' | 'unavailable';
  error?: string;
}

// ─── Helpers ───

function csvEscape(s: string | number | null): string {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function wordCountOf(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function arrow(delta: number): string {
  if (delta < 0) return `↓ ${delta}`;
  if (delta > 0) return `↑ +${delta}`;
  return '= 0';
}

// ─── Main ───

async function main(): Promise<void> {
  const limitArg = process.argv[2];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  console.log(`[v2 rubric test] Connecting to: ${dbName}`);
  console.log(`[v2 rubric test] Loading graded SPOVs...`);

  const rows = await db.select({
    id: dok4Spovs.id,
    brainliftId: dok4Spovs.brainliftId,
    text: dok4Spovs.text,
    oldScore: dok4Spovs.score,
    qualityScoreRaw: dok4Spovs.qualityScoreRaw,
    cachedQuestion: dok4Spovs.divergenceQuestion,
    cachedVanilla: dok4Spovs.divergenceVanillaResponse,
    slug: brainlifts.slug,
  })
    .from(dok4Spovs)
    .innerJoin(brainlifts, eq(dok4Spovs.brainliftId, brainlifts.id))
    .where(and(
      eq(dok4Spovs.status, 'graded'),
      isNotNull(dok4Spovs.score),
    ));

  const spovs = limit ? rows.slice(0, limit) : rows;
  console.log(`[v2 rubric test] Found ${rows.length} graded SPOVs${limit ? ` (limiting to ${limit})` : ''}`);
  console.log(`[v2 rubric test] Concurrency: ${CONCURRENCY}\n`);

  // Prepare output files
  await fs.mkdir(path.dirname(SUMMARY_CSV), { recursive: true });
  const csvHeader = [
    'spov_id', 'brainlift_slug', 'word_count',
    'old_score', 'old_quality_raw', 'new_score', 'delta',
    'new_rationale_excerpt', 'spov_text_excerpt',
  ].join(',');
  await fs.writeFile(SUMMARY_CSV, csvHeader + '\n');
  await fs.writeFile(FULL_JSONL, '');

  const stats = {
    total: spovs.length,
    completed: 0,
    graded: 0,
    errored: 0,
    dropped: 0,
    same: 0,
    rose: 0,
    by_old_score: {} as Record<number, { count: number; deltas: number[] }>,
  };

  // Serialized append queue: ensures CSV and JSONL writes don't interleave under concurrency.
  let writeChain: Promise<void> = Promise.resolve();
  const enqueueWrite = (fn: () => Promise<void>): Promise<void> => {
    writeChain = writeChain.then(fn, fn);
    return writeChain;
  };

  const limitFn = pLimit(CONCURRENCY);
  const t0 = Date.now();

  await Promise.all(spovs.map((spov) => limitFn(async () => {
    const wc = wordCountOf(spov.text);

    try {
      const context = await storage.getSpovEvaluationContext(spov.id);
      if (!context) {
        const idx = ++stats.completed;
        stats.errored++;
        const fullRow: RowFull = {
          spov_id: spov.id,
          brainlift_slug: spov.slug,
          spov_text: spov.text,
          word_count: wc,
          old_score: spov.oldScore,
          old_quality_raw: spov.qualityScoreRaw,
          new_score: -1,
          position_summary: '',
          framework_dependency: '',
          key_evidence: [],
          criteria: {},
          rationale: '',
          feedback: '',
          divergence_source: 'unavailable',
          error: 'getSpovEvaluationContext returned null',
        };
        await enqueueWrite(() => fs.appendFile(FULL_JSONL, JSON.stringify(fullRow) + '\n'));
        console.log(`[${idx}/${stats.total}] SPOV ${spov.id} (${spov.slug.slice(0, 30).padEnd(30)}, ${wc.toString().padStart(4)}w, old=${spov.oldScore}) SKIP (no context)`);
        return;
      }

      let divergenceSource: 'cached' | 'fresh' | 'unavailable' = 'unavailable';
      let divergenceResult: { question: string; vanillaResponse: string } | null = null;
      if (spov.cachedQuestion && spov.cachedVanilla) {
        divergenceResult = { question: spov.cachedQuestion, vanillaResponse: spov.cachedVanilla };
        divergenceSource = 'cached';
      } else {
        try {
          divergenceResult = await checkLLMDivergence(spov.text);
          divergenceSource = 'fresh';
        } catch {
          divergenceResult = null;
        }
      }

      const result = await evaluateDOK4Quality({
        ...context,
        divergenceResult,
        traceabilityResult: null,
      });

      const delta = result.score - (spov.oldScore ?? 0);
      const idx = ++stats.completed;
      stats.graded++;
      if (delta < 0) stats.dropped++;
      else if (delta > 0) stats.rose++;
      else stats.same++;

      const oldKey = spov.oldScore ?? 0;
      stats.by_old_score[oldKey] ??= { count: 0, deltas: [] };
      stats.by_old_score[oldKey].count++;
      stats.by_old_score[oldKey].deltas.push(delta);

      const summary: RowSummary = {
        spov_id: spov.id,
        brainlift_slug: spov.slug,
        word_count: wc,
        old_score: spov.oldScore,
        old_quality_raw: spov.qualityScoreRaw,
        new_score: result.score,
        delta,
        new_rationale_excerpt: result.rationale.slice(0, 240).replace(/\s+/g, ' '),
        spov_text_excerpt: spov.text.slice(0, 240).replace(/\s+/g, ' '),
      };
      const csvLine = [
        summary.spov_id,
        csvEscape(summary.brainlift_slug),
        summary.word_count,
        summary.old_score,
        summary.old_quality_raw,
        summary.new_score,
        summary.delta,
        csvEscape(summary.new_rationale_excerpt),
        csvEscape(summary.spov_text_excerpt),
      ].join(',');

      const fullRow: RowFull = {
        spov_id: spov.id,
        brainlift_slug: spov.slug,
        spov_text: spov.text,
        word_count: wc,
        old_score: spov.oldScore,
        old_quality_raw: spov.qualityScoreRaw,
        new_score: result.score,
        position_summary: result.positionSummary,
        framework_dependency: result.frameworkDependency,
        key_evidence: result.keyEvidence,
        criteria: result.criteria as unknown as Record<string, { assessment: string; evidence: string }>,
        rationale: result.rationale,
        feedback: result.feedback,
        divergence_source: divergenceSource,
      };

      await enqueueWrite(async () => {
        await fs.appendFile(SUMMARY_CSV, csvLine + '\n');
        await fs.appendFile(FULL_JSONL, JSON.stringify(fullRow) + '\n');
      });

      console.log(`[${idx}/${stats.total}] SPOV ${spov.id} (${spov.slug.slice(0, 30).padEnd(30)}, ${wc.toString().padStart(4)}w, old=${spov.oldScore})  new=${result.score}  ${arrow(delta)}`);
    } catch (err: unknown) {
      const idx = ++stats.completed;
      stats.errored++;
      const msg = err instanceof Error ? err.message : String(err);
      const fullRow: RowFull = {
        spov_id: spov.id,
        brainlift_slug: spov.slug,
        spov_text: spov.text,
        word_count: wc,
        old_score: spov.oldScore,
        old_quality_raw: spov.qualityScoreRaw,
        new_score: -1,
        position_summary: '',
        framework_dependency: '',
        key_evidence: [],
        criteria: {},
        rationale: '',
        feedback: '',
        divergence_source: 'unavailable',
        error: msg,
      };
      await enqueueWrite(() => fs.appendFile(FULL_JSONL, JSON.stringify(fullRow) + '\n'));
      console.log(`[${idx}/${stats.total}] SPOV ${spov.id} ERROR: ${msg.slice(0, 100)}`);
    }
  })));

  // Drain any pending writes
  await writeChain;

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  // ─── Summary ───
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total processed:  ${stats.total}`);
  console.log(`Elapsed:          ${elapsedSec}s`);
  console.log(`Graded ok:        ${stats.graded}`);
  console.log(`Errored:          ${stats.errored}`);
  console.log(`Score dropped:    ${stats.dropped}`);
  console.log(`Score same:       ${stats.same}`);
  console.log(`Score rose:       ${stats.rose}`);
  console.log('');
  console.log('By previous score:');
  for (const oldScore of [5, 4, 3, 2, 1]) {
    const bucket = stats.by_old_score[oldScore];
    if (!bucket) continue;
    const meanDelta = bucket.deltas.reduce((a, b) => a + b, 0) / bucket.deltas.length;
    const dropped = bucket.deltas.filter(d => d < 0).length;
    console.log(`  was ${oldScore}: ${bucket.count} SPOVs, mean Δ ${meanDelta.toFixed(2)}, ${dropped}/${bucket.count} dropped`);
  }
  console.log('');
  console.log(`Summary CSV: ${SUMMARY_CSV}`);
  console.log(`Full JSONL:  ${FULL_JSONL}`);

  await pool.end();
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  pool.end().finally(() => process.exit(1));
});
