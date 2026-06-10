import type { AuthContext, BrainliftData } from '../storage/base';
import { db, eq, facts, dok2Summaries } from '../storage/base';
import { storage } from '../storage';
import { createVersion, pruneVersions } from '../storage/versions';
import { dismissStaleFlag, getStaleItems, propagateStaleFlags } from '../storage/stale';
import { recomputeBrainliftScore } from './brainlift';
import { withJob } from '../utils/withJob';
import type { PreviousEvaluation } from '@shared/types/regrading';

type AccessMode = 'access' | 'modify';
type DokLevel = 1 | 2 | 3 | 4;

export interface CreateDok1Args {
  slug: string;
  fact: string;
  source: string;
  category?: string;
}

export interface CreateDok2Args {
  slug: string;
  sourceName: string;
  sourceUrl?: string;
  points: string[];
  relatedFactIds: number[];
}

export interface CreateDok3Args {
  slug: string;
  text: string;
  linkedDok2Ids: number[];
}

export interface CreateDok4Args {
  slug: string;
  text: string;
  linkedDok3Ids: number[];
  primaryDok3Id: number;
}

export interface EditDokItemArgs {
  slug: string;
  dok: DokLevel;
  itemId: number;
  text: string;
}

export interface DeleteDokItemArgs {
  slug: string;
  dok: DokLevel;
  itemId: number;
  confirm?: boolean;
}

export interface LinkDok3Args {
  slug: string;
  insightId: number;
  dok2Ids: number[];
}

export interface LinkDok4Args {
  slug: string;
  spovId: number;
  dok3Ids: number[];
  newPrimaryDok3Id?: number;
}

export interface GetStaleItemsArgs {
  slug: string;
}

export interface DismissStaleArgs {
  slug: string;
  dok: DokLevel;
  itemId: number;
}

export interface ExpertInput {
  name: string;
  who?: string;
  why?: string;
  focus?: string;
  where?: string;
}

export interface CreateExpertArgs {
  slug: string;
  experts: ExpertInput[];
  /** Provenance for the created rows. Defaults to 'listed' (chat-tool path). */
  source?: 'listed' | 'onboarding';
}

/** Trim an optional string, returning null when absent or blank. */
function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export interface DeleteExpertArgs {
  slug: string;
  expertId: number;
}

function assertNonEmptyString(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function uniqueNumberIds(ids: number[]): number[] {
  return Array.from(new Set(ids));
}

async function resolveBrainlift(
  slug: string,
  authContext: AuthContext,
  accessMode: AccessMode,
): Promise<BrainliftData> {
  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift) {
    throw new Error('Brainlift not found');
  }

  const authorized = accessMode === 'modify'
    ? await storage.canModifyBrainlift(brainlift, authContext)
    : await storage.canAccessBrainlift(brainlift, authContext);

  if (!authorized) {
    throw new Error('Brainlift not found');
  }

  return brainlift;
}

async function queueExpertsRerank(brainliftId: number): Promise<boolean> {
  try {
    await withJob('experts:rerank')
      .forPayload({ brainliftId })
      .withOptions({ jobKey: `rerank-experts-${brainliftId}` })
      .queue();
    return true;
  } catch (error) {
    console.error('[Chat Curation] Failed to queue expert rerank:', error);
    return false;
  }
}

async function getDok2SummariesForBrainlift(brainliftId: number) {
  return storage.getDOK2Summaries(brainliftId);
}

async function getDOK3InsightsForBrainlift(brainliftId: number) {
  return storage.getDOK3Insights(brainliftId);
}

async function getDOK4SpovsForBrainlift(brainliftId: number) {
  return storage.getDOK4Spovs(brainliftId);
}

async function getDokItemSnapshot(brainliftId: number, dok: DokLevel, itemId: number) {
  switch (dok) {
    case 1:
      return storage.getFactByIdForBrainlift(itemId, brainliftId);

    case 2: {
      const summaries = await getDok2SummariesForBrainlift(brainliftId);
      return summaries.find((summary) => summary.id === itemId) ?? null;
    }

    case 3: {
      const insights = await getDOK3InsightsForBrainlift(brainliftId);
      return insights.find((insight) => insight.id === itemId) ?? null;
    }

    case 4: {
      const spovs = await getDOK4SpovsForBrainlift(brainliftId);
      return spovs.find((spov) => spov.id === itemId) ?? null;
    }
  }
}

