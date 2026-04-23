import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

interface TimeoutPolicyRow {
  id: string;
  file: string;
  caller: string;
  approvedTimeoutMs: number | null;
}

const AUDITED_CALLERS: TimeoutPolicyRow[] = [
  { id: 'redundancyAnalyzer.main', file: 'server/ai/redundancyAnalyzer.ts', caller: 'redundancyAnalyzer', approvedTimeoutMs: 120_000 },
  { id: 'dok3SourceRanker.main', file: 'server/ai/dok3SourceRanker.ts', caller: 'dok3SourceRanker', approvedTimeoutMs: 60_000 },
  { id: 'dok4InsightRanker.main', file: 'server/ai/dok4InsightRanker.ts', caller: 'dok4InsightRanker', approvedTimeoutMs: 60_000 },
  { id: 'imagePromptGenerator.main', file: 'server/ai/imagePromptGenerator.ts', caller: 'imagePromptGenerator', approvedTimeoutMs: 15_000 },
  { id: 'brainliftExtractor.chunkExtraction', file: 'server/ai/brainliftExtractor.ts', caller: 'brainliftExtractor.chunkExtraction', approvedTimeoutMs: 180_000 },
  { id: 'brainliftExtractor.contradictions', file: 'server/ai/brainliftExtractor.ts', caller: 'brainliftExtractor.contradictions', approvedTimeoutMs: 60_000 },
  { id: 'purposeSuggestions.main', file: 'server/routes/purpose-suggestions.ts', caller: 'builder.purposeSuggestions', approvedTimeoutMs: 10_000 },
  { id: 'quizGenerator.conceptExtraction', file: 'server/services/quiz-generator.ts', caller: 'quizGenerator.conceptExtraction', approvedTimeoutMs: 30_000 },
  { id: 'quizGenerator.questionGeneration', file: 'server/services/quiz-generator.ts', caller: 'quizGenerator.questionGeneration', approvedTimeoutMs: 50_000 },
  { id: 'brainliftSuggestExperts.main', file: 'server/jobs/brainliftSuggestExpertsJob.ts', caller: 'brainliftBuilder.suggestExperts', approvedTimeoutMs: 30_000 },
  { id: 'preformat.evaluation', file: 'server/ai/preformat/evaluator.ts', caller: 'preformat.evaluation', approvedTimeoutMs: 45_000 },
  { id: 'preformat.sectionClassification', file: 'server/ai/preformat/llm-caller.ts', caller: 'preformat.sectionClassification', approvedTimeoutMs: 60_000 },
  { id: 'expertRanker.cleanup', file: 'server/ai/experts/ranker.ts', caller: 'expertRanker.cleanup', approvedTimeoutMs: 10_000 },
  { id: 'expertRanker.stackRanking', file: 'server/ai/experts/ranker.ts', caller: 'expertRanker.stackRanking', approvedTimeoutMs: 60_000 },
  { id: 'experts.diagnostics', file: 'server/ai/experts/diagnostics.ts', caller: 'experts.diagnostics', approvedTimeoutMs: 30_000 },
];

function resolveFromRepoRoot(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readSource(file: string): string {
  return fs.readFileSync(resolveFromRepoRoot(file), 'utf8');
}

function hasExplicitTimeoutInCallerBlock(source: string, caller: string): boolean {
  const callerIndex = source.indexOf(`caller: '${caller}'`) >= 0
    ? source.indexOf(`caller: '${caller}'`)
    : source.indexOf(`caller: "${caller}"`);
  if (callerIndex < 0) {
    return false;
  }

  const callStart = Math.max(
    source.lastIndexOf('callModelWithFallback(', callerIndex),
    source.lastIndexOf('callModel(', callerIndex),
  );
  if (callStart < 0) {
    return false;
  }

  const callEnd = source.indexOf('});', callerIndex);
  const snippet = source.slice(
    callStart,
    callEnd >= 0 ? callEnd + 3 : callerIndex + 400,
  );

  return /timeout\s*:/.test(snippet);
}

describe('timeout policy (audited production callers)', () => {
  it('keeps audited inventory unique and resolvable', () => {
    const uniqueIds = new Set(AUDITED_CALLERS.map((row) => row.id));
    expect(uniqueIds.size).toBe(AUDITED_CALLERS.length);

    for (const row of AUDITED_CALLERS) {
      expect(fs.existsSync(resolveFromRepoRoot(row.file))).toBe(true);
      expect(typeof row.caller).toBe('string');
      expect(row.caller.length).toBeGreaterThan(0);
    }
  });

  it('enforces timeout presence only after explicit timeout approval', () => {
    const missingApprovedTimeouts: string[] = [];
    const pendingApproval: string[] = [];

    for (const row of AUDITED_CALLERS) {
      const source = readSource(row.file);
      const hasTimeout = hasExplicitTimeoutInCallerBlock(source, row.caller);

      if (row.approvedTimeoutMs === null) {
        if (!hasTimeout) {
          pendingApproval.push(`${row.id} (${row.file})`);
        }
        continue;
      }

      if (!hasTimeout) {
        missingApprovedTimeouts.push(`${row.id} (${row.file})`);
      }
    }

    if (pendingApproval.length > 0) {
      console.warn(
        `[timeout-policy] Pending timeout approval for ${pendingApproval.length} audited callers:\n${pendingApproval.join('\n')}`,
      );
    }

    expect(missingApprovedTimeouts).toEqual([]);
  });
});
