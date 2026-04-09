import { storage } from '../storage';
import { fetchEvidenceForFact } from '../ai/evidenceFetcher';
import { replaceActiveGraderMonitoringSet } from '../storage/grader-monitoring';
import { computeBrainliftOverallScore } from './brainlift-score';
import type {
  FreezeGraderMonitoringSetInput,
  FreezeGraderMonitoringSetResponse,
  FrozenBrainliftSnapshot,
  FrozenDok1Fact,
  FrozenDok2Summary,
  FrozenDok3Insight,
  FrozenDok4Spov,
  FrozenSourceEvidence,
} from '@shared/analytics-types';

const REQUIRED_MONITORED_SLUGS = 5;

function ensureFiveUniqueSlugs(slugs: string[]) {
  const normalized = slugs.map((slug) => slug.trim()).filter((slug) => slug.length > 0);
  const unique = Array.from(new Set(normalized));

  if (unique.length !== REQUIRED_MONITORED_SLUGS) {
    throw new Error(`Expected exactly ${REQUIRED_MONITORED_SLUGS} unique slugs`);
  }

  return unique;
}

function mean(scores: Array<number | null | undefined>): number | null {
  const values = scores.filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function brainliftStableKey(slug: string): string {
  return `brainlift:${slug}`;
}

function dok1StableKey(id: number): string {
  return `dok1:${id}`;
}

function dok2StableKey(id: number): string {
  return `dok2:${id}`;
}

function dok3StableKey(id: number): string {
  return `dok3:${id}`;
}

function dok4StableKey(id: number): string {
  return `dok4:${id}`;
}

function extractUrl(source: string | null | undefined): string | null {
  if (!source) {
    return null;
  }

  const match = source.match(/https?:\/\/[^\s\)]+/i);
  if (!match) {
    return null;
  }

  return match[0].replace(/[.,;:]+$/, '');
}

async function loadFrozenDok1Facts(brainliftId: number): Promise<{
  sourceEvidence: FrozenSourceEvidence[];
  dok1Facts: FrozenDok1Fact[];
}> {
  const facts = await storage.getFactsWithVerifications(brainliftId);
  const evidenceByUrl = new Map<string, FrozenSourceEvidence>();
  const fetchedContentByUrl = new Map<string, string>();
  const failedUrlCache = new Map<string, string>();
  const dok1Facts: FrozenDok1Fact[] = [];

  for (const fact of facts) {
    const sourceUrl = fact.verification?.evidenceUrl ?? extractUrl(fact.source);
    if (!sourceUrl) {
      continue;
    }

    let content = fetchedContentByUrl.get(sourceUrl) ?? null;

    if (!content) {
      const existingEvidence = fact.verification?.evidenceContent;
      const existingError = fact.verification?.evidenceError;
      if (existingEvidence && existingEvidence.length > 0 && !existingError) {
        content = existingEvidence;
        fetchedContentByUrl.set(sourceUrl, content);
        evidenceByUrl.set(sourceUrl, {
          sourceUrl,
          sourceName: fact.source ?? null,
          content,
          fetchedAt: fact.verification?.evidenceFetchedAt?.toISOString?.() ?? new Date().toISOString(),
        });
      } else {
        const result = await fetchEvidenceForFact(fact.fact, fact.source ?? '', failedUrlCache);
        if (result.url === sourceUrl && result.content && !result.error) {
          content = result.content;
          fetchedContentByUrl.set(sourceUrl, content);
          evidenceByUrl.set(sourceUrl, {
            sourceUrl,
            sourceName: fact.source ?? null,
            content,
            fetchedAt: result.fetchedAt.toISOString(),
          });
        }
      }
    }

    if (!content) {
      continue;
    }

    dok1Facts.push({
      stableKey: dok1StableKey(fact.id),
      sourceFactId: fact.id,
      fact: fact.fact,
      sourceLabel: fact.source ?? null,
      sourceUrl,
      evidenceContent: content,
      baselineScore: typeof fact.score === 'number' ? fact.score : null,
    });
  }

  return {
    sourceEvidence: Array.from(evidenceByUrl.values()).sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl)),
    dok1Facts: dok1Facts.sort((a, b) => a.stableKey.localeCompare(b.stableKey)),
  };
}

