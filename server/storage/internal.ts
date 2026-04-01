/**
 * Internal API storage functions.
 *
 * Status queries, paginated assessment queries for the MCP internal endpoints.
 * All queries push computation to the database per CLAUDE.md guidelines.
 */

import {
  db, eq, sql,
  brainlifts, facts, factVerifications,
  dok2Summaries, dok2Points,
  dok3Insights, dok3InsightLinks,
  dok4Spovs, dok4Dok3Links,
} from './base';

// ── Types ──

export interface DOKProgress {
  total: number;
  graded: number;
  pending: number;
  error: number;
}

export interface BrainliftProgress {
  dok1: DOKProgress;
  dok2: DOKProgress;
  dok3: DOKProgress;
  dok4: DOKProgress;
}

export interface BrainliftScores {
  overall: number | null;
  dok1Mean: number | null;
  dok2Mean: number | null;
  dok3Mean: number | null;
  dok4Mean: number | null;
}

// ── Progress queries ──

/**
 * Get per-DOK grading progress counts for a brainlift.
 * Uses SQL aggregation — no rows fetched into JS.
 */
export async function getBrainliftProgress(brainliftId: number): Promise<BrainliftProgress> {
  // DOK1: facts with score > 0 are graded, score = 0 are pending
  // Facts with isGradeable = false are still counted (score stays 0)
  const [dok1] = await db.select({
    total: sql<number>`count(*)`,
    graded: sql<number>`count(*) filter (where ${facts.score} > 0)`,
    pending: sql<number>`count(*) filter (where ${facts.score} = 0 and ${facts.isGradeable} = true)`,
    error: sql<number>`0`, // DOK1 has no error state
  }).from(facts).where(eq(facts.brainliftId, brainliftId));

  // DOK2: grade IS NOT NULL means graded
  const [dok2] = await db.select({
    total: sql<number>`count(*)`,
    graded: sql<number>`count(*) filter (where ${dok2Summaries.grade} is not null)`,
    pending: sql<number>`count(*) filter (where ${dok2Summaries.grade} is null)`,
    error: sql<number>`0`, // DOK2 has no error state
  }).from(dok2Summaries).where(eq(dok2Summaries.brainliftId, brainliftId));

  // DOK3: status = 'graded' means graded, 'error' means error
  const [dok3] = await db.select({
    total: sql<number>`count(*)`,
    graded: sql<number>`count(*) filter (where ${dok3Insights.status} = 'graded')`,
    pending: sql<number>`count(*) filter (where ${dok3Insights.status} in ('pending_linking', 'linked', 'grading'))`,
    error: sql<number>`count(*) filter (where ${dok3Insights.status} = 'error')`,
  }).from(dok3Insights).where(eq(dok3Insights.brainliftId, brainliftId));

  // DOK4: status = 'graded' or 'rejected' means graded, 'error' means error
  const [dok4] = await db.select({
    total: sql<number>`count(*)`,
    graded: sql<number>`count(*) filter (where ${dok4Spovs.status} in ('graded', 'rejected'))`,
    pending: sql<number>`count(*) filter (where ${dok4Spovs.status} in ('pending_linking', 'linked', 'grading'))`,
    error: sql<number>`count(*) filter (where ${dok4Spovs.status} = 'error')`,
  }).from(dok4Spovs).where(eq(dok4Spovs.brainliftId, brainliftId));

  return {
    dok1: { total: Number(dok1.total), graded: Number(dok1.graded), pending: Number(dok1.pending), error: Number(dok1.error) },
    dok2: { total: Number(dok2.total), graded: Number(dok2.graded), pending: Number(dok2.pending), error: Number(dok2.error) },
    dok3: { total: Number(dok3.total), graded: Number(dok3.graded), pending: Number(dok3.pending), error: Number(dok3.error) },
    dok4: { total: Number(dok4.total), graded: Number(dok4.graded), pending: Number(dok4.pending), error: Number(dok4.error) },
  };
}

/**
 * Get per-DOK mean scores for a brainlift.
 * Returns null for DOK levels with no graded items.
 */