function buildDeletePreview(
  dok: DokLevel,
  itemId: number,
  impact: Awaited<ReturnType<typeof storage.getFactDeleteImpact>>,
) {
  return {
    confirmed: false,
    requiresConfirmation: true,
    dokLevel: dok,
    itemId,
    item: impact?.item ?? null,
    unlinkedItems: impact?.unlinkedItems ?? [],
    staleDok2Ids: impact?.staleDok2Ids ?? [],
    staleDok3Ids: impact?.staleDok3Ids ?? [],
    staleDok4Ids: impact?.staleDok4Ids ?? [],
    impactSummary: {
      unlinked: impact?.unlinkedItems.length ?? 0,
      markedStale:
        (impact?.staleDok2Ids.length ?? 0) +
        (impact?.staleDok3Ids.length ?? 0) +
        (impact?.staleDok4Ids.length ?? 0),
    },
  };
}

export async function createDok1Item(
  authContext: AuthContext,
  args: CreateDok1Args,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  const factText = assertNonEmptyString(args.fact, 'fact');
  const source = assertNonEmptyString(args.source, 'source');

  const created = await storage.createFact({
    brainliftId: brainlift.id,
    fact: factText,
    source,
    category: args.category?.trim() || undefined,
  });

  await db.update(facts)
    .set({ gradingStatus: 'grading' })
    .where(eq(facts.id, created.id));

  await withJob('dok1:grade-single')
    .forPayload({ factId: created.id, brainliftId: brainlift.id })
    .queue();

  const item = await storage.getFactByIdForBrainlift(created.id, brainlift.id);

  return {
    id: created.id,
    dokLevel: 1 as const,
    status: 'grading' as const,
    item,
  };
}

export async function createDok2Item(
  authContext: AuthContext,
  args: CreateDok2Args,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  const sourceName = assertNonEmptyString(args.sourceName, 'sourceName');
  const points = args.points
    .map((point) => point.trim())
    .filter((point) => point.length > 0);

  if (points.length === 0) {
    throw new Error('points must contain at least one non-empty string');
  }

  const relatedFactIds = uniqueNumberIds(args.relatedFactIds);
  for (const factId of relatedFactIds) {
    const fact = await storage.getFactByIdForBrainlift(factId, brainlift.id);
    if (!fact) {
      throw new Error(`Fact ID ${factId} not found in this brainlift`);
    }
  }

  const created = await storage.createDok2Summary({
    brainliftId: brainlift.id,
    sourceName,
    sourceUrl: args.sourceUrl?.trim() || undefined,
    points,
    relatedFactIds,
  });

  await db.update(dok2Summaries)
    .set({ gradingStatus: 'grading' })
    .where(eq(dok2Summaries.id, created.id));

  await withJob('dok2:grade-single')
    .forPayload({ summaryId: created.id, brainliftId: brainlift.id })
    .queue();

  const item = await getDokItemSnapshot(brainlift.id, 2, created.id);

  return {
    id: created.id,
    dokLevel: 2 as const,
    status: 'grading' as const,
    item,
  };
}

export async function createDok3Item(
  authContext: AuthContext,
  args: CreateDok3Args,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  const text = assertNonEmptyString(args.text, 'text');
  const linkedDok2Ids = uniqueNumberIds(args.linkedDok2Ids);

  if (linkedDok2Ids.length < 2) {
    throw new Error('linkedDok2Ids must contain at least 2 DOK2 summary IDs');
  }

  const validation = await storage.validateMultiSourceLinks(linkedDok2Ids);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid DOK2 link set');
  }

  const validDok2Ids = new Set(
    (await getDok2SummariesForBrainlift(brainlift.id)).map((summary) => summary.id),
  );

  for (const dok2Id of linkedDok2Ids) {
    if (!validDok2Ids.has(dok2Id)) {
      throw new Error(`DOK2 summary ID ${dok2Id} does not belong to this brainlift`);
    }
  }

  const created = await storage.createDok3Insight({
    brainliftId: brainlift.id,
    text,
    linkedDok2Ids,
  });

  try {
    await withJob('dok3:grade')
      .forPayload({ insightId: created.id, brainliftId: brainlift.id })
      .queue();
  } catch (error) {
    console.error(`[Chat Curation] Failed to queue DOK3 grade for ${created.id}:`, error);
  }

  const item = await getDokItemSnapshot(brainlift.id, 3, created.id);

  return {
    id: created.id,
    dokLevel: 3 as const,
    status: 'grading' as const,
    item,
  };
}