async function freezeBrainlift(slug: string): Promise<FrozenBrainliftSnapshot> {
  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift) {
    throw new Error(`Brainlift not found for slug "${slug}"`);
  }

  const [{ sourceEvidence, dok1Facts }, dok2Summaries, dok3Insights, dok4Spovs] = await Promise.all([
    loadFrozenDok1Facts(brainlift.id),
    storage.getDOK2Summaries(brainlift.id),
    storage.getDOK3Insights(brainlift.id),
    storage.getDOK4Spovs(brainlift.id),
  ]);

  const dok1KeyById = new Map<number, string>(dok1Facts.map((fact) => [fact.sourceFactId ?? -1, fact.stableKey]));
  const dok2KeyById = new Map<number, string>();
  const dok3KeyById = new Map<number, string>();

  const frozenDok2: FrozenDok2Summary[] = dok2Summaries.map((summary) => {
    const stableKey = dok2StableKey(summary.id);
    dok2KeyById.set(summary.id, stableKey);
    return {
      stableKey,
      sourceSummaryId: summary.id,
      sourceName: summary.sourceName,
      sourceUrl: summary.sourceUrl,
      points: summary.points.map((point) => point.text),
      relatedDok1Keys: summary.relatedFactIds
        .map((factId) => dok1KeyById.get(factId))
        .filter((key): key is string => Boolean(key)),
      baselineScore: typeof summary.grade === 'number' ? summary.grade : null,
    };
  });

  const frozenDok3: FrozenDok3Insight[] = dok3Insights.map((insight) => {
    const stableKey = dok3StableKey(insight.id);
    dok3KeyById.set(insight.id, stableKey);
    return {
      stableKey,
      sourceInsightId: insight.id,
      text: insight.text,
      linkedDok2Keys: insight.linkedDok2SummaryIds
        .map((summaryId) => dok2KeyById.get(summaryId))
        .filter((key): key is string => Boolean(key)),
      baselineScore: typeof insight.score === 'number' ? insight.score : null,
    };
  });

  const frozenDok4: FrozenDok4Spov[] = dok4Spovs.map((spov) => ({
    stableKey: dok4StableKey(spov.id),
    sourceSpovId: spov.id,
    text: spov.text,
    linkedDok3Keys: spov.linkedDok3InsightIds
      .map((insightId) => dok3KeyById.get(insightId))
      .filter((key): key is string => Boolean(key)),
    primaryDok3Key: spov.primaryDok3InsightId ? dok3KeyById.get(spov.primaryDok3InsightId) ?? null : null,
    baselineScore: typeof spov.score === 'number' ? spov.score : null,
  }));

  const frozenOverallScore = computeBrainliftOverallScore({
    dok1: mean(dok1Facts.map((fact) => fact.baselineScore)),
    dok2: mean(frozenDok2.map((summary) => summary.baselineScore)),
    dok3: mean(frozenDok3.map((insight) => insight.baselineScore)),
    dok4: mean(frozenDok4.map((spov) => spov.baselineScore)),
  });

  return {
    monitoringSetId: 0,
    snapshotVersion: 0,
    sourceBrainliftId: brainlift.id,
    sourceSlug: brainlift.slug,
    title: brainlift.title,
    purpose: brainlift.description ?? '',
    frozenOverallScore,
    sourceEvidence,
    dok1Facts,
    dok2Summaries: frozenDok2,
    dok3Insights: frozenDok3,
    dok4Spovs: frozenDok4,
    frozenAt: new Date().toISOString(),
  };
}

export async function freezeGraderMonitoringSet(
  input: FreezeGraderMonitoringSetInput,
): Promise<FreezeGraderMonitoringSetResponse> {
  const slugs = ensureFiveUniqueSlugs(input.slugs);
  const snapshots = await Promise.all(slugs.map((slug) => freezeBrainlift(slug)));

  return replaceActiveGraderMonitoringSet({
    ...input,
    slugs,
    frozenSnapshots: snapshots,
  });
}
