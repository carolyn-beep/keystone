/**
 * API key storage functions for service-to-service authentication.
 *
 * Provides key validation and user provisioning for the MCP server.
 */

import { db, eq, and, isNull } from './base';
import { apiKeys, user } from '@shared/schema';
import type { ApiKey } from '@shared/schema';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Validate an API key string against the database.
 * Returns the key record if active and not revoked, null otherwise.
 */
export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const [result] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.key, key),
        eq(apiKeys.isActive, true),
        isNull(apiKeys.revokedAt),
      )
    )
    .limit(1);

  return result ?? null;
}

/**
 * Look up an existing user by email (case-insensitive). Returns null when
 * no row matches. Used by service-auth for non-wildcard (scoped) API keys,
 * which must not auto-provision users — a missing email is a 404, not a
 * silent insert. See findOrCreateUserByEmail for the wildcard-trusted path.
 */
export async function findUserByEmail(
  email: string,
): Promise<{ userId: string; role: string } | null> {
  const normalizedEmail = email.toLowerCase();

  const [existing] = await db
    .select()
    .from(user)
    .where(sql`LOWER(${user.email}) = ${normalizedEmail}`)
    .limit(1);

  if (!existing) return null;
  return { userId: existing.id, role: existing.role ?? 'user' };
}

/**
 * Find an existing user by email or create a new one.
 * Email matching is case-insensitive.
 *
 * Returns the userId and whether the user was newly created.
 */
export async function findOrCreateUserByEmail(
  email: string,
  name: string,
): Promise<{ userId: string; isNew: boolean; role: string }> {
  const normalizedEmail = email.toLowerCase();

  // Try to find existing user (case-insensitive)
  const [existing] = await db
    .select()
    .from(user)
    .where(sql`LOWER(${user.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existing) {
    return { userId: existing.id, isNew: false, role: existing.role ?? 'user' };
  }

  // Create new user
  const newId = crypto.randomUUID();
  try {
    const [created] = await db
      .insert(user)
      .values({
        id: newId,
        name,
        email: normalizedEmail,
        role: 'user',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { userId: created.id, isNew: true, role: 'user' };
  } catch (err: any) {
    // Handle unique constraint violation (concurrent insert)
    const pgCode = err?.cause?.code ?? err?.code;
    if (pgCode === '23505') {
      const [existing] = await db
        .select()
        .from(user)
        .where(sql`LOWER(${user.email}) = ${normalizedEmail}`)
        .limit(1);

      if (existing) {
        return { userId: existing.id, isNew: false, role: existing.role ?? 'user' };
      }
    }
    throw err;
  }
}