export async function createDok4Item(
  authContext: AuthContext,
  args: CreateDok4Args,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  const text = assertNonEmptyString(args.text, 'text');
  const linkedDok3Ids = uniqueNumberIds(args.linkedDok3Ids);

  if (linkedDok3Ids.length === 0) {
    throw new Error('linkedDok3Ids must contain at least 1 DOK3 insight ID');
  }
  if (!linkedDok3Ids.includes(args.primaryDok3Id)) {
    throw new Error('primaryDok3Id must be included in linkedDok3Ids');
  }

  const insights = await getDOK3InsightsForBrainlift(brainlift.id);
  const insightMap = new Map(insights.map((insight) => [insight.id, insight]));

  for (const dok3Id of linkedDok3Ids) {
    const insight = insightMap.get(dok3Id);
    if (!insight) {
      throw new Error(`DOK3 insight ID ${dok3Id} does not belong to this brainlift`);
    }
    if (insight.status !== 'graded') {
      throw new Error(`DOK3 insight ID ${dok3Id} is not graded (status: ${insight.status})`);
    }
  }

  const created = await storage.createDok4Spov({
    brainliftId: brainlift.id,
    text,
    linkedDok3Ids,
    primaryDok3Id: args.primaryDok3Id,
  });

  try {
    await withJob('dok4:grade')
      .forPayload({ spovId: created.id, brainliftId: brainlift.id })
      .queue();
  } catch (error) {
    console.error(`[Chat Curation] Failed to queue DOK4 grade for ${created.id}:`, error);
  }

  const item = await getDokItemSnapshot(brainlift.id, 4, created.id);

  return {
    id: created.id,
    dokLevel: 4 as const,
    status: 'grading' as const,
    item,
  };
}