export async function getBrainliftScores(brainliftId: number): Promise<BrainliftScores> {
  // DOK1: avg of score where score > 0 (ungraded = 0 excluded)
  const [dok1Score] = await db.select({
    mean: sql<number | null>`avg(${facts.score}) filter (where ${facts.score} > 0)`,
  }).from(facts).where(eq(facts.brainliftId, brainliftId));

  // DOK2: avg of grade where grade is not null
  const [dok2Score] = await db.select({
    mean: sql<number | null>`avg(${dok2Summaries.grade})`,
  }).from(dok2Summaries).where(eq(dok2Summaries.brainliftId, brainliftId));

  // DOK3: avg of score where status = 'graded'
  const [dok3Score] = await db.select({
    mean: sql<number | null>`avg(${dok3Insights.score}) filter (where ${dok3Insights.status} = 'graded')`,
  }).from(dok3Insights).where(eq(dok3Insights.brainliftId, brainliftId));

  // DOK4: avg of score where status = 'graded' (rejected excluded)
  const [dok4Score] = await db.select({
    mean: sql<number | null>`avg(${dok4Spovs.score}) filter (where ${dok4Spovs.status} = 'graded')`,
  }).from(dok4Spovs).where(eq(dok4Spovs.brainliftId, brainliftId));

  const dok1Mean = dok1Score.mean !== null ? Number(Number(dok1Score.mean).toFixed(2)) : null;
  const dok2Mean = dok2Score.mean !== null ? Number(Number(dok2Score.mean).toFixed(2)) : null;
  const dok3Mean = dok3Score.mean !== null ? Number(Number(dok3Score.mean).toFixed(2)) : null;
  const dok4Mean = dok4Score.mean !== null ? Number(Number(dok4Score.mean).toFixed(2)) : null;

  // Overall = average of non-null DOK means
  const means = [dok1Mean, dok2Mean, dok3Mean, dok4Mean].filter((m): m is number => m !== null);
  const overall = means.length > 0 ? Number((means.reduce((a, b) => a + b, 0) / means.length).toFixed(2)) : null;

  return { overall, dok1Mean, dok2Mean, dok3Mean, dok4Mean };
}

// ── Assessment queries ──

/**
 * Get paginated DOK1 assessment items.
 */
export async function getAssessmentDOK1(
  brainliftId: number,
  offset: number,
  limit: number,
): Promise<{ items: any[]; total: number }> {
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(facts)
    .where(eq(facts.brainliftId, brainliftId));

  const rows = await db
    .select({
      id: facts.id,
      fact: facts.fact,
      source: facts.source,
      category: facts.category,
      score: facts.score,
      note: facts.note,
      isGradeable: facts.isGradeable,
    })
    .from(facts)
    .where(eq(facts.brainliftId, brainliftId))
    .orderBy(facts.id)
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map(r => ({
      id: r.id,
      fact: r.fact,
      source: r.source,
      sourceUrl: null, // Facts don't have sourceUrl directly
      category: r.category,
      score: r.score,
      note: r.note,
    })),
    total: Number(countResult.count),
  };
}

/**
 * Get paginated DOK2 assessment items with flattened points.
 */
