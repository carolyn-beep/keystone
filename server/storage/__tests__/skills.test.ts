import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  skillResources,
  skillShares,
  skillUserDisabled,
  skills,
  user,
  type AuthContext,
} from '@shared/schema';
import {
  createSkill,
  getSkillForUserByName,
  grantSkillShare,
  hardDeleteExpiredDeletedSkills,
  listDeletedSkills,
  listSkillsForUser,
  restoreSkill,
  revokeSkillShare,
  setSkillEnabledForUser,
  softDeleteSkill,
  updateSkill,
} from '../skills';

const RUN_ID = Date.now();
const NAME_PREFIX = `skills-test-${RUN_ID}`;

const ADMIN_ID = `${NAME_PREFIX}-admin`;
const CREATOR_ID = `${NAME_PREFIX}-creator`;
const RECIPIENT_ID = `${NAME_PREFIX}-recipient`;
const OTHER_ID = `${NAME_PREFIX}-other`;

const adminAuth: AuthContext = { userId: ADMIN_ID, role: 'admin', isAdmin: true };
const creatorAuth: AuthContext = { userId: CREATOR_ID, role: 'user', isAdmin: false };
const recipientAuth: AuthContext = { userId: RECIPIENT_ID, role: 'user', isAdmin: false };
const otherAuth: AuthContext = { userId: OTHER_ID, role: 'user', isAdmin: false };

function skillName(suffix: string): string {
  return `${NAME_PREFIX}-${suffix}`;
}

async function childCounts(skillId: number) {
  const [resourceCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skillResources)
    .where(eq(skillResources.skillId, skillId));
  const [shareCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skillShares)
    .where(eq(skillShares.skillId, skillId));
  const [disabledCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skillUserDisabled)
    .where(eq(skillUserDisabled.skillId, skillId));

  return {
    resources: resourceCount?.count ?? 0,
    shares: shareCount?.count ?? 0,
    disabled: disabledCount?.count ?? 0,
  };
}

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: ADMIN_ID,
      name: 'Skills Admin',
      email: `${ADMIN_ID}@test.dev`,
      emailVerified: false,
      role: 'admin',
    },
    {
      id: CREATOR_ID,
      name: 'Skills Creator',
      email: `${CREATOR_ID}@test.dev`,
      emailVerified: false,
      role: 'user',
    },
    {
      id: RECIPIENT_ID,
      name: 'Skills Recipient',
      email: `${RECIPIENT_ID}@test.dev`,
      emailVerified: false,
      role: 'user',
    },
    {
      id: OTHER_ID,
      name: 'Skills Other',
      email: `${OTHER_ID}@test.dev`,
      emailVerified: false,
      role: 'user',
    },
  ]);
});

beforeEach(async () => {
  await db.delete(skills).where(sql`${skills.name} LIKE ${`${NAME_PREFIX}-%`}`);
});

afterAll(async () => {
  await db.delete(skills).where(sql`${skills.name} LIKE ${`${NAME_PREFIX}-%`}`).catch(() => undefined);
  await db.delete(user).where(inArray(user.id, [ADMIN_ID, CREATOR_ID, RECIPIENT_ID, OTHER_ID])).catch(() => undefined);
});

