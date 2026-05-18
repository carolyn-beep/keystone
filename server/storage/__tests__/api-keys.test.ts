/**
 * Tests for FR1 (schema) + FR2 (storage functions): API Keys
 *
 * Tests storage functions against real local database (Docker Postgres).
 * Uses test-specific data with cleanup.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db';
import { apiKeys, user } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { validateApiKey, findOrCreateUserByEmail, findUserByEmail } from '../api-keys';
import crypto from 'crypto';

// Test fixtures
const TEST_KEY_PREFIX = 'test-api-key-' + Date.now();
let activeKeyId: number;
let revokedKeyId: number;
let inactiveKeyId: number;
const testUserEmails: string[] = [];

beforeAll(async () => {
  // Create test API keys
  const [active] = await db.insert(apiKeys).values({
    key: TEST_KEY_PREFIX + '-active',
    name: 'test-active-key',
    rateLimit: 60,
    isActive: true,
  }).returning();
  activeKeyId = active.id;

  const [revoked] = await db.insert(apiKeys).values({
    key: TEST_KEY_PREFIX + '-revoked',
    name: 'test-revoked-key',
    rateLimit: 60,
    isActive: true,
    revokedAt: new Date(),
  }).returning();
  revokedKeyId = revoked.id;

  const [inactive] = await db.insert(apiKeys).values({
    key: TEST_KEY_PREFIX + '-inactive',
    name: 'test-inactive-key',
    rateLimit: 60,
    isActive: false,
  }).returning();
  inactiveKeyId = inactive.id;
});

afterAll(async () => {
  // Clean up test API keys
  await db.delete(apiKeys).where(
    sql`${apiKeys.key} LIKE ${TEST_KEY_PREFIX + '%'}`
  );
  // Clean up test users
  for (const email of testUserEmails) {
    await db.delete(user).where(eq(user.email, email));
  }
});

describe('validateApiKey', () => {
  it('returns key record for valid active key', async () => {
    const result = await validateApiKey(TEST_KEY_PREFIX + '-active');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(activeKeyId);
    expect(result!.name).toBe('test-active-key');
    expect(result!.rateLimit).toBe(60);
    expect(result!.scopes).toEqual(['*']);
  });

  it('returns scopes for a scoped active key', async () => {
    const [scoped] = await db.insert(apiKeys).values({
      key: TEST_KEY_PREFIX + '-scoped',
      name: 'test-scoped-key',
      rateLimit: 60,
      isActive: true,
      scopes: ['brainlifts:list', 'brainlifts:read'],
    }).returning();

    const result = await validateApiKey(TEST_KEY_PREFIX + '-scoped');

    expect(result).not.toBeNull();
    expect(result!.id).toBe(scoped.id);
    expect(result!.scopes).toEqual(['brainlifts:list', 'brainlifts:read']);
  });

  it('returns null for non-existent key', async () => {
    const result = await validateApiKey('nonexistent-key-12345');
    expect(result).toBeNull();
  });

  it('returns null for revoked key', async () => {
    const result = await validateApiKey(TEST_KEY_PREFIX + '-revoked');
    expect(result).toBeNull();
  });

  it('returns null for inactive key', async () => {
    const result = await validateApiKey(TEST_KEY_PREFIX + '-inactive');
    expect(result).toBeNull();
  });
});

describe('findOrCreateUserByEmail', () => {
  const uniqueId = Date.now();

  it('creates new user for unknown email', async () => {
    const email = `test-new-${uniqueId}@example.com`;
    testUserEmails.push(email);

    const result = await findOrCreateUserByEmail(email, 'Test New User');
    expect(result.userId).toBeTruthy();
    expect(result.isNew).toBe(true);
  });

  it('returns existing user for known email', async () => {
    const email = `test-existing-${uniqueId}@example.com`;
    testUserEmails.push(email);

    // First call creates the user
    const first = await findOrCreateUserByEmail(email, 'Test Existing');
    // Second call finds the existing user
    const second = await findOrCreateUserByEmail(email, 'Test Existing');

    expect(second.userId).toBe(first.userId);
    expect(second.isNew).toBe(false);
  });

  it('matches email case-insensitively', async () => {
    const email = `test-case-${uniqueId}@example.com`;
    testUserEmails.push(email);

    // Create with lowercase
    const first = await findOrCreateUserByEmail(email, 'Test Case');
    // Find with different case
    const second = await findOrCreateUserByEmail(email.toUpperCase(), 'Test Case');

    expect(second.userId).toBe(first.userId);
    expect(second.isNew).toBe(false);
  });

  it('creates user with correct role', async () => {
    const email = `test-role-${uniqueId}@example.com`;
    testUserEmails.push(email);

    const result = await findOrCreateUserByEmail(email, 'Test Role User');
    // Verify the user was created with 'user' role
    const [created] = await db.select().from(user).where(eq(user.id, result.userId));
    expect(created.role).toBe('user');
    expect(created.name).toBe('Test Role User');
    expect(created.email).toBe(email.toLowerCase());
  });
});

describe('findUserByEmail', () => {
  const uniqueId = Date.now();

  it('returns null for unknown email and does NOT insert a row', async () => {
    const email = `test-lookup-miss-${uniqueId}@example.com`;
    const before = await db.execute(sql`SELECT COUNT(*)::int AS n FROM "user"`);
    const result = await findUserByEmail(email);
    const after = await db.execute(sql`SELECT COUNT(*)::int AS n FROM "user"`);

    expect(result).toBeNull();
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it('returns existing user for known email', async () => {
    const email = `test-lookup-hit-${uniqueId}@example.com`;
    testUserEmails.push(email);
    const created = await findOrCreateUserByEmail(email, 'Lookup Hit');

    const result = await findUserByEmail(email);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(created.userId);
    expect(result!.role).toBe('user');
  });

  it('matches email case-insensitively', async () => {
    const email = `test-lookup-case-${uniqueId}@example.com`;
    testUserEmails.push(email);
    const created = await findOrCreateUserByEmail(email, 'Lookup Case');

    const result = await findUserByEmail(email.toUpperCase());

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(created.userId);
  });
});