export async function editDokItem(
  authContext: AuthContext,
  args: EditDokItemArgs,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');

  switch (args.dok) {
    case 1: {
      const text = assertNonEmptyString(args.text, 'text');
      const fact = await storage.getFactByIdForBrainlift(args.itemId, brainlift.id);
      if (!fact) {
        throw new Error('Fact not found');
      }
      if (fact.fact === text) {
        throw new Error('Text unchanged');
      }

      const editResult = await storage.editFact(args.itemId, brainlift.id, text);
      if (!editResult) {
        throw new Error('Fact not found');
      }

      await createVersion({
        dokLevel: 1,
        itemId: args.itemId,
        brainliftId: brainlift.id,
        textContent: editResult.previousText,
        score: editResult.previousScore,
        feedback: editResult.previousFeedback,
      });

      const stalePropagation = await propagateStaleFlags({
        dokLevel: 1,
        itemId: args.itemId,
        brainliftId: brainlift.id,
        reason: `DOK1 fact ${args.itemId} edited`,
      });

      await pruneVersions(1, args.itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        oldText: editResult.previousText,
        newText: text,
        editNumber: 1,
      };

      await db.update(facts)
        .set({ gradingStatus: 'regrading' })
        .where(eq(facts.id, args.itemId));

      await withJob('dok1:regrade')
        .forPayload({ factId: args.itemId, brainliftId: brainlift.id, previousEvaluation })
        .queue();

      return {
        id: args.itemId,
        dokLevel: 1 as const,
        status: 'regrading' as const,
        previousScore: editResult.previousScore,
        previousFeedback: editResult.previousFeedback,
        stalePropagation,
        item: await getDokItemSnapshot(brainlift.id, 1, args.itemId),
      };
    }

    case 2: {
      const points = args.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (points.length === 0) {
        throw new Error('text must contain at least one non-empty line');
      }

      const editResult = await storage.editDok2Summary(args.itemId, brainlift.id, points);
      if (!editResult) {
        throw new Error('DOK2 summary not found');
      }

      await createVersion({
        dokLevel: 2,
        itemId: args.itemId,
        brainliftId: brainlift.id,
        textContent: editResult.previousPoints.join('\n'),
        score: editResult.previousScore,
        feedback: editResult.previousFeedback,
      });

      const stalePropagation = await propagateStaleFlags({
        dokLevel: 2,
        itemId: args.itemId,
        brainliftId: brainlift.id,
        reason: `DOK2 summary ${args.itemId} edited`,
      });

      await pruneVersions(2, args.itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        oldText: editResult.previousPoints.join('\n'),
        newText: points.join('\n'),
        editNumber: 1,
      };

      await db.update(dok2Summaries)
        .set({ gradingStatus: 'regrading' })
        .where(eq(dok2Summaries.id, args.itemId));

      await withJob('dok2:regrade')
        .forPayload({ summaryId: args.itemId, brainliftId: brainlift.id, previousEvaluation })
        .queue();

      return {
        id: args.itemId,
        dokLevel: 2 as const,
        status: 'regrading' as const,
        previousScore: editResult.previousScore,
        previousFeedback: editResult.previousFeedback,
        stalePropagation,
        item: await getDokItemSnapshot(brainlift.id, 2, args.itemId),
      };
    }

    case 3: {
      const text = assertNonEmptyString(args.text, 'text');
      const insight = await storage.getDOK3InsightForBrainlift(args.itemId, brainlift.id);
      if (!insight) {
        throw new Error('DOK3 insight not found');
      }
      if (insight.text === text) {
        throw new Error('Text unchanged');
      }

      const editResult = await storage.editDok3Insight(args.itemId, brainlift.id, text);
      if (!editResult) {
        throw new Error('DOK3 insight not found');
      }

      await createVersion({
        dokLevel: 3,
        itemId: args.itemId,
        brainliftId: brainlift.id,
        textContent: editResult.previousText,
        score: editResult.previousScore,
        feedback: editResult.previousFeedback,
      });

      const stalePropagation = await propagateStaleFlags({
        dokLevel: 3,
        itemId: args.itemId,
        brainliftId: brainlift.id,
        reason: `DOK3 insight ${args.itemId} edited`,
      });

      await pruneVersions(3, args.itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        previousRationale: editResult.previousRationale ?? undefined,
        previousCriteriaBreakdown: editResult.previousCriteriaBreakdown ?? undefined,
        oldText: editResult.previousText,
        newText: text,
        editNumber: 1,
      };

      await withJob('dok3:regrade')
        .forPayload({ insightId: args.itemId, brainliftId: brainlift.id, previousEvaluation })
        .queue();

      return {
        id: args.itemId,
        dokLevel: 3 as const,
        status: 'regrading' as const,
        previousScore: editResult.previousScore,
        previousFeedback: editResult.previousFeedback,
        stalePropagation,
        item: await getDokItemSnapshot(brainlift.id, 3, args.itemId),
      };
    }

    case 4: {
      const text = assertNonEmptyString(args.text, 'text');
      const spov = (await getDOK4SpovsForBrainlift(brainlift.id))
        .find((candidate) => candidate.id === args.itemId);
      if (!spov) {
        throw new Error('SPOV not found');
      }
      if (spov.text === text) {
        throw new Error('Text unchanged');
      }

      const editResult = await storage.editDok4Spov(args.itemId, brainlift.id, text);
      if (!editResult) {
        throw new Error('SPOV not found');
      }

      await createVersion({
        dokLevel: 4,
        itemId: args.itemId,
        brainliftId: brainlift.id,
        textContent: editResult.previousText,
        score: editResult.previousScore,
        feedback: editResult.previousFeedback,
      });

      await pruneVersions(4, args.itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        previousRationale: editResult.previousRationale ?? undefined,
        previousCriteriaBreakdown: editResult.previousCriteriaBreakdown ?? undefined,
        oldText: editResult.previousText,
        newText: text,
        editNumber: 1,
      };

      await withJob('dok4:regrade')
        .forPayload({ spovId: args.itemId, brainliftId: brainlift.id, previousEvaluation })
        .queue();

      return {
        id: args.itemId,
        dokLevel: 4 as const,
        status: 'regrading' as const,
        previousScore: editResult.previousScore,
        previousFeedback: editResult.previousFeedback,
        stalePropagation: { dok2Count: 0, dok3Count: 0, dok4Count: 0 },
        item: await getDokItemSnapshot(brainlift.id, 4, args.itemId),
      };
    }
  }
}

