import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { USER_ROLES, type AuthContext } from '@shared/schema';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import {
  getBrainliftProgress,
  getBrainliftScores,
  getAssessmentDOK1,
  getAssessmentDOK2,
  getAssessmentDOK3,
  getAssessmentDOK4,
  type AssessmentFilterParams,
  type BrainliftProgress,
  type BrainliftScores,
} from '../storage/internal';

const TEMPLATE_FORMAT = 'markdown' as const;
const GRADE_RETRY_AFTER_SECONDS = 30;
const STATUS_RETRY_AFTER_SECONDS = 15;
const DEFAULT_LIST_PAGE = 1;
const DEFAULT_LIST_PAGE_SIZE = 10;
const MAX_LIST_PAGE_SIZE = 20;
const DEFAULT_ASSESSMENT_PAGE = 1;
const DEFAULT_ASSESSMENT_PAGE_SIZE = 20;
const MAX_ASSESSMENT_PAGE_SIZE = 50;

export type BrainliftAssessmentSortBy = NonNullable<AssessmentFilterParams['sortBy']>;
export type BrainliftAssessmentOrder = NonNullable<AssessmentFilterParams['order']>;
export type BrainliftAssessmentStatus = 'regrading' | 'grading' | 'graded' | 'error';
export type BrainliftAssessmentDetail = 'summary' | 'full';

export interface ListBrainliftsOptions {
  page?: number;
  pageSize?: number;
}

export interface GetBrainliftAssessmentOptions {
  slug: string;
  dok: 1 | 2 | 3 | 4;
  page?: number;
  pageSize?: number;
  itemId?: number;
  sortBy?: BrainliftAssessmentSortBy;
  order?: BrainliftAssessmentOrder;
  status?: BrainliftAssessmentStatus;
  detail?: BrainliftAssessmentDetail;
}

let cachedTemplate: string | null = null;