export async function getAssessmentDOK2(
  brainliftId: number,
  offset: number,
  limit: number,
): Promise<{ items: any[]; total: number }> {
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(dok2Summaries)
    .where(eq(dok2Summaries.brainliftId, brainliftId));

  const summaries = await db
    .select({
      id: dok2Summaries.id,
      displayTitle: dok2Summaries.displayTitle,
      sourceName: dok2Summaries.sourceName,
      grade: dok2Summaries.grade,
      diagnosis: dok2Summaries.diagnosis,
      feedback: dok2Summaries.feedback,
      failReason: dok2Summaries.failReason,
    })
    .from(dok2Summaries)
    .where(eq(dok2Summaries.brainliftId, brainliftId))
    .orderBy(dok2Summaries.id)
    .limit(limit)
    .offset(offset);

  // Batch-fetch points for all summaries in this page
  const summaryIds = summaries.map(s => s.id);
  let pointsMap = new Map<number, string[]>();
  if (summaryIds.length > 0) {
    const points = await db
      .select({
        summaryId: dok2Points.summaryId,
        text: dok2Points.text,
      })
      .from(dok2Points)
      .where(sql`${dok2Points.summaryId} IN (${sql.join(summaryIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(dok2Points.sortOrder);

    for (const p of points) {
      if (!pointsMap.has(p.summaryId)) pointsMap.set(p.summaryId, []);
      pointsMap.get(p.summaryId)!.push(p.text);
    }
  }

  return {
    items: summaries.map(s => ({
      id: s.id,
      displayTitle: s.displayTitle,
      sourceName: s.sourceName,
      points: pointsMap.get(s.id) || [],
      grade: s.grade,
      diagnosis: s.diagnosis,
      feedback: s.feedback,
      failReason: s.failReason,
    })),
    total: Number(countResult.count),
  };
}

/**
 * Get paginated DOK3 assessment items with linked source names.
 */
export async function getAssessmentDOK3(
  brainliftId: number,
  offset: number,
  limit: number,
  detail: 'summary' | 'full' = 'summary',
): Promise<{ items: any[]; total: number }> {
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(dok3Insights)
    .where(eq(dok3Insights.brainliftId, brainliftId));

  const insights = await db
    .select({
      id: dok3Insights.id,
      text: dok3Insights.text,
      status: dok3Insights.status,
      score: dok3Insights.score,
      rationale: dok3Insights.rationale,
      feedback: dok3Insights.feedback,
      foundationIntegrityIndex: dok3Insights.foundationIntegrityIndex,
      criteriaBreakdown: dok3Insights.criteriaBreakdown,
      traceabilityFlagged: dok3Insights.traceabilityFlagged,
      traceabilityFlaggedSource: dok3Insights.traceabilityFlaggedSource,
      linkingFlagged: dok3Insights.linkingFlagged,
    })
    .from(dok3Insights)
    .where(eq(dok3Insights.brainliftId, brainliftId))
    .orderBy(dok3Insights.id)
    .limit(limit)
    .offset(offset);

  // Batch-fetch linked source names
  const insightIds = insights.map(i => i.id);
  let sourcesMap = new Map<number, string[]>();
  if (insightIds.length > 0) {
    const links = await db
      .select({
        insightId: dok3InsightLinks.insightId,
        sourceName: dok2Summaries.sourceName,
      })
      .from(dok3InsightLinks)
      .innerJoin(dok2Summaries, eq(dok3InsightLinks.dok2SummaryId, dok2Summaries.id))
      .where(sql`${dok3InsightLinks.insightId} IN (${sql.join(insightIds.map(id => sql`${id}`), sql`, `)})`);

    for (const l of links) {
      if (!sourcesMap.has(l.insightId)) sourcesMap.set(l.insightId, []);
      sourcesMap.get(l.insightId)!.push(l.sourceName);
    }
  }

  return {
    items: insights.map(i => {
      const base: Record<string, any> = {
        id: i.id,
        text: i.text,
        status: i.status,
        score: i.score,
        rationale: i.rationale,
        feedback: i.feedback,
        foundationIntegrityIndex: i.foundationIntegrityIndex,
        linkedSources: sourcesMap.get(i.id) || [],
        criteriaSummary: summarizeCriteria(i.criteriaBreakdown as Record<string, any> | null),
      };
      if (detail === 'full') {
        base.criteriaBreakdown = i.criteriaBreakdown;
        base.traceabilityFlagged = i.traceabilityFlagged;
        base.traceabilityFlaggedSource = i.traceabilityFlaggedSource;
        base.linkingFlagged = i.linkingFlagged;
      }
      return base;
    }),
    total: Number(countResult.count),
  };
}

/**
 * Get paginated DOK4 assessment items with linked insight texts.
 */
export async function getAssessmentDOK4(
  brainliftId: number,
  offset: number,
  limit: number,
  detail: 'summary' | 'full' = 'summary',
): Promise<{ items: any[]; total: number }> {
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(dok4Spovs)
    .where(eq(dok4Spovs.brainliftId, brainliftId));

  const spovs = await db
    .select({
      id: dok4Spovs.id,
      text: dok4Spovs.text,
      status: dok4Spovs.status,
      score: dok4Spovs.score,
      rationale: dok4Spovs.rationale,
      feedback: dok4Spovs.feedback,
      rejectionReason: dok4Spovs.rejectionReason,
      rejectionCategory: dok4Spovs.rejectionCategory,
      criteriaBreakdown: dok4Spovs.criteriaBreakdown,
      antimemeticAssessment: dok4Spovs.antimemeticAssessment,
      positionSummary: dok4Spovs.positionSummary,
      vulnerabilityPoints: dok4Spovs.vulnerabilityPoints,
      divergenceQuestion: dok4Spovs.divergenceQuestion,
      divergenceVanillaResponse: dok4Spovs.divergenceVanillaResponse,
    })
    .from(dok4Spovs)
    .where(eq(dok4Spovs.brainliftId, brainliftId))
    .orderBy(dok4Spovs.id)
    .limit(limit)
    .offset(offset);

  // Batch-fetch linked insight texts
  const spovIds = spovs.map(s => s.id);
  let insightsMap = new Map<number, string[]>();
  if (spovIds.length > 0) {
    const links = await db
      .select({
        spovId: dok4Dok3Links.spovId,
        insightText: dok3Insights.text,
      })
      .from(dok4Dok3Links)
      .innerJoin(dok3Insights, eq(dok4Dok3Links.dok3InsightId, dok3Insights.id))
      .where(sql`${dok4Dok3Links.spovId} IN (${sql.join(spovIds.map(id => sql`${id}`), sql`, `)})`);

    for (const l of links) {
      if (!insightsMap.has(l.spovId)) insightsMap.set(l.spovId, []);
      // Abbreviate insight text to 100 chars for agent context efficiency
      const abbreviated = l.insightText.length > 100 ? l.insightText.substring(0, 100) + '...' : l.insightText;
      insightsMap.get(l.spovId)!.push(abbreviated);
    }
  }

  return {
    items: spovs.map(s => {
      const base: Record<string, any> = {
        id: s.id,
        text: s.text,
        status: s.status,
        score: s.score,
        rationale: s.rationale,
        feedback: s.feedback,
        rejectionReason: s.rejectionReason,
        rejectionCategory: s.rejectionCategory,
        linkedInsights: insightsMap.get(s.id) || [],
        criteriaSummary: summarizeCriteria(s.criteriaBreakdown as Record<string, any> | null),
      };
      if (detail === 'full') {
        base.criteriaBreakdown = s.criteriaBreakdown;
        base.antimemeticAssessment = s.antimemeticAssessment;
        base.positionSummary = s.positionSummary;
        base.vulnerabilityPoints = s.vulnerabilityPoints;
        base.divergenceQuestion = s.divergenceQuestion;
        base.divergenceVanillaResponse = s.divergenceVanillaResponse;
      }
      return base;
    }),
    total: Number(countResult.count),
  };
}

// ── Helpers ──

/**
 * Summarize criteria breakdown into a short string for summary detail level.
 * Returns null if no breakdown available.
 */
function summarizeCriteria(breakdown: Record<string, any> | null): string | null {
  if (!breakdown || typeof breakdown !== 'object') return null;

  const entries = Object.entries(breakdown);
  if (entries.length === 0) return null;

  // Sort by assessment quality indicator (simple heuristic)
  const scored = entries
    .map(([key, value]) => ({
      key,
      assessment: typeof value === 'object' && value?.assessment ? String(value.assessment) : '',
    }))
    .filter(e => e.assessment.length > 0);

  if (scored.length === 0) return null;

  // Return abbreviated list of criteria
  return scored.map(s => `${s.key}: ${s.assessment.substring(0, 50)}`).join('; ');
}