export async function deleteDokItem(
  authContext: AuthContext,
  args: DeleteDokItemArgs,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');

  const impactFns = {
    1: storage.getFactDeleteImpact,
    2: storage.getDok2DeleteImpact,
    3: storage.getDok3DeleteImpact,
    4: storage.getDok4DeleteImpact,
  } as const;

  const deleteFns = {
    1: storage.deleteFact,
    2: storage.deleteDok2Summary,
    3: storage.deleteDok3Insight,
    4: storage.deleteDok4Spov,
  } as const;

  if (!args.confirm) {
    const impact = await impactFns[args.dok](args.itemId, brainlift.id);
    if (!impact) {
      throw new Error('Item not found');
    }
    return buildDeletePreview(args.dok, args.itemId, impact);
  }

  const result = await deleteFns[args.dok](args.itemId, brainlift.id);
  if (!result) {
    throw new Error('Item not found');
  }

  await recomputeBrainliftScore(brainlift.id, {
    trigger: 'delete',
    dokLevel: args.dok,
    itemId: args.itemId,
  });

  return {
    confirmed: true,
    dokLevel: args.dok,
    itemId: args.itemId,
    deleted: result.deleted,
    impactSummary: result.impactSummary,
  };
}

export async function listStaleDokItems(
  authContext: AuthContext,
  args: GetStaleItemsArgs,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'access');
  return {
    slug: brainlift.slug,
    ...await getStaleItems(brainlift.id),
  };
}

export async function dismissStaleDokItem(
  authContext: AuthContext,
  args: DismissStaleArgs,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  await dismissStaleFlag(args.dok, args.itemId, brainlift.id);
  return {
    slug: brainlift.slug,
    dokLevel: args.dok,
    itemId: args.itemId,
    dismissed: true,
  };
}

export async function linkDok3Evidence(
  authContext: AuthContext,
  args: LinkDok3Args,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  const dok2Ids = uniqueNumberIds(args.dok2Ids);

  if (dok2Ids.length === 0) {
    throw new Error('dok2Ids must be a non-empty array of numbers');
  }

  const validDok2Ids = new Set(
    (await getDok2SummariesForBrainlift(brainlift.id)).map((summary) => summary.id),
  );
  const invalidIds = dok2Ids.filter((dok2Id) => !validDok2Ids.has(dok2Id));
  if (invalidIds.length > 0) {
    throw new Error(`DOK2 IDs not found in this brainlift: ${invalidIds.join(', ')}`);
  }

  const result = await storage.addLinksToDok3Insight({
    insightId: args.insightId,
    brainliftId: brainlift.id,
    dok2Ids,
  });

  if (!result) {
    throw new Error('DOK3 insight not found');
  }

  await createVersion({
    dokLevel: 3,
    itemId: args.insightId,
    brainliftId: brainlift.id,
    textContent: result.existingItem.text,
    score: result.existingItem.score,
    feedback: null,
  });
  await pruneVersions(3, args.insightId);

  const previousEvaluation: PreviousEvaluation = {
    previousScore: result.existingItem.score ?? 0,
    previousFeedback: '',
    oldText: result.existingItem.text,
    newText: result.existingItem.text,
    editNumber: 1,
  };

  await withJob('dok3:regrade')
    .forPayload({ insightId: args.insightId, brainliftId: brainlift.id, previousEvaluation })
    .queue();

  const item = await getDokItemSnapshot(brainlift.id, 3, args.insightId);

  return {
    id: args.insightId,
    status: 'regrading' as const,
    addedLinks: result.addedCount,
    skippedLinks: dok2Ids.length - result.addedCount,
    item,
  };
}