function normalizePage(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

function normalizePageSize(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  return Math.min(max, normalizePage(value, fallback));
}

function readBrainliftTemplate(): string {
  if (cachedTemplate !== null) {
    return cachedTemplate;
  }

  const templatePath = path.resolve(process.cwd(), 'docs/brainlift-mcp-template.md');

  if (!existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  cachedTemplate = readFileSync(templatePath, 'utf-8');
  return cachedTemplate;
}

function deriveBrainliftListStatus(importStatus: string): 'grading' | 'complete' {
  return importStatus === 'complete' ? 'complete' : 'grading';
}

function deriveStatusFromProgress(
  importStatus: string,
  progress: BrainliftProgress,
): 'extracting' | 'grading' | 'complete' | 'error' {
  const totalItems = progress.dok1.total + progress.dok2.total + progress.dok3.total + progress.dok4.total;

  if (importStatus === 'pending' && totalItems === 0) {
    return 'extracting';
  }

  const totalPending = progress.dok1.pending + progress.dok2.pending + progress.dok3.pending + progress.dok4.pending;
  if (totalPending > 0) {
    return 'grading';
  }

  const totalErrors = progress.dok1.error + progress.dok2.error + progress.dok3.error + progress.dok4.error;
  if (totalErrors > 0) {
    return 'error';
  }

  return 'complete';
}

function extractBrainliftScore(summary: unknown): number | null {
  if (!summary || typeof summary !== 'object' || !('meanScore' in summary)) {
    return null;
  }

  const parsed = Number.parseFloat(String((summary as { meanScore: unknown }).meanScore));
  return Number.isFinite(parsed) ? parsed : null;
}

function createAssessmentFilters(
  options: GetBrainliftAssessmentOptions,
): AssessmentFilterParams {
  return {
    itemId: typeof options.itemId === 'number' ? Math.trunc(options.itemId) : undefined,
    sortBy: options.sortBy,
    order: options.order,
    status: options.status,
  };
}

async function resolveBrainliftForAuthContext(
  authContext: AuthContext,
  slug: string,
): Promise<NonNullable<Awaited<ReturnType<typeof storage.getBrainliftBySlug>>>> {
  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift) {
    throw new NotFoundError('Brainlift not found');
  }

  const hasAccess = await storage.canAccessBrainlift(brainlift, authContext);
  if (!hasAccess) {
    throw new NotFoundError('Brainlift not found');
  }

  return brainlift;
}

export function buildDefaultChatAuthContext(userId: string): AuthContext {
  return {
    userId,
    role: USER_ROLES.USER,
    isAdmin: false,
  };
}

export async function getBrainliftTemplatePayload(): Promise<{
  template: string;
  format: typeof TEMPLATE_FORMAT;
}> {
  return {
    template: readBrainliftTemplate(),
    format: TEMPLATE_FORMAT,
  };
}

export function buildGradingQueuedResponse(result: {
  slug: string;
  brainliftId: number;
}) {
  return {
    slug: result.slug,
    brainliftId: result.brainliftId,
    status: 'grading' as const,
    message: 'Brainlift created. Use get_brainlift_assessment to check results.',
    retryAfter: GRADE_RETRY_AFTER_SECONDS,
  };
}

export async function listBrainliftsForAuthContext(
  authContext: AuthContext,
  options: ListBrainliftsOptions = {},
) {
  const page = normalizePage(options.page, DEFAULT_LIST_PAGE);
  const pageSize = normalizePageSize(
    options.pageSize,
    DEFAULT_LIST_PAGE_SIZE,
    MAX_LIST_PAGE_SIZE,
  );
  const offset = (page - 1) * pageSize;

  const { brainlifts, total } = await storage.getBrainliftsForUserPaginated(
    authContext,
    offset,
    pageSize,
    'all',
  );

  return {
    brainlifts: brainlifts.map((brainlift) => ({
      slug: brainlift.slug,
      title: brainlift.title,
      status: deriveBrainliftListStatus(brainlift.importStatus ?? 'pending'),
      score: extractBrainliftScore(brainlift.summary),
      createdAt: brainlift.createdAt.toISOString(),
      // Access level for this user. 'owner' = full access (created by user).
      // 'editor' = full access via share (read + edit/create/delete DOK items).
      // 'viewer' = read-only via share (no mutations allowed).
      permission: deriveBrainliftPermission(brainlift, authContext.userId),
    })),
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function deriveBrainliftPermission(
  brainlift: { createdByUserId: string | null; sharePermission?: 'editor' | 'viewer' | null },
  userId: string,
): 'owner' | 'editor' | 'viewer' {
  if (brainlift.createdByUserId === userId) return 'owner';
  if (brainlift.sharePermission === 'editor') return 'editor';
  return 'viewer';
}

export async function getBrainliftStatusForAuthContext(
  authContext: AuthContext,
  slug: string,
): Promise<{
  slug: string;
  title: string;
  status: 'extracting' | 'grading' | 'complete' | 'error';
  progress: BrainliftProgress;
  score: BrainliftScores;
  retryAfter: number;
  createdAt: string;
}> {
  const brainlift = await resolveBrainliftForAuthContext(authContext, slug);

  const [progress, score] = await Promise.all([
    getBrainliftProgress(brainlift.id),
    getBrainliftScores(brainlift.id),
  ]);

  const status = deriveStatusFromProgress(brainlift.importStatus ?? 'pending', progress);

  return {
    slug: brainlift.slug,
    title: brainlift.title,
    status,
    progress,
    score,
    retryAfter: status === 'complete' ? 0 : STATUS_RETRY_AFTER_SECONDS,
    createdAt: brainlift.createdAt.toISOString(),
  };
}

export async function getBrainliftAssessmentForAuthContext(
  authContext: AuthContext,
  options: GetBrainliftAssessmentOptions,
): Promise<{
  slug: string;
  dok: 1 | 2 | 3 | 4;
  status: 'complete';
  items: unknown[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}> {
  if (options.dok < 1 || options.dok > 4) {
    throw new BadRequestError('dok parameter is required and must be 1-4');
  }

  const brainlift = await resolveBrainliftForAuthContext(authContext, options.slug);
  const page = normalizePage(options.page, DEFAULT_ASSESSMENT_PAGE);
  const pageSize = normalizePageSize(
    options.pageSize,
    DEFAULT_ASSESSMENT_PAGE_SIZE,
    MAX_ASSESSMENT_PAGE_SIZE,
  );
  const offset = (page - 1) * pageSize;
  const detail = options.detail === 'full' ? 'full' : 'summary';
  const filters = createAssessmentFilters(options);

  let result: { items: unknown[]; total: number };

  switch (options.dok) {
    case 1:
      result = await getAssessmentDOK1(brainlift.id, offset, pageSize, filters);
      break;
    case 2:
      result = await getAssessmentDOK2(brainlift.id, offset, pageSize, filters);
      break;
    case 3:
      result = await getAssessmentDOK3(brainlift.id, offset, pageSize, detail, filters);
      break;
    case 4:
      result = await getAssessmentDOK4(brainlift.id, offset, pageSize, detail, filters);
      break;
    default:
      throw new BadRequestError('Invalid DOK level');
  }

  return {
    slug: brainlift.slug,
    dok: options.dok,
    status: 'complete',
    items: result.items,
    pagination: {
      page,
      pageSize,
      totalItems: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    },
  };
}
