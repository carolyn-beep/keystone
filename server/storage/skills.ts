import { lt, ne, type SQL } from 'drizzle-orm';
import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  skillResources,
  skillShares,
  skillUserDisabled,
  skills,
  sql,
  user,
  type AuthContext,
  type Skill,
  type SkillResource,
  type SkillVisibility,
} from './base';
import { getUserByEmailOrUsername } from './shares';

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_BODY_LENGTH = 100 * 1024;
const MAX_REFERENCES = 20;
const MAX_REFERENCE_CONTENT_LENGTH = 50 * 1024;
const TRASH_RETENTION_DAYS = 30;

export interface SkillReferenceInput {
  path: string;
  content: string;
}

export interface SaveSkillInput {
  name: string;
  description: string;
  body: string;
  visibility?: SkillVisibility;
  references?: SkillReferenceInput[];
  shareIdentifiers?: string[];
}

export interface SkillReferenceItem {
  id: number;
  path: string;
  content: string;
}

export interface SkillShareListItem {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  createdByUserId: string;
  createdAt: Date;
}

export interface SkillListItem {
  id: number;
  name: string;
  description: string;
  visibility: SkillVisibility;
  enabled: boolean;
  createdByUserId: string;
  createdByName: string;
  lastEditedByUserId: string | null;
  lastEditedByName: string | null;
  lastEditedAt: Date | null;
  referenceCount: number;
  isCreatedByMe: boolean;
}

export interface SkillDetail extends SkillListItem {
  body: string;
  references: SkillReferenceItem[];
  shares: SkillShareListItem[];
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeletedSkillListItem {
  id: number;
  name: string;
  description: string;
  visibility: SkillVisibility;
  deletedAt: Date;
  deletedByUserId: string | null;
  deletedByName: string;
  daysUntilPurge: number;
}

interface NormalizedSaveSkillInput {
  name: string;
  description: string;
  body: string;
  visibility: SkillVisibility;
  references?: SkillReferenceInput[];
  shareIdentifiers?: string[];
}

interface SkillListRow {
  id: number;
  name: string;
  description: string;
  body: string;
  visibility: SkillVisibility;
  createdByUserId: string;
  lastEditedByUserId: string | null;
  lastEditedAt: Date | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  enabled: boolean;
  createdByName: string | null;
  lastEditedByName: string | null;
  referenceCount: number;
}

function assertAdmin(auth: AuthContext): void {
  if (!auth.isAdmin) {
    throw new Error('Admin access required');
  }
}

function normalizeSkillName(value: string): string {
  const name = value.trim();
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error('Skill name must be lowercase kebab-case and start with a letter or number');
  }
  return name;
}

function normalizeVisibility(value: SkillVisibility | undefined): SkillVisibility {
  if (value == null) {
    return 'public';
  }
  if (value !== 'public' && value !== 'private') {
    throw new Error('Skill visibility must be public or private');
  }
  return value;
}

function normalizeReferences(references: SkillReferenceInput[] | undefined): SkillReferenceInput[] | undefined {
  if (references == null) {
    return undefined;
  }
  if (references.length > MAX_REFERENCES) {
    throw new Error(`Skills may include at most ${MAX_REFERENCES} references`);
  }

  const seenPaths = new Set<string>();
  return references.map((reference) => {
    const path = reference.path.trim();
    const content = reference.content;
    if (!path.startsWith('references/')) {
      throw new Error('Reference path must start with references/');
    }
    if (path.includes('..') || path.split('/').some((segment) => segment.length === 0)) {
      throw new Error('Reference path must not contain empty segments or ..');
    }
    if (seenPaths.has(path)) {
      throw new Error(`Duplicate reference path: ${path}`);
    }
    if (content.length > MAX_REFERENCE_CONTENT_LENGTH) {
      throw new Error(`Reference content must be ${MAX_REFERENCE_CONTENT_LENGTH} characters or fewer`);
    }
    seenPaths.add(path);
    return { path, content };
  });
}

