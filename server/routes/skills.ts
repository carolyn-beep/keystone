import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  asyncHandler,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../middleware/error-handler';
import { storage } from '../storage';

export const skillsRouter = Router();

const skillVisibilitySchema = z.enum(['public', 'private']);

const saveSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  body: z.string(),
  visibility: skillVisibilitySchema.default('public'),
  references: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).default([]),
  shareIdentifiers: z.array(z.string()).default([]),
});

const enabledSchema = z.object({
  enabled: z.boolean(),
});

const grantShareSchema = z.object({
  identifier: z.string().min(1),
});

function assertAdmin(req: Request): void {
  if (!req.authContext?.isAdmin) {
    throw new ForbiddenError('Admin access required');
  }
}

function parseShareId(rawValue: string): number {
  const shareId = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(shareId) || shareId <= 0) {
    throw new BadRequestError('Invalid share ID');
  }
  return shareId;
}

function toBadRequest(error: unknown): BadRequestError {
  return new BadRequestError(error instanceof Error ? error.message : 'Invalid skill request');
}

async function loadSkillForUi(req: Request) {
  try {
    return await storage.getSkillForUserByName(
      req.authContext!,
      req.params.name,
      { includeDisabled: true },
    );
  } catch {
    return null;
  }
}

export async function listSkillsHandler(req: Request, res: Response): Promise<void> {
  const createdByMe = req.query.createdBy === 'me';
  const skills = await storage.listSkillsForUser(req.authContext!, {
    includeDisabled: true,
    createdByMe,
  });

  res.json({ skills });
}

export async function getSkillHandler(req: Request, res: Response): Promise<void> {
  const skill = await loadSkillForUi(req);
  if (!skill) {
    throw new NotFoundError('Skill not found');
  }

  res.json({ skill });
}

export async function createSkillHandler(req: Request, res: Response): Promise<void> {
  assertAdmin(req);
  const input = saveSkillSchema.parse(req.body);

  try {
    const skill = await storage.createSkill(req.authContext!, input);
    res.status(201).json({ skill });
  } catch (error) {
    throw toBadRequest(error);
  }
}

export async function updateSkillHandler(req: Request, res: Response): Promise<void> {
  assertAdmin(req);
  const input = saveSkillSchema.parse(req.body);

  try {
    const skill = await storage.updateSkill(req.authContext!, req.params.name, input);
    if (!skill) {
      throw new NotFoundError('Skill not found');
    }

    res.json({ skill });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw toBadRequest(error);
  }
}

export async function deleteSkillHandler(req: Request, res: Response): Promise<void> {
  assertAdmin(req);

  let deleted = false;
  try {
    deleted = await storage.softDeleteSkill(req.authContext!, req.params.name);
  } catch {
    deleted = false;
  }

  if (!deleted) {
    throw new NotFoundError('Skill not found');
  }

  res.json({ deleted: true });
}

export async function listDeletedSkillsHandler(req: Request, res: Response): Promise<void> {
  assertAdmin(req);
  const skills = await storage.listDeletedSkills(req.authContext!);
  res.json({ skills });
}

export async function restoreSkillHandler(req: Request, res: Response): Promise<void> {
  assertAdmin(req);

  let restored = false;
  try {
    restored = await storage.restoreSkill(req.authContext!, req.params.name);
  } catch {
    restored = false;
  }

  if (!restored) {
    throw new NotFoundError('Skill not found');
  }

  res.json({ restored: true });
}

export async function setSkillEnabledHandler(req: Request, res: Response): Promise<void> {
  const { enabled } = enabledSchema.parse(req.body);

  let updated = false;
  try {
    updated = await storage.setSkillEnabledForUser(req.authContext!, req.params.name, enabled);
  } catch {
    updated = false;
  }

  if (!updated) {
    throw new NotFoundError('Skill not found');
  }

  res.json({ enabled });
}

export async function tryItOutSkillHandler(req: Request, res: Response): Promise<void> {
  const skill = await loadSkillForUi(req);
  if (!skill) {
    throw new NotFoundError('Skill not found');
  }

  const enabled = await storage.setSkillEnabledForUser(req.authContext!, skill.name, true);
  if (!enabled) {
    throw new NotFoundError('Skill not found');
  }

  const conversation = await storage.createChatConversation(req.authContext!.userId);
  const location = `/?c=${conversation.id}`;

  res.status(201).json({
    conversationId: conversation.id,
    location,
    prefill: `Use the ${skill.name} skill.`,
  });
}

export async function grantSkillShareHandler(req: Request, res: Response): Promise<void> {
  assertAdmin(req);
  const { identifier } = grantShareSchema.parse(req.body);

  try {
    const share = await storage.grantSkillShare(req.authContext!, req.params.name, identifier);
    res.status(201).json({ share });
  } catch (error) {
    if (error instanceof Error && error.message === 'Skill not found') {
      throw new NotFoundError('Skill not found');
    }
    throw toBadRequest(error);
  }
}

export async function revokeSkillShareHandler(req: Request, res: Response): Promise<void> {
  assertAdmin(req);
  const shareId = parseShareId(req.params.shareId);
  const revoked = await storage.revokeSkillShare(req.authContext!, req.params.name, shareId);
  if (!revoked) {
    throw new NotFoundError('Skill share not found');
  }

  res.json({ revoked: true });
}

skillsRouter.get(
  '/api/skills',
  requireAuth,
  asyncHandler(listSkillsHandler),
);

skillsRouter.post(
  '/api/skills',
  requireAuth,
  asyncHandler(createSkillHandler),
);

skillsRouter.get(
  '/api/skills/trash',
  requireAuth,
  asyncHandler(listDeletedSkillsHandler),
);

skillsRouter.get(
  '/api/skills/:name',
  requireAuth,
  asyncHandler(getSkillHandler),
);

skillsRouter.put(
  '/api/skills/:name',
  requireAuth,
  asyncHandler(updateSkillHandler),
);

skillsRouter.delete(
  '/api/skills/:name',
  requireAuth,
  asyncHandler(deleteSkillHandler),
);

skillsRouter.post(
  '/api/skills/:name/restore',
  requireAuth,
  asyncHandler(restoreSkillHandler),
);

skillsRouter.put(
  '/api/skills/:name/enabled',
  requireAuth,
  asyncHandler(setSkillEnabledHandler),
);

skillsRouter.post(
  '/api/skills/:name/try-it-out',
  requireAuth,
  asyncHandler(tryItOutSkillHandler),
);

skillsRouter.post(
  '/api/skills/:name/shares',
  requireAuth,
  asyncHandler(grantSkillShareHandler),
);

skillsRouter.delete(
  '/api/skills/:name/shares/:shareId',
  requireAuth,
  asyncHandler(revokeSkillShareHandler),
);
