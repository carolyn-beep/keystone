import { db } from "../db";
import { brainliftShares, user, brainlifts } from "../../shared/schema";
import { eq, and, or } from "drizzle-orm";
import crypto from "crypto";

export type SharePermission = 'viewer' | 'editor';

/**
 * Get user's permission for a brainlift via shares table
 * Returns 'viewer', 'editor', or null if no share exists
 */
export async function getUserSharePermission(
  brainliftId: number,
  userId: string
): Promise<SharePermission | null> {
  const share = await db.query.brainliftShares.findFirst({
    where: and(
      eq(brainliftShares.brainliftId, brainliftId),
      eq(brainliftShares.userId, userId)
    ),
  });

  return share ? (share.permission as SharePermission) : null;
}

/**
 * Get all shares for a brainlift (for share management modal)
 * Returns user shares and token share separately
 */
export async function getBrainliftShares(brainliftId: number) {
  const shares = await db.query.brainliftShares.findMany({
    where: eq(brainliftShares.brainliftId, brainliftId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  const userShares = shares.filter(s => s.type === 'user').map(s => ({
    id: s.id,
    userId: s.userId!,
    userName: s.user?.name ?? 'Unknown',
    userEmail: s.user?.email ?? '',
    userImage: s.user?.image,
    permission: s.permission as SharePermission,
    createdAt: s.createdAt,
  }));

  const tokenShare = shares.find(s => s.type === 'token');

  return {
    userShares,
    tokenShare: tokenShare ? {
      id: tokenShare.id,
      token: tokenShare.token!,
      permission: tokenShare.permission as SharePermission,
      createdAt: tokenShare.createdAt,
    } : null,
  };
}

/**
 * Create a user-specific share
 * Throws error if user doesn't exist or share already exists
 */
export async function createUserShare(
  brainliftId: number,
  targetUserId: string,
  permission: SharePermission,
  createdByUserId: string
) {
  // Verify target user exists
  const targetUser = await db.query.user.findFirst({
    where: eq(user.id, targetUserId),
  });

  if (!targetUser) {
    throw new Error('Target user not found');
  }

  // Create the share
  const [share] = await db.insert(brainliftShares).values({
    brainliftId,
    type: 'user',
    permission,
    userId: targetUserId,
    token: null,
    createdByUserId,
  }).returning();

  return share;
}

/**
 * Update a share's permission (viewer <-> editor)
 * Includes brainliftId for IDOR prevention
 */
export async function updateShare(
  shareId: number,
  brainliftId: number,
  permission: SharePermission
) {
  const [updated] = await db
    .update(brainliftShares)
    .set({ permission })
    .where(
      and(
        eq(brainliftShares.id, shareId),
        eq(brainliftShares.brainliftId, brainliftId)
      )
    )
    .returning();

  return updated ?? null;
}

/**
 * Delete a share (revoke access)
 * Includes brainliftId for IDOR prevention
 */
export async function deleteShare(shareId: number, brainliftId: number) {
  const [deleted] = await db
    .delete(brainliftShares)
    .where(
      and(
        eq(brainliftShares.id, shareId),
        eq(brainliftShares.brainliftId, brainliftId)
      )
    )
    .returning();

  return deleted ? true : false;
}

/**
 * Get or create a shareable link token
 * Only one token per brainlift (per permission level in v2, but MVP has single token)
 */
export async function getOrCreateShareToken(
  brainliftId: number,
  permission: SharePermission,
  createdByUserId: string
) {
  // Check if token already exists
  const existing = await db.query.brainliftShares.findFirst({
    where: and(
      eq(brainliftShares.brainliftId, brainliftId),
      eq(brainliftShares.type, 'token')
    ),
  });

  if (existing) {
    // If token exists with different permission, update it
    if (existing.permission !== permission) {
      const [updated] = await db
        .update(brainliftShares)
        .set({ permission })
        .where(eq(brainliftShares.id, existing.id))
        .returning();

      return {
        token: updated.token!,
        permission: updated.permission as SharePermission,
      };
    }

    // Token exists with same permission, return it
    return {
      token: existing.token!,
      permission: existing.permission as SharePermission,
    };
  }

  // Generate new token
  const token = crypto.randomBytes(32).toString('base64url');

  const [share] = await db.insert(brainliftShares).values({
    brainliftId,
    type: 'token',
    permission,
    userId: null,
    token,
    createdByUserId,
  }).returning();

  return {
    token: share.token!,
    permission: share.permission as SharePermission,
  };
}

/**
 * Validate and retrieve share token information
 */
export async function getShareByToken(token: string) {
  const share = await db.query.brainliftShares.findFirst({
    where: and(
      eq(brainliftShares.token, token),
      eq(brainliftShares.type, 'token')
    ),
    with: {
      brainlift: {
        columns: {
          id: true,
          slug: true,
          title: true,
        },
      },
    },
  });

  return share ? {
    brainliftId: share.brainliftId,
    brainliftSlug: share.brainlift.slug,
    brainliftTitle: share.brainlift.title,
    permission: share.permission as SharePermission,
  } : null;
}

/**
 * Find user by email or username (for adding people to shares)
 */
export async function getUserByEmailOrUsername(identifier: string) {
  const foundUser = await db.query.user.findFirst({
    where: or(
      eq(user.email, identifier),
      eq(user.name, identifier)
    ),
    columns: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  return foundUser ?? null;
}

/**
 * Get brainlifts shared with a user (for list filtering)
 */
export async function getSharedBrainlifts(
  userId: string,
  offset: number,
  limit: number
) {
  const shares = await db.query.brainliftShares.findMany({
    where: and(
      eq(brainliftShares.userId, userId),
      eq(brainliftShares.type, 'user')
    ),
    with: {
      brainlift: true,
    },
    offset,
    limit,
  });

  return shares.map(s => ({
    ...s.brainlift,
    sharePermission: s.permission as SharePermission,
  }));
}

/**
 * Transfer ownership to first editor when owner is deleted
 * Called from user deletion hook
 */
export async function transferOwnershipToFirstEditor(brainliftId: number): Promise<boolean> {
  // Find first editor
  const editorShare = await db.query.brainliftShares.findFirst({
    where: and(
      eq(brainliftShares.brainliftId, brainliftId),
      eq(brainliftShares.permission, 'editor'),
      eq(brainliftShares.type, 'user')
    ),
  });

  if (!editorShare || !editorShare.userId) {
    // No editors found to transfer ownership to
    return false;
  }

  // Transfer ownership
  await db
    .update(brainlifts)
    .set({ createdByUserId: editorShare.userId })
    .where(eq(brainlifts.id, brainliftId));

  // Delete the editor's share (they're now the owner)
  await db
    .delete(brainliftShares)
    .where(eq(brainliftShares.id, editorShare.id));

  return true;
}