function normalizeShareIdentifiers(shareIdentifiers: string[] | undefined): string[] | undefined {
  if (shareIdentifiers == null) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const identifier of shareIdentifiers) {
    const trimmed = identifier.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeSaveInput(input: SaveSkillInput): NormalizedSaveSkillInput {
  const description = input.description.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Skill description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`);
  }
  if (input.body.length > MAX_BODY_LENGTH) {
    throw new Error(`Skill body must be ${MAX_BODY_LENGTH} characters or fewer`);
  }

  return {
    name: normalizeSkillName(input.name),
    description,
    body: input.body,
    visibility: normalizeVisibility(input.visibility),
    references: normalizeReferences(input.references),
    shareIdentifiers: normalizeShareIdentifiers(input.shareIdentifiers),
  };
}

async function resolveShareUserIds(shareIdentifiers: string[] | undefined): Promise<string[] | undefined> {
  if (shareIdentifiers == null) {
    return undefined;
  }

  const userIds: string[] = [];
  const seenUserIds = new Set<string>();
  for (const identifier of shareIdentifiers) {
    const foundUser = await getUserByEmailOrUsername(identifier);
    if (!foundUser) {
      throw new Error(`Share user not found: ${identifier}`);
    }
    if (!seenUserIds.has(foundUser.id)) {
      seenUserIds.add(foundUser.id);
      userIds.push(foundUser.id);
    }
  }
  return userIds;
}

function skillAccessConditions(auth: AuthContext, options?: {
  includeDisabled?: boolean;
  includeDeleted?: boolean;
  createdByMe?: boolean;
}): SQL[] {
  const conditions: SQL[] = [];

  if (!options?.includeDeleted) {
    conditions.push(isNull(skills.deletedAt));
  }

  if (options?.createdByMe) {
    conditions.push(eq(skills.createdByUserId, auth.userId));
  }

  if (!auth.isAdmin) {
    conditions.push(or(
      eq(skills.visibility, 'public'),
      eq(skills.createdByUserId, auth.userId),
      sql`exists (
        select 1 from ${skillShares}
        where ${skillShares.skillId} = ${skills.id}
          and ${skillShares.userId} = ${auth.userId}
      )`,
    )!);
  }

  if (!options?.includeDisabled) {
    conditions.push(sql`not exists (
      select 1 from ${skillUserDisabled}
      where ${skillUserDisabled.skillId} = ${skills.id}
        and ${skillUserDisabled.userId} = ${auth.userId}
    )`);
  }

  return conditions;
}

function displayName(name: string | null): string {
  return name?.trim() || 'Unknown';
}

function mapSkillRow(row: SkillListRow, auth: AuthContext): SkillListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    enabled: row.enabled,
    createdByUserId: row.createdByUserId,
    createdByName: displayName(row.createdByName),
    lastEditedByUserId: row.lastEditedByUserId,
    lastEditedByName: row.lastEditedByUserId ? displayName(row.lastEditedByName) : null,
    lastEditedAt: row.lastEditedAt,
    referenceCount: row.referenceCount,
    isCreatedByMe: row.createdByUserId === auth.userId,
  };
}

function baseSkillSelect(auth: AuthContext) {
  return {
    id: skills.id,
    name: skills.name,
    description: skills.description,
    body: skills.body,
    visibility: skills.visibility,
    createdByUserId: skills.createdByUserId,
    lastEditedByUserId: skills.lastEditedByUserId,
    lastEditedAt: skills.lastEditedAt,
    deletedAt: skills.deletedAt,
    deletedByUserId: skills.deletedByUserId,
    createdAt: skills.createdAt,
    updatedAt: skills.updatedAt,
    enabled: sql<boolean>`not exists (
      select 1 from ${skillUserDisabled}
      where ${skillUserDisabled.skillId} = ${skills.id}
        and ${skillUserDisabled.userId} = ${auth.userId}
    )`,
    createdByName: sql<string | null>`(
      select ${user.name} from ${user}
      where ${user.id} = ${skills.createdByUserId}
    )`,
    lastEditedByName: sql<string | null>`(
      select ${user.name} from ${user}
      where ${user.id} = ${skills.lastEditedByUserId}
    )`,
    referenceCount: sql<number>`(
      select count(*)::int from skill_resources
      where skill_resources.skill_id = skills.id
    )`,
  };
}

async function hydrateSkillDetail(row: SkillListRow, auth: AuthContext): Promise<SkillDetail> {
  const [references, shares] = await Promise.all([
    db
      .select({
        id: skillResources.id,
        path: skillResources.path,
        content: skillResources.content,
      })
      .from(skillResources)
      .where(eq(skillResources.skillId, row.id))
      .orderBy(asc(skillResources.path)),
    listSharesForSkill(row.id),
  ]);

  return {
    ...mapSkillRow(row, auth),
    body: row.body,
    references,
    shares,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listSharesForSkill(skillId: number): Promise<SkillShareListItem[]> {
  return db
    .select({
      id: skillShares.id,
      userId: skillShares.userId,
      userName: user.name,
      userEmail: user.email,
      createdByUserId: skillShares.createdByUserId,
      createdAt: skillShares.createdAt,
    })
    .from(skillShares)
    .innerJoin(user, eq(user.id, skillShares.userId))
    .where(eq(skillShares.skillId, skillId))
    .orderBy(asc(user.name), asc(user.email))
    .then((rows) => rows.map((row) => ({
      ...row,
      userName: displayName(row.userName),
      userEmail: row.userEmail,
    })));
}

async function findSkillByName(name: string, includeDeleted = false): Promise<Skill | null> {
  const conditions = [eq(skills.name, name)];
  if (!includeDeleted) {
    conditions.push(isNull(skills.deletedAt));
  }

  const [skill] = await db
    .select()
    .from(skills)
    .where(and(...conditions))
    .limit(1);

  return skill ?? null;
}

async function assertNameAvailable(name: string, existingSkillId?: number): Promise<void> {
  const [existing] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(existingSkillId == null ? eq(skills.name, name) : and(eq(skills.name, name), ne(skills.id, existingSkillId)))
    .limit(1);

  if (existing) {
    throw new Error(`Skill name already exists: ${name}`);
  }
}

function referencesChanged(existing: SkillResource[], next: SkillReferenceInput[] | undefined): boolean {
  if (next == null) {
    return false;
  }

  const existingComparable = existing
    .map((reference) => ({ path: reference.path, content: reference.content }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const nextComparable = [...next].sort((left, right) => left.path.localeCompare(right.path));
  return JSON.stringify(existingComparable) !== JSON.stringify(nextComparable);
}

async function replaceReferences(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  skillId: number,
  references: SkillReferenceInput[],
): Promise<void> {
  await tx.delete(skillResources).where(eq(skillResources.skillId, skillId));
  if (references.length === 0) {
    return;
  }

  await tx.insert(skillResources).values(references.map((reference) => ({
    skillId,
    path: reference.path,
    content: reference.content,
  })));
}

async function replaceShares(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  skillId: number,
  createdByUserId: string,
  shareUserIds: string[],
): Promise<void> {
  await tx.delete(skillShares).where(eq(skillShares.skillId, skillId));
  if (shareUserIds.length === 0) {
    return;
  }

  await tx.insert(skillShares).values(shareUserIds.map((userId) => ({
    skillId,
    userId,
    createdByUserId,
  })));
  await tx
    .delete(skillUserDisabled)
    .where(and(
      eq(skillUserDisabled.skillId, skillId),
      inArray(skillUserDisabled.userId, shareUserIds),
    ));
}

export async function listSkillsForUser(
  auth: AuthContext,
  options?: { includeDisabled?: boolean; createdByMe?: boolean },
): Promise<SkillListItem[]> {
  const conditions = skillAccessConditions(auth, options);
  const rows = await db
    .select(baseSkillSelect(auth))
    .from(skills)
    .where(and(...conditions))
    .orderBy(asc(skills.name));

  return rows.map((row) => mapSkillRow(row, auth));
}

export async function getSkillForUserByName(
  auth: AuthContext,
  name: string,
  options?: { includeDisabled?: boolean },
): Promise<SkillDetail | null> {
  const normalizedName = normalizeSkillName(name);
  const conditions = [
    eq(skills.name, normalizedName),
    ...skillAccessConditions(auth, options),
  ];

  const [row] = await db
    .select(baseSkillSelect(auth))
    .from(skills)
    .where(and(...conditions))
    .limit(1);

  return row ? hydrateSkillDetail(row, auth) : null;
}

export async function createSkill(auth: AuthContext, input: SaveSkillInput): Promise<SkillDetail> {
  assertAdmin(auth);
  const normalized = normalizeSaveInput(input);
  const shareUserIds = await resolveShareUserIds(normalized.shareIdentifiers ?? []);
  await assertNameAvailable(normalized.name);

  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const [skill] = await tx
      .insert(skills)
      .values({
        name: normalized.name,
        description: normalized.description,
        body: normalized.body,
        visibility: normalized.visibility,
        createdByUserId: auth.userId,
        lastEditedByUserId: auth.userId,
        lastEditedAt: now,
      })
      .returning();

    await replaceReferences(tx, skill.id, normalized.references ?? []);
    await replaceShares(tx, skill.id, auth.userId, shareUserIds ?? []);
    await tx
      .delete(skillUserDisabled)
      .where(and(
        eq(skillUserDisabled.skillId, skill.id),
        eq(skillUserDisabled.userId, auth.userId),
      ));

    return skill;
  });

  const detail = await getSkillForUserByName(auth, created.name, { includeDisabled: true });
  if (!detail) {
    throw new Error('Created skill could not be loaded');
  }
  return detail;
}

export async function updateSkill(
  auth: AuthContext,
  currentName: string,
  input: SaveSkillInput,
): Promise<SkillDetail | null> {
  assertAdmin(auth);
  const normalizedCurrentName = normalizeSkillName(currentName);
  const normalized = normalizeSaveInput(input);
  const shareUserIds = await resolveShareUserIds(normalized.shareIdentifiers);
  const current = await findSkillByName(normalizedCurrentName);
  if (!current) {
    return null;
  }
  await assertNameAvailable(normalized.name, current.id);

  const existingReferences = await db
    .select()
    .from(skillResources)
    .where(eq(skillResources.skillId, current.id));

  const shouldBumpLastEdited =
    current.name !== normalized.name ||
    current.description !== normalized.description ||
    current.body !== normalized.body ||
    current.visibility !== normalized.visibility ||
    referencesChanged(existingReferences, normalized.references);

  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    const [skill] = await tx
      .update(skills)
      .set({
        name: normalized.name,
        description: normalized.description,
        body: normalized.body,
        visibility: normalized.visibility,
        ...(shouldBumpLastEdited ? {
          lastEditedByUserId: auth.userId,
          lastEditedAt: now,
        } : {}),
      })
      .where(eq(skills.id, current.id))
      .returning();

    if (normalized.references != null) {
      await replaceReferences(tx, current.id, normalized.references);
    }

    if (shareUserIds != null) {
      await replaceShares(tx, current.id, auth.userId, shareUserIds);
    }

    await tx
      .delete(skillUserDisabled)
      .where(and(
        eq(skillUserDisabled.skillId, current.id),
        eq(skillUserDisabled.userId, auth.userId),
      ));

    return [skill];
  });

  if (!updated) {
    return null;
  }

  return getSkillForUserByName(auth, updated.name, { includeDisabled: true });
}

export async function setSkillEnabledForUser(
  auth: AuthContext,
  name: string,
  enabled: boolean,
): Promise<boolean> {
  const detail = await getSkillForUserByName(auth, name, { includeDisabled: true });
  if (!detail) {
    return false;
  }

  if (enabled) {
    await db
      .delete(skillUserDisabled)
      .where(and(
        eq(skillUserDisabled.skillId, detail.id),
        eq(skillUserDisabled.userId, auth.userId),
      ));
    return true;
  }

  await db
    .insert(skillUserDisabled)
    .values({
      skillId: detail.id,
      userId: auth.userId,
    })
    .onConflictDoNothing({
      target: [skillUserDisabled.userId, skillUserDisabled.skillId],
    });
  return true;
}

export async function grantSkillShare(
  auth: AuthContext,
  skillName: string,
  identifier: string,
): Promise<SkillShareListItem> {
  assertAdmin(auth);
  const normalizedName = normalizeSkillName(skillName);
  const skill = await findSkillByName(normalizedName);
  if (!skill) {
    throw new Error('Skill not found');
  }
  if (skill.visibility !== 'private') {
    throw new Error('Skill shares can only be granted for private skills');
  }

  const foundUser = await getUserByEmailOrUsername(identifier.trim());
  if (!foundUser) {
    throw new Error(`Share user not found: ${identifier}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(skillShares)
      .values({
        skillId: skill.id,
        userId: foundUser.id,
        createdByUserId: auth.userId,
      })
      .onConflictDoNothing({
        target: [skillShares.skillId, skillShares.userId],
      });

    await tx
      .delete(skillUserDisabled)
      .where(and(
        eq(skillUserDisabled.skillId, skill.id),
        eq(skillUserDisabled.userId, foundUser.id),
      ));
  });

  const shares = await listSharesForSkill(skill.id);
  const share = shares.find((candidate) => candidate.userId === foundUser.id);
  if (!share) {
    throw new Error('Created share could not be loaded');
  }
  return share;
}

