/**
 * DOK4 grader golden-set eval.
 *
 *   npm run eval:dok4                      # all cases, full pipeline
 *   npm run eval:dok4 -- --case bike-sharp # one case (repeatable)
 *   npm run eval:dok4 -- --quality-only    # skip POV gate, traceability, divergence
 *   npm run eval:dok4 -- --threshold 0.9   # required pass rate (default 0.8)
 *   npm run eval:dok4 -- --concurrency 2   # parallel cases (default 3)
 *
 * Runs the live grading pipeline (the same functions dok4GraderService calls,
 * against real models through the unified client) over every case in
 * golden.json and reports how many land in their expected band. Needs
 * OPENROUTER_API_KEY; needs no database. A JSON report is written to
 * ./reports/ for diffing between model or prompt changes.
 */

import 'dotenv/config';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import type { DOK4CriteriaBreakdown } from '@shared/dok4-types';
import { goldenSetSchema, type GoldenCase, type CriterionKey } from './golden-schema';
import { buildEvaluationContext, traceabilitySources } from './context';

process.env.BRAND ??= 'keystone';

const here = path.dirname(fileURLToPath(import.meta.url));

interface Options {
  caseIds: string[];
  qualityOnly: boolean;
  threshold: number;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { caseIds: [], qualityOnly: false, threshold: 0.8, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case') options.caseIds.push(argv[++i]);
    else if (arg === '--quality-only') options.qualityOnly = true;
    else if (arg === '--threshold') options.threshold = Number(argv[++i]);
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!(options.threshold >= 0 && options.threshold <= 1)) throw new Error('--threshold must be 0..1');
  if (!(options.concurrency >= 1)) throw new Error('--concurrency must be >= 1');
  return options;
}

export interface CaseResult {
  id: string;
  probe: string;
  expected: GoldenCase['expected'];
  outcome: 'graded' | 'rejected' | 'error';
  rawScore?: number;
  finalScore?: number;
  ceiling: number;
  rejectionCategory?: string;
  criteria?: DOK4CriteriaBreakdown;
  weakCriteriaMatched?: { matched: CriterionKey[]; missed: CriterionKey[] };
  rationale?: string;
  feedback?: string;
  error?: string;
  pass: boolean;
  durationMs: number;
}

function judge(expected: GoldenCase['expected'], outcome: CaseResult['outcome'], finalScore?: number): boolean {
  if (outcome === 'error') return false;
  if (!expected.accept) return outcome === 'rejected';
  if (outcome !== 'graded' || finalScore === undefined) return false;
  return finalScore >= expected.minScore! && finalScore <= expected.maxScore!;
}

async function gradeCase(goldenCase: GoldenCase, options: Options): Promise<CaseResult> {
  const grader = await import('../../ai/dok4Grader');
  const context = buildEvaluationContext(goldenCase);
  const started = performance.now();
  const base = {
    id: goldenCase.id,
    probe: goldenCase.probe,
    expected: goldenCase.expected,
    ceiling: context.foundationCeiling,
  };

  try {
    if (!options.qualityOnly) {
      const pov = await grader.validatePOV(context.spovText, context.primaryDok3.text, context.brainliftPurpose);
      if (!pov.accept) {
        return {
          ...base,
          outcome: 'rejected',
          rejectionCategory: pov.rejectionCategory ?? undefined,
          rationale: pov.rejectionReason ?? undefined,
          pass: judge(goldenCase.expected, 'rejected'),
          durationMs: performance.now() - started,
        };
      }
      context.traceabilityResult = await grader.checkDOK4SourceTraceability(
        context.spovText,
        traceabilitySources(context),
      );
      context.divergenceResult = await grader.checkLLMDivergence(context.spovText);
    }

    const quality = await grader.evaluateDOK4Quality(context);
    const finalScore = Math.min(quality.score, context.foundationCeiling);

    const matched: CriterionKey[] = [];
    const missed: CriterionKey[] = [];
    for (const key of goldenCase.expected.weakCriteria) {
      const assessment = quality.criteria[key]?.assessment;
      (assessment === 'weak' || assessment === 'partial' ? matched : missed).push(key);
    }

    return {
      ...base,
      outcome: 'graded',
      rawScore: quality.score,
      finalScore,
      criteria: quality.criteria,
      weakCriteriaMatched: { matched, missed },
      rationale: quality.rationale,
      feedback: quality.feedback,
      pass: judge(goldenCase.expected, 'graded', finalScore),
      durationMs: performance.now() - started,
    };
  } catch (error) {
    return {
      ...base,
      outcome: 'error',
      error: error instanceof Error ? error.message : String(error),
      pass: false,
      durationMs: performance.now() - started,
    };
  }
}