export async function linkDok4Evidence(
  authContext: AuthContext,
  args: LinkDok4Args,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  const dok3Ids = uniqueNumberIds(args.dok3Ids);

  if (dok3Ids.length === 0) {
    throw new Error('dok3Ids must be a non-empty array of numbers');
  }

  const spovs = await getDOK4SpovsForBrainlift(brainlift.id);
  const existingSpov = spovs.find((spov) => spov.id === args.spovId);
  if (!existingSpov) {
    throw new Error('DOK4 SPOV not found');
  }

  const validDok3Ids = new Set(
    (await getDOK3InsightsForBrainlift(brainlift.id)).map((insight) => insight.id),
  );
  const invalidIds = dok3Ids.filter((dok3Id) => !validDok3Ids.has(dok3Id));
  if (invalidIds.length > 0) {
    throw new Error(`DOK3 IDs not found in this brainlift: ${invalidIds.join(', ')}`);
  }

  if (args.newPrimaryDok3Id != null) {
    const combinedIds = new Set([...existingSpov.linkedDok3InsightIds, ...dok3Ids]);
    if (!combinedIds.has(args.newPrimaryDok3Id)) {
      throw new Error('newPrimaryDok3Id must refer to an existing or newly linked DOK3 insight');
    }
  }

  const result = await storage.addLinksToDok4Spov({
    spovId: args.spovId,
    brainliftId: brainlift.id,
    dok3Ids,
    newPrimaryDok3Id: args.newPrimaryDok3Id ?? undefined,
  });

  if (!result) {
    throw new Error('DOK4 SPOV not found');
  }

  await createVersion({
    dokLevel: 4,
    itemId: args.spovId,
    brainliftId: brainlift.id,
    textContent: result.existingItem.text,
    score: result.existingItem.score,
    feedback: null,
  });
  await pruneVersions(4, args.spovId);

  const previousEvaluation: PreviousEvaluation = {
    previousScore: result.existingItem.score ?? 0,
    previousFeedback: '',
    oldText: result.existingItem.text,
    newText: result.existingItem.text,
    editNumber: 1,
  };

  await withJob('dok4:regrade')
    .forPayload({ spovId: args.spovId, brainliftId: brainlift.id, previousEvaluation })
    .queue();

  const item = await getDokItemSnapshot(brainlift.id, 4, args.spovId);

  return {
    id: args.spovId,
    status: 'regrading' as const,
    addedLinks: result.addedCount,
    skippedLinks: dok3Ids.length - result.addedCount,
    item,
  };
}

export async function listBrainliftExperts(
  authContext: AuthContext,
  args: GetStaleItemsArgs,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'access');
  const experts = await storage.getExpertsByBrainliftId(brainlift.id);
  return {
    slug: brainlift.slug,
    experts,
  };
}

export async function createBrainliftExperts(
  authContext: AuthContext,
  args: CreateExpertArgs,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');

  const source = args.source ?? 'listed';
  const createdExperts = await storage.createExpertsForBrainlift(
    brainlift.id,
    args.experts.map((expert) => ({
      name: assertNonEmptyString(expert.name, 'experts[].name'),
      who: trimToNull(expert.who),
      why: trimToNull(expert.why),
      focus: trimToNull(expert.focus),
      where: trimToNull(expert.where),
      source,
    })),
  );

  const rerankQueued = await queueExpertsRerank(brainlift.id);

  return {
    slug: brainlift.slug,
    createdExperts,
    rerankQueued,
  };
}

export async function deleteBrainliftExpert(
  authContext: AuthContext,
  args: DeleteExpertArgs,
) {
  const brainlift = await resolveBrainlift(args.slug, authContext, 'modify');
  const deleted = await storage.deleteExpertForBrainlift(args.expertId, brainlift.id);

  if (!deleted) {
    throw new Error('Expert not found');
  }

  const rerankQueued = await queueExpertsRerank(brainlift.id);

  return {
    slug: brainlift.slug,
    expertId: args.expertId,
    deleted: true,
    rerankQueued,
  };
}
