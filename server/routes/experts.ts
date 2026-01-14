import { Router } from 'express';
import { storage } from '../storage';
import { extractAndRankExperts, diagnoseExpertFormat } from '../ai/expertExtractor';

export const expertsRouter = Router();

// Get experts for a brainlift
expertsRouter.get('/api/brainlifts/:slug/experts', async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }

    const expertsList = await storage.getExpertsByBrainliftId(brainlift.id);
    res.json(expertsList);
  } catch (err: any) {
    console.error('Get experts error:', err);
    res.status(500).json({ message: err.message || 'Failed to get experts' });
  }
});

// Refresh/extract experts for a brainlift using AI
expertsRouter.post('/api/brainlifts/:slug/experts/refresh', async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }

    // Run expert extraction
    const expertsData = await extractAndRankExperts({
      brainliftId: brainlift.id,
      title: brainlift.title,
      description: brainlift.description,
      author: brainlift.author,
      facts: brainlift.facts,
      originalContent: brainlift.originalContent || '',
      readingList: brainlift.readingList || [],
    });

    const savedExperts = await storage.saveExperts(brainlift.id, expertsData);

    // Run expert format diagnostics and save
    let expertDiagnostics = null;
    if (brainlift.originalContent) {
      console.log('[Expert Refresh] Running diagnostics for:', brainlift.slug);
      expertDiagnostics = diagnoseExpertFormat(brainlift.originalContent);
      console.log('[Expert Refresh] Diagnostics result:', JSON.stringify(expertDiagnostics, null, 2));

      // Save diagnostics to brainlift
      await storage.updateBrainliftFields(brainlift.id, { expertDiagnostics });
    } else {
      console.log('[Expert Refresh] No originalContent for:', brainlift.slug);
    }

    return res.json({
      ...brainlift,
      experts: savedExperts,
      expertDiagnostics
    });
  } catch (err: any) {
    console.error('Refresh experts error:', err);
    res.status(500).json({ message: err.message || 'Failed to refresh experts' });
  }
});

// Update expert following status
expertsRouter.patch('/api/experts/:id/follow', async (req, res) => {
  try {
    const expertId = parseInt(req.params.id);
    const { isFollowing } = req.body;

    if (typeof isFollowing !== 'boolean') {
      return res.status(400).json({ message: 'isFollowing must be a boolean' });
    }

    const updated = await storage.updateExpertFollowing(expertId, isFollowing);
    res.json(updated);
  } catch (err: any) {
    console.error('Update expert following error:', err);
    res.status(500).json({ message: err.message || 'Failed to update expert' });
  }
});

// Delete an expert
expertsRouter.delete('/api/experts/:id', async (req, res) => {
  try {
    const expertId = parseInt(req.params.id);
    await storage.deleteExpert(expertId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete expert error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete expert' });
  }
});

// Get followed experts for a brainlift (used by tweet search)
expertsRouter.get('/api/brainlifts/:slug/experts/following', async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }

    const followedExperts = await storage.getFollowedExperts(brainlift.id);
    res.json(followedExperts);
  } catch (err: any) {
    console.error('Get followed experts error:', err);
    res.status(500).json({ message: err.message || 'Failed to get followed experts' });
  }
});
