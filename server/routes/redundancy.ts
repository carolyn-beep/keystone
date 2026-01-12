import { Router } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { facts, factVerifications, factModelScores, llmFeedback, factRedundancyGroups } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

export const redundancyRouter = Router();

// Analyze facts for redundancy
redundancyRouter.post('/api/brainlifts/:slug/analyze-redundancy', async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }

    const { analyzeFactRedundancy } = await import('../ai/redundancyAnalyzer');
    const facts = await storage.getFactsForBrainlift(brainlift.id);

    const result = await analyzeFactRedundancy(facts);

    // Save redundancy groups to database
    if (result.redundancyGroups.length > 0) {
      await storage.saveRedundancyGroups(brainlift.id, result.redundancyGroups.map(g => ({
        groupName: g.groupName,
        factIds: g.factIds,
        primaryFactId: g.primaryFactId,
        similarityScore: g.similarityScore,
        reason: g.reason,
        status: 'pending' as const,
      })));
    }

    res.json({
      ...result,
      message: `Found ${result.redundancyGroups.length} redundancy groups affecting ${result.redundantFactCount} facts`,
    });
  } catch (err: any) {
    console.error('Redundancy analysis error:', err);
    res.status(500).json({ message: err.message || 'Failed to analyze redundancy' });
  }
});

// Get redundancy groups for a brainlift
redundancyRouter.get('/api/brainlifts/:slug/redundancy', async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }

    const groups = await storage.getRedundancyGroups(brainlift.id);
    const facts = await storage.getFactsForBrainlift(brainlift.id);

    // Build a fact lookup map
    const factMap = new Map(facts.map(f => [f.id, f]));

    // Calculate stats
    const allRedundantFactIds = new Set<number>();
    groups.filter(g => g.status === 'pending').forEach(g => {
      g.factIds.forEach(id => allRedundantFactIds.add(id));
    });

    const pendingGroups = groups.filter(g => g.status === 'pending');
    const uniqueFactCount = facts.length - allRedundantFactIds.size + pendingGroups.length;

    res.json({
      groups: groups.map(g => ({
        ...g,
        facts: g.factIds.map(id => factMap.get(id)).filter(Boolean),
        primaryFact: factMap.get(g.primaryFactId || 0),
      })),
      stats: {
        totalFacts: facts.length,
        uniqueFactCount,
        redundantFactCount: allRedundantFactIds.size - pendingGroups.length,
        pendingReview: pendingGroups.length,
      },
    });
  } catch (err: any) {
    console.error('Get redundancy error:', err);
    res.status(500).json({ message: err.message || 'Failed to get redundancy data' });
  }
});

// Update redundancy group status (keep, dismiss, merge)
// When status='kept' and primaryFactId is provided, deletes other facts in the group
redundancyRouter.patch('/api/redundancy-groups/:groupId', async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { status, primaryFactId } = req.body;

    if (!['pending', 'kept', 'merged', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // If keeping with a primary fact, delete the redundant facts
    if (status === 'kept' && primaryFactId) {
      // Get the group to find all fact IDs
      const groups = await db.select().from(factRedundancyGroups).where(eq(factRedundancyGroups.id, groupId));
      const group = groups[0];

      if (group && group.factIds) {
        // Delete all facts in the group EXCEPT the primary one
        const factIdsToDelete = (group.factIds as number[]).filter(id => id !== primaryFactId);

        if (factIdsToDelete.length > 0) {
          // Delete related data first (foreign key constraints)
          for (const factId of factIdsToDelete) {
            // Get verification IDs for this fact
            const verifications = await db.select({ id: factVerifications.id })
              .from(factVerifications)
              .where(eq(factVerifications.factId, factId));
            const verificationIds = verifications.map(v => v.id);

            // Delete model scores if there are verifications
            if (verificationIds.length > 0) {
              await db.delete(factModelScores).where(inArray(factModelScores.verificationId, verificationIds));
            }

            // Delete verifications
            await db.delete(factVerifications).where(eq(factVerifications.factId, factId));

            // Delete LLM feedback
            await db.delete(llmFeedback).where(eq(llmFeedback.factId, factId));

            // Delete the fact itself
            await db.delete(facts).where(eq(facts.id, factId));
          }

          console.log(`Deleted ${factIdsToDelete.length} redundant facts, kept fact ${primaryFactId}`);
        }
      }

      // Update the group's primaryFactId and factIds to only contain the kept fact
      await db.update(factRedundancyGroups)
        .set({
          status,
          primaryFactId,
          factIds: [primaryFactId]
        })
        .where(eq(factRedundancyGroups.id, groupId));
    }

    const updated = await storage.updateRedundancyGroupStatus(groupId, status);
    res.json(updated);
  } catch (err: any) {
    console.error('Update redundancy group error:', err);
    res.status(500).json({ message: err.message || 'Failed to update redundancy group' });
  }
});