export async function revokeSkillShare(
  auth: AuthContext,
  skillName: string,
  shareId: number,
): Promise<boolean> {
  assertAdmin(auth);
  const normalizedName = normalizeSkillName(skillName);
  const skill = await findSkillByName(normalizedName);
  if (!skill) {
    return false;
  }

  const [deleted] = await db
    .delete(skillShares)
    .where(and(
      eq(skillShares.id, shareId),
      eq(skillShares.skillId, skill.id),
    ))
    .returning({ id: skillShares.id });

  return !!deleted;
}

export async function softDeleteSkill(auth: AuthContext, name: string): Promise<boolean> {
  assertAdmin(auth);
  const normalizedName = normalizeSkillName(name);
  const [deleted] = await db
    .update(skills)
    .set({
      deletedAt: new Date(),
      deletedByUserId: auth.userId,
    })
    .where(and(eq(skills.name, normalizedName), isNull(skills.deletedAt)))
    .returning({ id: skills.id });

  return !!deleted;
}

export async function restoreSkill(auth: AuthContext, name: string): Promise<boolean> {
  assertAdmin(auth);
  const normalizedName = normalizeSkillName(name);
  const [restored] = await db
    .update(skills)
    .set({
      deletedAt: null,
      deletedByUserId: null,
    })
    .where(and(eq(skills.name, normalizedName), isNotNull(skills.deletedAt)))
    .returning({ id: skills.id });

  return !!restored;
}

