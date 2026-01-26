import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { asyncHandler, BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error-handler';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess } from '../middleware/brainlift-auth';

export const sharesRouter = Router();

// === SHARE MANAGEMENT (Owner only) ===

/**
 * GET /api/brainlifts/:slug/shares
 * List all shares for a brainlift (owner only)
 */
sharesRouter.get(
  '/api/brainlifts/:slug/shares',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Only owner can view shares
    if (!storage.isOwner(brainlift, req.authContext!)) {
      throw new ForbiddenError('Only the owner can manage shares');
    }

    const shares = await storage.getBrainliftShares(brainlift.id);
    res.json(shares);
  })
);

/**
 * POST /api/brainlifts/:slug/shares
 * Create a user-specific share (owner only)
 */
const createShareSchema = z.object({
  identifier: z.string().min(1), // email or username
  permission: z.enum(['viewer', 'editor']),
});

sharesRouter.post(
  '/api/brainlifts/:slug/shares',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Only owner can create shares
    if (!storage.isOwner(brainlift, req.authContext!)) {
      throw new ForbiddenError('Only the owner can manage shares');
    }

    const body = createShareSchema.parse(req.body);

    // Find user by email or username
    const targetUser = await storage.getUserByEmailOrUsername(body.identifier);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    // Don't allow sharing with yourself
    if (targetUser.id === req.authContext!.userId) {
      throw new BadRequestError('Cannot share with yourself');
    }

    try {
      const share = await storage.createUserShare(
        brainlift.id,
        targetUser.id,
        body.permission,
        req.authContext!.userId
      );

      res.json({
        id: share.id,
        userId: targetUser.id,
        userName: targetUser.name,
        userEmail: targetUser.email,
        userImage: targetUser.image,
        permission: share.permission,
        createdAt: share.createdAt,
      });
    } catch (err: any) {
      if (err.message.includes('Target user not found')) {
        throw new NotFoundError('User not found');
      }
      // Duplicate share constraint violation
      if (err.code === '23505') {
        throw new BadRequestError('User already has access to this brainlift');
      }
      throw err;
    }
  })
);

/**
 * PATCH /api/brainlifts/:slug/shares/:shareId
 * Update share permission (owner only)
 */
const updateShareSchema = z.object({
  permission: z.enum(['viewer', 'editor']),
});

sharesRouter.patch(
  '/api/brainlifts/:slug/shares/:shareId',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const shareId = parseInt(req.params.shareId, 10);

    if (isNaN(shareId)) {
      throw new BadRequestError('Invalid share ID');
    }

    // Only owner can update shares
    if (!storage.isOwner(brainlift, req.authContext!)) {
      throw new ForbiddenError('Only the owner can manage shares');
    }

    const body = updateShareSchema.parse(req.body);

    const updated = await storage.updateShare(shareId, brainlift.id, body.permission);
    if (!updated) {
      throw new NotFoundError('Share not found');
    }

    res.json(updated);
  })
);

/**
 * DELETE /api/brainlifts/:slug/shares/:shareId
 * Revoke access by deleting share (owner only)
 */
sharesRouter.delete(
  '/api/brainlifts/:slug/shares/:shareId',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const shareId = parseInt(req.params.shareId, 10);

    if (isNaN(shareId)) {
      throw new BadRequestError('Invalid share ID');
    }

    // Only owner can delete shares
    if (!storage.isOwner(brainlift, req.authContext!)) {
      throw new ForbiddenError('Only the owner can manage shares');
    }

    const success = await storage.deleteShare(shareId, brainlift.id);
    if (!success) {
      throw new NotFoundError('Share not found');
    }

    res.json({ success: true });
  })
);

// === SHARE TOKEN MANAGEMENT (Owner only) ===

/**
 * POST /api/brainlifts/:slug/share-token
 * Generate or retrieve share token (owner only)
 */
const createTokenSchema = z.object({
  permission: z.enum(['viewer', 'editor']),
});

sharesRouter.post(
  '/api/brainlifts/:slug/share-token',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Only owner can create share tokens
    if (!storage.isOwner(brainlift, req.authContext!)) {
      throw new ForbiddenError('Only the owner can manage shares');
    }

    const body = createTokenSchema.parse(req.body);

    const { token, permission } = await storage.getOrCreateShareToken(
      brainlift.id,
      body.permission,
      req.authContext!.userId
    );

    // Generate full share URL
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const shareUrl = `${baseUrl}/dashboard/${brainlift.slug}?share=${token}`;

    res.json({ token, permission, shareUrl });
  })
);

/**
 * GET /api/brainlifts/:slug/share-token
 * Get existing share token (owner only)
 */
sharesRouter.get(
  '/api/brainlifts/:slug/share-token',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Only owner can view share tokens
    if (!storage.isOwner(brainlift, req.authContext!)) {
      throw new ForbiddenError('Only the owner can manage shares');
    }

    const shares = await storage.getBrainliftShares(brainlift.id);

    if (!shares.tokenShare) {
      res.json({ token: null });
      return;
    }

    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const shareUrl = `${baseUrl}/dashboard/${brainlift.slug}?share=${shares.tokenShare.token}`;

    res.json({
      token: shares.tokenShare.token,
      permission: shares.tokenShare.permission,
      shareUrl,
    });
  })
);

// === TOKEN REDEMPTION (Any authenticated user) ===

/**
 * POST /api/shares/validate-token
 * Validate and redeem a share token (creates user-specific share)
 */
const validateTokenSchema = z.object({
  token: z.string().min(1),
});

sharesRouter.post(
  '/api/shares/validate-token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = validateTokenSchema.parse(req.body);

    // Validate token and get brainlift info
    const shareInfo = await storage.getShareByToken(body.token);
    if (!shareInfo) {
      throw new NotFoundError('Invalid share token');
    }

    // Check if user already has access
    const existingPermission = await storage.getUserSharePermission(
      shareInfo.brainliftId,
      req.authContext!.userId
    );

    if (existingPermission) {
      // User already has access - return brainlift info
      res.json({
        brainliftSlug: shareInfo.brainliftSlug,
        brainliftTitle: shareInfo.brainliftTitle,
        permission: existingPermission,
        alreadyHadAccess: true,
      });
      return;
    }

    // Create user-specific share from token
    await storage.createUserShare(
      shareInfo.brainliftId,
      req.authContext!.userId,
      shareInfo.permission,
      req.authContext!.userId // Self-created via token
    );

    res.json({
      brainliftSlug: shareInfo.brainliftSlug,
      brainliftTitle: shareInfo.brainliftTitle,
      permission: shareInfo.permission,
      alreadyHadAccess: false,
    });
  })
);