describe('skill storage', () => {
  it('creates normalized skill rows and hard purge cascades dependent rows (FR1, FR4)', async () => {
    const skill = await createSkill(adminAuth, {
      name: skillName('cascade'),
      description: 'Cascading test skill',
      body: 'Use this body.',
      visibility: 'private',
      references: [{ path: 'references/guide.md', content: 'Guide content' }],
      shareIdentifiers: [`${RECIPIENT_ID}@test.dev`],
    });

    await setSkillEnabledForUser(recipientAuth, skill.name, false);
    expect(await childCounts(skill.id)).toEqual({ resources: 1, shares: 1, disabled: 1 });

    await expect(softDeleteSkill(adminAuth, skill.name)).resolves.toBe(true);
    await expect(createSkill(adminAuth, {
      name: skill.name,
      description: 'Name remains reserved',
      body: 'Body',
    })).rejects.toThrow(/already exists/i);

    await db
      .update(skills)
      .set({ deletedAt: new Date('2026-03-01T00:00:00.000Z') })
      .where(eq(skills.id, skill.id));

    await expect(hardDeleteExpiredDeletedSkills(new Date('2026-04-01T00:00:00.000Z'))).resolves.toBe(1);
    expect(await childCounts(skill.id)).toEqual({ resources: 0, shares: 0, disabled: 0 });
  });

  it('lists and loads skills through one authorization and disabled-state predicate (FR2)', async () => {
    const publicSkill = await createSkill(adminAuth, {
      name: skillName('public'),
      description: 'Public skill',
      body: 'Public body',
    });
    const privateShared = await createSkill(adminAuth, {
      name: skillName('shared'),
      description: 'Shared private skill',
      body: 'Private body',
      visibility: 'private',
      shareIdentifiers: [`${RECIPIENT_ID}@test.dev`],
    });
    await createSkill(adminAuth, {
      name: skillName('unshared'),
      description: 'Unshared private skill',
      body: 'Secret body',
      visibility: 'private',
    });
    const creatorOwned = await createSkill({ ...creatorAuth, isAdmin: true, role: 'admin' }, {
      name: skillName('creator-owned'),
      description: 'Creator private skill',
      body: 'Creator body',
      visibility: 'private',
    });

    await setSkillEnabledForUser(recipientAuth, publicSkill.name, false);

    const promptList = await listSkillsForUser(recipientAuth);
    expect(promptList.map((item) => item.name).sort()).toEqual([privateShared.name].sort());

    const uiList = await listSkillsForUser(recipientAuth, { includeDisabled: true });
    expect(uiList.find((item) => item.name === publicSkill.name)?.enabled).toBe(false);
    expect(uiList.find((item) => item.name === privateShared.name)?.enabled).toBe(true);
    expect(uiList.some((item) => item.name === skillName('unshared'))).toBe(false);

    await expect(getSkillForUserByName(recipientAuth, publicSkill.name)).resolves.toBeNull();
    await expect(getSkillForUserByName(recipientAuth, publicSkill.name, { includeDisabled: true }))
      .resolves.toMatchObject({ name: publicSkill.name, enabled: false });
    await expect(getSkillForUserByName(otherAuth, privateShared.name)).resolves.toBeNull();
    await expect(getSkillForUserByName(creatorAuth, creatorOwned.name)).resolves.toMatchObject({ name: creatorOwned.name });

    const adminList = await listSkillsForUser(adminAuth);
    expect(adminList.map((item) => item.name)).toEqual(expect.arrayContaining([
      publicSkill.name,
      privateShared.name,
      skillName('unshared'),
      creatorOwned.name,
    ]));

    const createdByMe = await listSkillsForUser(creatorAuth, { createdByMe: true });
    expect(createdByMe.map((item) => item.name)).toEqual([creatorOwned.name]);
  });

  it('validates admin create/update atomically and preserves dormant shares across visibility flips (FR3)', async () => {
    await expect(createSkill(creatorAuth, {
      name: skillName('forbidden'),
      description: 'Forbidden',
      body: 'Body',
    })).rejects.toThrow(/admin/i);

    await expect(createSkill(adminAuth, {
      name: 'Bad_Name',
      description: 'Invalid',
      body: 'Body',
    })).rejects.toThrow(/name/i);

    await expect(createSkill(adminAuth, {
      name: skillName('invalid-ref'),
      description: 'Invalid ref',
      body: 'Body',
      references: [{ path: '../secret.md', content: 'bad' }],
    })).rejects.toThrow(/reference path/i);

    await expect(createSkill(adminAuth, {
      name: skillName('unknown-share'),
      description: 'Unknown share',
      body: 'Body',
      visibility: 'private',
      shareIdentifiers: ['missing-user@test.dev'],
    })).rejects.toThrow(/user not found/i);

    const partialRows = await db.select().from(skills).where(eq(skills.name, skillName('unknown-share')));
    expect(partialRows).toHaveLength(0);

    const created = await createSkill(adminAuth, {
      name: skillName('update'),
      description: 'Initial',
      body: 'Initial body',
      visibility: 'private',
      references: [{ path: 'references/a.md', content: 'A' }],
      shareIdentifiers: [`${RECIPIENT_ID}@test.dev`],
    });
    const initialEditedAt = created.lastEditedAt;

    const updated = await updateSkill(adminAuth, created.name, {
      name: skillName('updated'),
      description: 'Updated',
      body: 'Updated body',
      visibility: 'public',
      references: [{ path: 'references/b.md', content: 'B' }],
      shareIdentifiers: [`${RECIPIENT_ID}@test.dev`],
    });

    expect(updated).toMatchObject({
      name: skillName('updated'),
      description: 'Updated',
      visibility: 'public',
      referenceCount: 1,
    });
    expect(updated?.references.map((reference) => reference.path)).toEqual(['references/b.md']);
    expect(updated?.lastEditedByUserId).toBe(ADMIN_ID);
    expect(updated?.lastEditedAt?.getTime()).toBeGreaterThanOrEqual(initialEditedAt?.getTime() ?? 0);
    expect(await getSkillForUserByName(recipientAuth, updated!.name)).toMatchObject({ name: updated!.name });

    const privateAgain = await updateSkill(adminAuth, updated!.name, {
      name: updated!.name,
      description: updated!.description,
      body: updated!.body,
      visibility: 'private',
      references: updated!.references.map((reference) => ({ ...reference, content: 'B' })),
      shareIdentifiers: [`${RECIPIENT_ID}@test.dev`],
    });

    expect(privateAgain?.visibility).toBe('private');
    expect(await getSkillForUserByName(recipientAuth, privateAgain!.name)).toMatchObject({ name: privateAgain!.name });
  });

  it('manages enablement, private shares, Trash, restore, and hard purge helpers (FR4)', async () => {
    const skill = await createSkill(adminAuth, {
      name: skillName('lifecycle'),
      description: 'Lifecycle',
      body: 'Lifecycle body',
      visibility: 'private',
    });

    await expect(setSkillEnabledForUser(otherAuth, skill.name, false)).resolves.toBe(false);
    const share = await grantSkillShare(adminAuth, skill.name, `${RECIPIENT_ID}@test.dev`);
    expect(share).toMatchObject({ userId: RECIPIENT_ID });

    await expect(setSkillEnabledForUser(recipientAuth, skill.name, false)).resolves.toBe(true);
    await expect(setSkillEnabledForUser(recipientAuth, skill.name, false)).resolves.toBe(true);
    expect(await childCounts(skill.id)).toMatchObject({ disabled: 1 });

    await expect(setSkillEnabledForUser(recipientAuth, skill.name, true)).resolves.toBe(true);
    expect(await childCounts(skill.id)).toMatchObject({ disabled: 0 });

    await expect(revokeSkillShare(adminAuth, skill.name, share.id + 1000)).resolves.toBe(false);
    await expect(revokeSkillShare(adminAuth, skill.name, share.id)).resolves.toBe(true);
    await expect(getSkillForUserByName(recipientAuth, skill.name)).resolves.toBeNull();

    await updateSkill(adminAuth, skill.name, {
      name: skill.name,
      description: skill.description,
      body: skill.body,
      visibility: 'public',
      references: [],
      shareIdentifiers: [],
    });
    await expect(grantSkillShare(adminAuth, skill.name, `${RECIPIENT_ID}@test.dev`)).rejects.toThrow(/private/i);

    const beforeDelete = await getSkillForUserByName(adminAuth, skill.name);
    await expect(softDeleteSkill(adminAuth, skill.name)).resolves.toBe(true);
    const deletedRows = await listDeletedSkills(adminAuth);
    expect(deletedRows.find((item) => item.name === skill.name)).toMatchObject({
      name: skill.name,
      deletedByName: 'Skills Admin',
    });
    await expect(getSkillForUserByName(adminAuth, skill.name)).resolves.toBeNull();
    const afterDelete = await db.query.skills.findFirst({ where: eq(skills.id, skill.id) });
    expect(afterDelete?.lastEditedAt?.getTime()).toBe(beforeDelete?.lastEditedAt?.getTime());

    await expect(restoreSkill(adminAuth, skill.name)).resolves.toBe(true);
    await expect(getSkillForUserByName(adminAuth, skill.name)).resolves.toMatchObject({ name: skill.name });

    await softDeleteSkill(adminAuth, skill.name);
    await db
      .update(skills)
      .set({ deletedAt: new Date('2026-04-30T00:00:00.000Z') })
      .where(eq(skills.id, skill.id));
    await expect(hardDeleteExpiredDeletedSkills(new Date('2026-04-01T00:00:00.000Z'))).resolves.toBe(0);
  });
});
