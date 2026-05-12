import type { AuthContext, DOK3InsightStatus, DOK4SpovStatus } from '@shared/schema';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';

type GradingStatus = 'graded' | 'regrading' | 'grading' | 'error' | null;

export interface InternalBrainliftDetailResponse {
  id: number;
  slug: string;
  title: string;
  purpose: string | null;
  author: string | null;
  createdAt: string;
  experts: InternalBrainliftExpert[];
  dok1: InternalBrainliftDok1[];
  dok2: InternalBrainliftDok2[];
  dok3: InternalBrainliftDok3[];
  dok4: InternalBrainliftDok4[];
}

export interface InternalBrainliftExpert {
  id: number;
  name: string;
  who: string | null;
  focus: string | null;
  why: string | null;
  where: string | null;
  rankScore: number | null;
  rationale: string | null;
  twitterHandle: string | null;
  isFollowing: boolean;
}

export interface InternalBrainliftDok1 {
  id: number;
  originalId: string | null;
  text: string;
  category: string | null;
  source: string | null;
  note: string | null;
  grading?: {
    score: number;
    status: GradingStatus;
  } | null;
}

export interface InternalBrainliftDok2 {
  id: number;
  sourceName: string;
  sourceUrl: string | null;
  displayTitle: string | null;
  category: string | null;
  points: Array<{ id: number; text: string; sortOrder: number }>;
  linkedDok1Ids: number[];
  grading?: {
    grade: number | null;
    feedback: string | null;
    status: GradingStatus;
  } | null;
}

export interface InternalBrainliftDok3 {
  id: number;
  text: string;
  status: DOK3InsightStatus;
  frameworkName: string | null;
  frameworkDescription: string | null;
  linkedDok2Ids: number[];
  grading?: {
    score: number | null;
    rationale: string | null;
    feedback: string | null;
    criteriaBreakdown: unknown | null;
  } | null;
}

export interface InternalBrainliftDok4 {
  id: number;
  text: string;
  status: DOK4SpovStatus;
  linkedDok3Ids: number[];
  primaryDok3Id: number | null;
  positionSummary: string | null;
  grading?: {
    score: number | null;
    rationale: string | null;
    feedback: string | null;
    criteriaBreakdown: unknown | null;
    rejectionReason: string | null;
    rejectionCategory: string | null;
  } | null;
}

const INCLUDE_ALLOWLIST = new Set(['grading']);

export function parseInternalBrainliftDetailInclude(include: unknown): { includeGrading: boolean } {
  if (include == null || include === '') {
    return { includeGrading: false };
  }

  const rawValues = Array.isArray(include) ? include : [include];
  const values = rawValues
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  for (const value of values) {
    if (!INCLUDE_ALLOWLIST.has(value)) {
      throw new BadRequestError(`Unknown include value: ${value}`);
    }
  }

  return { includeGrading: values.includes('grading') };
}

function serializeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function hasAnyValue(values: unknown[]): boolean {
  return values.some((value) => value !== null && value !== undefined);
}

function mapDok1Grading(item: {
  score: number | null;
  gradingStatus?: GradingStatus;
}) {
  if (!hasAnyValue([item.score, item.gradingStatus])) return null;
  return {
    score: item.score ?? 0,
    status: item.gradingStatus ?? null,
  };
}

function mapDok2Grading(item: {
  grade: number | null;
  feedback: string | null;
  gradingStatus?: GradingStatus;
}) {
  if (!hasAnyValue([item.grade, item.feedback, item.gradingStatus])) return null;
  return {
    grade: item.grade,
    feedback: item.feedback,
    status: item.gradingStatus ?? null,
  };
}

function mapDok3Grading(item: {
  score: number | null;
  rationale: string | null;
  feedback: string | null;
  criteriaBreakdown: unknown | null;
}) {
  if (!hasAnyValue([item.score, item.rationale, item.feedback, item.criteriaBreakdown])) return null;
  return {
    score: item.score,
    rationale: item.rationale,
    feedback: item.feedback,
    criteriaBreakdown: item.criteriaBreakdown,
  };
}

function mapDok4Grading(item: {
  score: number | null;
  rationale: string | null;
  feedback: string | null;
  criteriaBreakdown: unknown | null;
  rejectionReason: string | null;
  rejectionCategory: string | null;
}) {
  if (!hasAnyValue([
    item.score,
    item.rationale,
    item.feedback,
    item.criteriaBreakdown,
    item.rejectionReason,
    item.rejectionCategory,
  ])) return null;

  return {
    score: item.score,
    rationale: item.rationale,
    feedback: item.feedback,
    criteriaBreakdown: item.criteriaBreakdown,
    rejectionReason: item.rejectionReason,
    rejectionCategory: item.rejectionCategory,
  };
}

export async function getInternalBrainliftDetailForAuthContext(
  authContext: AuthContext,
  slug: string,
  options: { includeGrading: boolean },
): Promise<InternalBrainliftDetailResponse> {
  const record = await storage.getBrainliftRecordBySlug(slug);
  if (!record) {
    throw new NotFoundError('Brainlift not found');
  }

  const hasAccess = await storage.canAccessBrainlift(record, authContext);
  if (!hasAccess) {
    throw new NotFoundError('Brainlift not found');
  }

  const detail = await storage.getBrainliftDetailById(record.id);
  if (!detail) {
    throw new NotFoundError('Brainlift not found');
  }

  const { brainlift } = detail;

  return {
    id: brainlift.id,
    slug: brainlift.slug,
    title: brainlift.title,
    purpose: brainlift.displayPurpose ?? brainlift.description ?? null,
    author: brainlift.author ?? null,
    createdAt: serializeDate(brainlift.createdAt),
    experts: detail.experts.map((expert) => ({
      id: expert.id,
      name: expert.name,
      who: expert.who ?? null,
      focus: expert.focus ?? null,
      why: expert.why ?? null,
      where: expert.where ?? null,
      rankScore: expert.rankScore ?? null,
      rationale: expert.rationale ?? null,
      twitterHandle: expert.twitterHandle ?? null,
      isFollowing: expert.isFollowing ?? false,
    })),
    dok1: detail.dok1.map((item) => ({
      id: item.id,
      originalId: item.originalId ?? null,
      text: item.fact,
      category: item.category ?? null,
      source: item.source ?? null,
      note: item.note ?? null,
      ...(options.includeGrading ? { grading: mapDok1Grading(item) } : {}),
    })),
    dok2: detail.dok2.map((item) => ({
      id: item.id,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl ?? null,
      displayTitle: item.displayTitle ?? null,
      category: item.category ?? null,
      points: item.points.map((point) => ({
        id: point.id,
        text: point.text,
        sortOrder: point.sortOrder,
      })),
      linkedDok1Ids: item.relatedFactIds,
      ...(options.includeGrading ? { grading: mapDok2Grading(item) } : {}),
    })),
    dok3: detail.dok3.map((item) => ({
      id: item.id,
      text: item.text,
      status: item.status as DOK3InsightStatus,
      frameworkName: item.frameworkName ?? null,
      frameworkDescription: item.frameworkDescription ?? null,
      linkedDok2Ids: item.linkedDok2SummaryIds,
      ...(options.includeGrading ? { grading: mapDok3Grading(item) } : {}),
    })),
    dok4: detail.dok4.map((item) => ({
      id: item.id,
      text: item.text,
      status: item.status,
      linkedDok3Ids: item.linkedDok3InsightIds,
      primaryDok3Id: item.primaryDok3InsightId,
      positionSummary: item.positionSummary ?? null,
      ...(options.includeGrading ? { grading: mapDok4Grading(item) } : {}),
    })),
  };
}
