import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { NotFoundError, ForbiddenError, BadRequestError } from './error-handler';
import type { BrainliftData } from '@shared/schema';

// Extend Express Request to include brainlift
declare global {
  namespace Express {
    interface Request {
      brainlift?: BrainliftData;
    }
  }
}

/**
 * Middleware that loads brainlift by slug and checks read access.
 * Sets req.brainlift for downstream use.
 *
 * @throws BadRequestError if slug parameter is missing
 * @throws NotFoundError if brainlift doesn't exist
 * @throws ForbiddenError if user doesn't have read access
 */
export async function requireBrainliftAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const slug = req.params.slug;
    if (!slug) {
      throw new BadRequestError('Brainlift slug is required');
    }

    const brainlift = await storage.getBrainliftBySlug(slug);
    if (!brainlift) {
      throw new NotFoundError('Brainlift not found');
    }

    if (!storage.canAccessBrainlift(brainlift, req.authContext!)) {
      throw new ForbiddenError('Access denied');
    }

    req.brainlift = brainlift;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware that loads brainlift by slug and checks write/modify access.
 * Sets req.brainlift for downstream use.
 *
 * @throws BadRequestError if slug parameter is missing
 * @throws NotFoundError if brainlift doesn't exist
 * @throws ForbiddenError if user doesn't have write access
 */
export async function requireBrainliftModify(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const slug = req.params.slug;
    if (!slug) {
      throw new BadRequestError('Brainlift slug is required');
    }

    const brainlift = await storage.getBrainliftBySlug(slug);
    if (!brainlift) {
      throw new NotFoundError('Brainlift not found');
    }

    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      throw new ForbiddenError('Access denied');
    }

    req.brainlift = brainlift;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware that loads brainlift by ID and checks write access.
 * Uses req.params.id instead of slug.
 * Sets req.brainlift for downstream use.
 *
 * @throws BadRequestError if ID parameter is invalid
 * @throws NotFoundError if brainlift doesn't exist
 * @throws ForbiddenError if user doesn't have write access
 */
export async function requireBrainliftModifyById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('Invalid brainlift ID');
    }

    const brainlift = await storage.getBrainliftById(id);
    if (!brainlift) {
      throw new NotFoundError('Brainlift not found');
    }

    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      throw new ForbiddenError('Access denied');
    }

    req.brainlift = brainlift as BrainliftData;
    next();
  } catch (err) {
    next(err);
  }
}