function expectedLabel(expected: GoldenCase['expected']): string {
  return expected.accept ? `${expected.minScore}-${expected.maxScore}` : 'reject';
}

function gotLabel(result: CaseResult): string {
  if (result.outcome === 'rejected') return `reject (${result.rejectionCategory ?? 'unspecified'})`;
  if (result.outcome === 'error') return 'ERROR';
  const capped = result.rawScore !== result.finalScore ? ` (raw ${result.rawScore}, ceiling ${result.ceiling})` : '';
  return `${result.finalScore}${capped}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is required: the eval grades with live models.');
    process.exit(2);
  }

  const golden = goldenSetSchema.parse(JSON.parse(await readFile(path.join(here, 'golden.json'), 'utf8')));
  const selected = options.caseIds.length
    ? golden.cases.filter((c) => options.caseIds.includes(c.id))
    : golden.cases;
  const unknown = options.caseIds.filter((id) => !golden.cases.some((c) => c.id === id));
  if (unknown.length) {
    console.error(`Unknown case id(s): ${unknown.join(', ')}`);
    process.exit(2);
  }

  // Tally model usage across the run instead of the default per-call console JSON.
  const { setCallRecorder } = await import('../../ai/client');
  const usage = { calls: 0, promptTokens: 0, cachedPromptTokens: 0, completionTokens: 0, costUsd: 0, errors: 0 };
  setCallRecorder((record) => {
    usage.calls += 1;
    if (record.status === 'error') usage.errors += 1;
    usage.promptTokens += record.usage?.promptTokens ?? 0;
    usage.cachedPromptTokens += record.usage?.cachedPromptTokens ?? 0;
    usage.completionTokens += record.usage?.completionTokens ?? 0;
    usage.costUsd += record.costUsd ?? 0;
  });

  console.log(`DOK4 grader eval: ${selected.length} case(s), ${options.qualityOnly ? 'quality step only' : 'full pipeline'}\n`);

  const limit = pLimit(options.concurrency);
  const results = await Promise.all(selected.map((c) => limit(() => gradeCase(c, options))));

  const idWidth = Math.max(...results.map((r) => r.id.length), 4);
  console.log(`${'case'.padEnd(idWidth)}  ${'expected'.padEnd(9)}  ${'got'.padEnd(28)}  result`);
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    console.log(`${r.id.padEnd(idWidth)}  ${expectedLabel(r.expected).padEnd(9)}  ${gotLabel(r).padEnd(28)}  ${mark}`);
    if (!r.pass) {
      console.log(`${''.padEnd(idWidth)}  probe: ${r.probe}`);
      console.log(`${''.padEnd(idWidth)}  human: ${r.expected.rationale}`);
      if (r.rationale) console.log(`${''.padEnd(idWidth)}  grader: ${r.rationale}`);
      if (r.error) console.log(`${''.padEnd(idWidth)}  error: ${r.error}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const passRate = passed / results.length;
  const graded = results.filter((r) => r.outcome === 'graded' && r.expected.accept);
  const meanAbsError = graded.length
    ? graded.reduce((sum, r) => {
        const target = (r.expected.minScore! + r.expected.maxScore!) / 2;
        return sum + Math.abs((r.finalScore ?? 0) - target);
      }, 0) / graded.length
    : 0;
  const hints = results.flatMap((r) => r.weakCriteriaMatched ? [r.weakCriteriaMatched] : []);
  const hintMatched = hints.reduce((s, h) => s + h.matched.length, 0);
  const hintTotal = hints.reduce((s, h) => s + h.matched.length + h.missed.length, 0);

  console.log('');
  console.log(`pass rate          ${passed}/${results.length} (${(passRate * 100).toFixed(0)}%), threshold ${(options.threshold * 100).toFixed(0)}%`);
  console.log(`mean |score-band|  ${meanAbsError.toFixed(2)} (distance from the centre of each expected band)`);
  console.log(`weak-criteria hints ${hintMatched}/${hintTotal} flagged weak or partial by the grader`);
  console.log(`model calls        ${usage.calls} (${usage.errors} errors), ${usage.promptTokens} prompt tokens (${usage.cachedPromptTokens} cached), ${usage.completionTokens} completion tokens, ~$${usage.costUsd.toFixed(3)}`);

  const reportDir = path.join(here, 'reports');
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(reportPath, JSON.stringify({
    ranAt: new Date().toISOString(),
    goldenVersion: golden.version,
    rubric: golden.rubric,
    options,
    summary: { passed, total: results.length, passRate, meanAbsError, hintMatched, hintTotal, usage },
    results,
  }, null, 2));
  console.log(`report             ${path.relative(process.cwd(), reportPath)}`);

  process.exit(passRate >= options.threshold ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
