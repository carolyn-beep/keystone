import { Router } from 'express';
import { storage } from '../storage';
import { extractAndRankExperts, diagnoseExpertFormat } from '../ai/experts';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';

export const expertsRouter = Router();

// Get experts for a brainlift
expertsRouter.get(
  '/api/brainlifts/:slug/experts',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const expertsList = await storage.getExpertsByBrainliftId(req.brainlift!.id);
    res.json(expertsList);
  })
);

// Refresh/extract experts for a brainlift using AI
expertsRouter.post(
  '/api/brainlifts/:slug/experts/refresh',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const facts = await storage.getFactsForBrainlift(brainlift.id);

    // Run expert extraction
    const expertsData = await extractAndRankExperts({
      brainliftId: brainlift.id,
      title: brainlift.title,
      description: brainlift.description,
      author: brainlift.author,
      facts,
      originalContent: brainlift.originalContent || '',
    });

    const savedExperts = await storage.saveExperts(brainlift.id, expertsData);

    // Run expert format diagnostics and save
    let expertDiagnostics = null;
    if (brainlift.originalContent) {
      console.log('[Expert Refresh] Running diagnostics for:', brainlift.slug);
      expertDiagnostics = await diagnoseExpertFormat(brainlift.originalContent);
      console.log('[Expert Refresh] Diagnostics result:', JSON.stringify(expertDiagnostics, null, 2));

      // Save diagnostics to brainlift
      await storage.updateBrainliftFields(brainlift.id, { expertDiagnostics });
    } else {
      console.log('[Expert Refresh] No originalContent for:', brainlift.slug);
    }

    res.json({
      experts: savedExperts,
      expertDiagnostics,
    });
  })
);

// Delete an expert (nested under brainlift for authorization)
expertsRouter.delete(
  '/api/brainlifts/:slug/experts/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const expertId = parseInt(req.params.id);
    if (isNaN(expertId)) {
      throw new BadRequestError('Invalid expert ID');
    }
    const deleted = await storage.deleteExpertForBrainlift(expertId, req.brainlift!.id);
    if (!deleted) {
      throw new NotFoundError('Expert not found');
    }
    res.json({ success: true });
  })
);
