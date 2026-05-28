/**
 * Tests for FR2 (storage): users.ts — getUserPreferences + markExplainerSeen.
 *
 * Runs against the local Docker Postgres (per CLAUDE.md: never mock the DB
 * for storage tests). Cleans up test users via a unique prefix.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { user } from '@shared/schema';
import { eq, like, sql } from 'drizzle-orm';
import { NotFoundError } from '../../middleware/error-handler';
import {
  getUserPreferences,
  markExplainerSeen,
} from '../users';

const TEST_PREFIX = 'test-users-storage-' + Date.now();

function freshId(suffix: string): string {
  return `${TEST_PREFIX}-${suffix}`;
}

beforeAll(async () => {
  // Fresh users for each happy-path test (created on demand below).
});

afterAll(async () => {
  // Delete all users whose id starts with the test prefix.
  await db.delete(user).where(like(user.id, TEST_PREFIX + '%'));
});

async function createTestUser(suffix: string): Promise<string> {
  const id = freshId(suffix);
  await db.insert(user).values({
    id,
    email: `${id}@example.com`,
    name: 'User Pref Test',
    emailVerified: false,
  });
  return id;
}

describe('getUserPreferences', () => {
  it('returns { seenExplainers: [] } for a freshly-migrated user (default)', async () => {
    const userId = await createTestUser('get-default');
    const prefs = await getUserPreferences(userId);
    expect(prefs).toEqual({ seenExplainers: [] });
  });

  it('returns the array after markExplainerSeen has been called', async () => {
    const userId = await createTestUser('get-after-mark');
    await markExplainerSeen(userId, 'dok1');
    const prefs = await getUserPreferences(userId);
    expect(prefs).toEqual({ seenExplainers: ['dok1'] });
  });

  it('throws NotFoundError when the user does not exist', async () => {
    await expect(getUserPreferences('does-not-exist-' + TEST_PREFIX))
      .rejects.toThrow(NotFoundError);
  });
});

describe('markExplainerSeen', () => {
  it('appends key to empty array on first call', async () => {
    const userId = await createTestUser('mark-fresh');
    const result = await markExplainerSeen(userId, 'dok1');
    expect(result).toEqual(['dok1']);
  });

  it('is idempotent — second call with same key returns unchanged array', async () => {
    const userId = await createTestUser('mark-idempotent');
    const first = await markExplainerSeen(userId, 'dok1');
    expect(first).toEqual(['dok1']);
    const second = await markExplainerSeen(userId, 'dok1');
    expect(second).toEqual(['dok1']);
    expect(second.length).toBe(1);
  });

  it('appends a different key while preserving existing keys', async () => {
    const userId = await createTestUser('mark-multi');
    await markExplainerSeen(userId, 'dok1');
    const result = await markExplainerSeen(userId, 'dok2');
    expect(result).toContain('dok1');
    expect(result).toContain('dok2');
    expect(result.length).toBe(2);
  });

  it('handles parallel calls with the same (userId, key) without duplicating', async () => {
    const userId = await createTestUser('mark-parallel');
    const results = await Promise.all([
      markExplainerSeen(userId, 'dok1'),
      markExplainerSeen(userId, 'dok1'),
      markExplainerSeen(userId, 'dok1'),
    ]);
    // Final state must be exactly one "dok1" entry.
    const final = await getUserPreferences(userId);
    expect(final.seenExplainers).toEqual(['dok1']);
    // Each returned array is also "dok1" only.
    for (const r of results) {
      expect(r).toEqual(['dok1']);
    }
  });

  it('round-trips keys with special characters', async () => {
    const userId = await createTestUser('mark-special');
    const result = await markExplainerSeen(userId, 'dok1-v2');
    expect(result).toEqual(['dok1-v2']);
  });

  it('throws NotFoundError when the user does not exist', async () => {
    await expect(markExplainerSeen('does-not-exist-' + TEST_PREFIX, 'dok1'))
      .rejects.toThrow(NotFoundError);
  });
});
