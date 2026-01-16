import { Router } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { facts, factVerifications, factModelScores, llmFeedback, factRedundancyGroups } from '@shared/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';

export const redundancyRouter = Router();

// Analyze facts for redundancy
redundancyRouter.post(
  '/api/brainlifts/:slug/analyze-redundancy',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    const { analyzeFactRedundancy } = await import('../ai/redundancyAnalyzer');
    const factsData = await storage.getFactsForBrainlift(brainlift.id);

    const result = await analyzeFactRedundancy(factsData);

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
  })
);

// Get redundancy groups for a brainlift
redundancyRouter.get(
  '/api/brainlifts/:slug/redundancy',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    const groups = await storage.getRedundancyGroups(brainlift.id);
    const factsData = await storage.getFactsForBrainlift(brainlift.id);

    // Build a fact lookup map
    const factMap = new Map(factsData.map(f => [f.id, f]));

    // Calculate stats
    const allRedundantFactIds = new Set<number>();
    groups.filter(g => g.status === 'pending').forEach(g => {
      g.factIds.forEach(id => allRedundantFactIds.add(id));
    });

    const pendingGroups = groups.filter(g => g.status === 'pending');
    const uniqueFactCount = factsData.length - allRedundantFactIds.size + pendingGroups.length;

    res.json({
      groups: groups.map(g => ({
        ...g,
        facts: g.factIds.map(id => factMap.get(id)).filter(Boolean),
        primaryFact: factMap.get(g.primaryFactId || 0),
      })),
      stats: {
        totalFacts: factsData.length,
        uniqueFactCount,
        redundantFactCount: allRedundantFactIds.size - pendingGroups.length,
        pendingReview: pendingGroups.length,
      },
    });
  })
);

// Update redundancy group status (keep, dismiss, merge)
// When status='kept' and primaryFactId is provided, deletes other facts in the group
redundancyRouter.patch(
  '/api/brainlifts/:slug/redundancy-groups/:groupId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      throw new BadRequestError('Invalid group ID');
    }
    const brainliftId = req.brainlift!.id;
    const { status, primaryFactId } = req.body;

    if (!['pending', 'kept', 'merged', 'dismissed'].includes(status)) {
      throw new BadRequestError('Invalid status');
    }

    // Verify the group belongs to this brainlift
    const group = await storage.getRedundancyGroupForBrainlift(groupId, brainliftId);
    if (!group) {
      throw new NotFoundError('Redundancy group not found');
    }

    // If keeping with a primary fact, delete the redundant facts
    if (status === 'kept' && primaryFactId && group.factIds) {
      // Delete all facts in the group EXCEPT the primary one
      const factIdsToDelete = (group.factIds as number[]).filter(id => id !== primaryFactId);

      if (factIdsToDelete.length > 0) {
        // Verify ALL facts belong to this brainlift before deletion
        const factsInBrainlift = await db.select({ id: facts.id })
          .from(facts)
          .where(and(
            inArray(facts.id, factIdsToDelete),
            eq(facts.brainliftId, brainliftId)
          ));

        if (factsInBrainlift.length !== factIdsToDelete.length) {
          throw new NotFoundError('Some facts do not belong to this brainlift');
        }

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

      // Update the group's primaryFactId and factIds to only contain the kept fact
      await db.update(factRedundancyGroups)
        .set({
          status,
          primaryFactId,
          factIds: [primaryFactId]
        })
        .where(and(
          eq(factRedundancyGroups.id, groupId),
          eq(factRedundancyGroups.brainliftId, brainliftId)
        ));
    }

    const updated = await storage.updateRedundancyGroupStatusForBrainlift(groupId, brainliftId, status);
    if (!updated) {
      throw new NotFoundError('Redundancy group not found');
    }
    res.json(updated);
  })
);