export async function listDeletedSkills(auth: AuthContext): Promise<DeletedSkillListItem[]> {
  assertAdmin(auth);
  const rows = await db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      visibility: skills.visibility,
      deletedAt: skills.deletedAt,
      deletedByUserId: skills.deletedByUserId,
      deletedByName: sql<string | null>`(
        select ${user.name} from ${user}
        where ${user.id} = ${skills.deletedByUserId}
      )`,
    })
    .from(skills)
    .where(isNotNull(skills.deletedAt))
    .orderBy(desc(skills.deletedAt), asc(skills.name));

  const now = Date.now();
  return rows
    .filter((row): row is typeof row & { deletedAt: Date } => row.deletedAt != null)
    .map((row) => {
      const ageMs = now - row.deletedAt.getTime();
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        visibility: row.visibility,
        deletedAt: row.deletedAt,
        deletedByUserId: row.deletedByUserId,
        deletedByName: displayName(row.deletedByName),
        daysUntilPurge: Math.max(0, TRASH_RETENTION_DAYS - ageDays),
      };
    });
}

export async function hardDeleteExpiredDeletedSkills(cutoff: Date): Promise<number> {
  const deleted = await db
    .delete(skills)
    .where(and(isNotNull(skills.deletedAt), lt(skills.deletedAt, cutoff)))
    .returning({ id: skills.id });

  return deleted.length;
}
