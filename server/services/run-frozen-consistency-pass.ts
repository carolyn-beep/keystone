import { verifyFactWithAllModels } from '../ai/factVerifier';
import { gradeDOK2SummaryFromFrozenSource } from '../ai/dok2Grader';
import { gradeFrozenDOK3Insight } from '../ai/dok3Grader';
import { gradeFrozenDOK4Spov } from '../ai/dok4FrozenGrader';
import { computeBrainliftOverallScore } from './brainlift-score';
import { computeDOK4FoundationIntegrity } from '@shared/dok4-foundation';
import type { DOK3EvaluationContext } from '../storage/dok3';
import type { DOK4EvaluationContext } from '@shared/dok4-types';
import type {
  FrozenBrainliftSnapshot,
  FrozenDok1Fact,
  FrozenDok2Summary,
  FrozenDok3Insight,
  FrozenDok4Spov,
  WeeklyConsistencyResultRow,
} from '@shared/analytics-types';

function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

function brainliftStableKey(slug: string): string {
  return `brainlift:${slug}`;
}

function mean(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numbers.length === 0) {
    return null;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function getSourceContent(snapshot: FrozenBrainliftSnapshot, sourceUrl: string | null): string {
  if (!sourceUrl) {
    return '';
  }
  return snapshot.sourceEvidence.find((source) => source.sourceUrl === sourceUrl)?.content ?? '';
}

function buildDok3Context(
  snapshot: FrozenBrainliftSnapshot,
  insight: FrozenDok3Insight,
  dok1Scores: Map<string, number | null>,
  dok2Scores: Map<string, number | null>,
): DOK3EvaluationContext {
  const dok1ByKey = new Map(snapshot.dok1Facts.map((fact) => [fact.stableKey, fact]));
  const dok2ByKey = new Map(snapshot.dok2Summaries.map((summary) => [summary.stableKey, summary]));
  const sourceEvidence = new Map<string, string>();

  for (const evidence of snapshot.sourceEvidence) {
    sourceEvidence.set(normalizeUrl(evidence.sourceUrl), evidence.content);
  }

  return {
    insight: {
      id: insight.sourceInsightId ?? 0,
      text: insight.text,
      brainliftId: snapshot.sourceBrainliftId,
    },
    brainliftPurpose: snapshot.purpose,
    linkedDok2s: insight.linkedDok2Keys
      .map((dok2Key) => dok2ByKey.get(dok2Key))
      .filter((summary): summary is FrozenDok2Summary => Boolean(summary))
      .map((summary) => ({
        id: summary.sourceSummaryId ?? 0,
        sourceName: summary.sourceName,
        sourceUrl: summary.sourceUrl,
        displayTitle: null,
        grade: dok2Scores.get(summary.stableKey) ?? null,
        points: summary.points,
        dok1Facts: summary.relatedDok1Keys
          .map((dok1Key) => dok1ByKey.get(dok1Key))
          .filter((fact): fact is FrozenDok1Fact => Boolean(fact))
          .map((fact) => ({
            id: fact.sourceFactId ?? 0,
            fact: fact.fact,
            score: dok1Scores.get(fact.stableKey) ?? 0,
            isGradeable: true,
          })),
      })),
    sourceEvidence,
  };
}

function buildDok4Context(
  snapshot: FrozenBrainliftSnapshot,
  spov: FrozenDok4Spov,
  dok1Scores: Map<string, number | null>,
  dok2Scores: Map<string, number | null>,
  dok3Scores: Map<string, number | null>,
): DOK4EvaluationContext {
  const dok1ByKey = new Map(snapshot.dok1Facts.map((fact) => [fact.stableKey, fact]));
  const dok2ByKey = new Map(snapshot.dok2Summaries.map((summary) => [summary.stableKey, summary]));
  const dok3ByKey = new Map(snapshot.dok3Insights.map((insight) => [insight.stableKey, insight]));

  const linkedDok2s = Array.from(new Set(
    spov.linkedDok3Keys.flatMap((dok3Key) => dok3ByKey.get(dok3Key)?.linkedDok2Keys ?? []),
  ))
    .map((dok2Key) => dok2ByKey.get(dok2Key))
    .filter((summary): summary is FrozenDok2Summary => Boolean(summary))
    .map((summary) => ({
      id: summary.sourceSummaryId ?? 0,
      sourceName: summary.sourceName,
      sourceUrl: summary.sourceUrl,
      grade: dok2Scores.get(summary.stableKey) ?? null,
      points: summary.points,
      dok1Facts: summary.relatedDok1Keys
        .map((dok1Key) => dok1ByKey.get(dok1Key))
        .filter((fact): fact is FrozenDok1Fact => Boolean(fact))
        .map((fact) => ({
          id: fact.sourceFactId ?? 0,
          fact: fact.fact,
          score: dok1Scores.get(fact.stableKey) ?? null,
          source: fact.sourceUrl,
        })),
    }));

  const primaryDok3 = (spov.primaryDok3Key ? dok3ByKey.get(spov.primaryDok3Key) : null)
    ?? (spov.linkedDok3Keys.length > 0 ? dok3ByKey.get(spov.linkedDok3Keys[0]) : null);

  if (!primaryDok3) {
    throw new Error('Frozen SPOV has no linked DOK3 context');
  }

  const dok1Mean = mean(linkedDok2s.flatMap((dok2) => dok2.dok1Facts.map((fact) => fact.score ?? null)));
  const dok2Mean = mean(linkedDok2s.map((dok2) => dok2.grade));
  const primaryDok3Score = dok3Scores.get(primaryDok3.stableKey) ?? primaryDok3.baselineScore ?? 0;
  const foundation = computeDOK4FoundationIntegrity(
    linkedDok2s.flatMap((dok2) => dok2.dok1Facts.map((fact) => fact.score ?? 0)),
    linkedDok2s.map((dok2) => dok2.grade).filter((grade): grade is number => typeof grade === 'number'),
    primaryDok3Score ?? 0,
  );

  return {
    brainliftPurpose: snapshot.purpose,
    spovText: spov.text,
    primaryDok3: {
      id: primaryDok3.sourceInsightId ?? 0,
      text: primaryDok3.text,
      score: primaryDok3Score ?? 0,
      frameworkName: null,
      frameworkDescription: null,
    },
    additionalDok3s: spov.linkedDok3Keys
      .filter((dok3Key) => dok3Key !== primaryDok3.stableKey)
      .map((dok3Key) => dok3ByKey.get(dok3Key))
      .filter((insight): insight is FrozenDok3Insight => Boolean(insight))
      .map((insight) => ({
        id: insight.sourceInsightId ?? 0,
        text: insight.text,
        score: dok3Scores.get(insight.stableKey) ?? insight.baselineScore ?? null,
      })),
    linkedDok2s,
    sourceEvidence: snapshot.sourceEvidence.map((source) => ({
      sourceName: source.sourceName ?? source.sourceUrl,
      sourceUrl: source.sourceUrl,
      content: source.content,
    })),
    foundationIndex: foundation.index,
    foundationCeiling: foundation.ceiling,
    dok1FoundationScore: dok1Mean ?? foundation.dok1Score,
    dok2FoundationScore: dok2Mean ?? foundation.dok2Score,
    dok3FoundationScore: primaryDok3Score ?? foundation.dok3Score,
    traceabilityResult: null,
    divergenceResult: null,
  };
}

export async function runFrozenConsistencyPass(
  snapshots: FrozenBrainliftSnapshot[],
  passNumber: 1 | 2,
): Promise<WeeklyConsistencyResultRow[]> {
  const rows: WeeklyConsistencyResultRow[] = [];

  for (const snapshot of snapshots) {
    const dok1Scores = new Map<string, number | null>();
    const dok2Scores = new Map<string, number | null>();
    const dok3Scores = new Map<string, number | null>();
    const dok4Scores = new Map<string, number | null>();
    const sourceContentByUrl = new Map(snapshot.sourceEvidence.map((source) => [source.sourceUrl, source.content]));

    const dok1Results = await Promise.all(snapshot.dok1Facts.map(async (fact) => {
      const verification = await verifyFactWithAllModels(
        fact.fact,
        fact.sourceLabel ?? fact.sourceUrl,
        fact.evidenceContent,
        false,
      );
      return {
        fact,
        score: verification.consensus.isNonGradeable ? 0 : verification.consensus.consensusScore,
        metadata: {
          confidenceLevel: verification.consensus.confidenceLevel,
          verificationNotes: verification.consensus.verificationNotes,
        },
      };
    }));

    for (const result of dok1Results) {
      dok1Scores.set(result.fact.stableKey, result.score);
      rows.push({
        runId: 0,
        passNumber,
        brainliftStableKey: brainliftStableKey(snapshot.sourceSlug),
        level: 'dok1',
        stableKey: result.fact.stableKey,
        score: result.score,
        metadata: result.metadata,
      });
    }

    const dok2Results = await Promise.all(snapshot.dok2Summaries.map(async (summary) => {
      const grade = await gradeDOK2SummaryFromFrozenSource(
        summary.points,
        summary.relatedDok1Keys
          .map((dok1Key) => snapshot.dok1Facts.find((fact) => fact.stableKey === dok1Key))
          .filter((fact): fact is FrozenDok1Fact => Boolean(fact))
          .map((fact) => ({
            fact: fact.fact,
            source: fact.sourceUrl,
          })),
        snapshot.purpose,
        summary.sourceUrl,
        summary.sourceUrl ? (sourceContentByUrl.get(summary.sourceUrl) ?? '') : '',
      );
      return { summary, grade };
    }));

    for (const result of dok2Results) {
      dok2Scores.set(result.summary.stableKey, result.grade.score);
      rows.push({
        runId: 0,
        passNumber,
        brainliftStableKey: brainliftStableKey(snapshot.sourceSlug),
        level: 'dok2',
        stableKey: result.summary.stableKey,
        score: result.grade.score,
        metadata: {
          displayTitle: result.grade.displayTitle,
          failReason: result.grade.failReason,
          sourceVerified: result.grade.sourceVerified,
        },
      });
    }

    for (const insight of snapshot.dok3Insights) {
      const context = buildDok3Context(snapshot, insight, dok1Scores, dok2Scores);
      const result = await gradeFrozenDOK3Insight(context);
      dok3Scores.set(insight.stableKey, result.score);
      rows.push({
        runId: 0,
        passNumber,
        brainliftStableKey: brainliftStableKey(snapshot.sourceSlug),
        level: 'dok3',
        stableKey: insight.stableKey,
        score: result.score,
        metadata: {
          frameworkName: result.frameworkName,
          traceabilityFlagged: result.traceabilityFlagged,
          evaluatorModel: result.evaluatorModel,
        },
      });
    }

    for (const spov of snapshot.dok4Spovs) {
      const context = buildDok4Context(snapshot, spov, dok1Scores, dok2Scores, dok3Scores);
      const outcome = await gradeFrozenDOK4Spov(context);
      const score = outcome.status === 'graded' ? outcome.score ?? null : null;
      dok4Scores.set(spov.stableKey, score);
      rows.push({
        runId: 0,
        passNumber,
        brainliftStableKey: brainliftStableKey(snapshot.sourceSlug),
        level: 'dok4',
        stableKey: spov.stableKey,
        score,
        metadata: {
          status: outcome.status,
          rejectionCategory: outcome.rejectionCategory ?? null,
        },
      });
    }

    const overallScore = computeBrainliftOverallScore({
      dok1: mean(Array.from(dok1Scores.values())),
      dok2: mean(Array.from(dok2Scores.values())),
      dok3: mean(Array.from(dok3Scores.values())),
      dok4: mean(Array.from(dok4Scores.values())),
    });

    rows.push({
      runId: 0,
      passNumber,
      brainliftStableKey: brainliftStableKey(snapshot.sourceSlug),
      level: 'brainlift',
      stableKey: brainliftStableKey(snapshot.sourceSlug),
      score: overallScore,
      metadata: {
        sourceSlug: snapshot.sourceSlug,
        title: snapshot.title,
      },
    });
  }

  return rows;
}
