import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { searchForResources, deepResearch } from '../ai/resourceResearcher';
import { searchRelevantTweets } from '../ai/twitterService';

/**
 * Automated learning stream research job.
 * Runs 3 research methods in parallel after brainlift import completes.
 *
 * Queued from: runPostProcessingPipeline() after expert extraction
 */
export async function learningStreamResearchJob(
  payload: {
    brainliftId: number;
  },
  helpers: JobHelpers
) {
  const { brainliftId } = payload;

  helpers.logger.info('Starting learning stream research', { brainliftId });

  try {
    // Skip if pending items already exist (prevents duplicate AI calls)
    const stats = await storage.getLearningStreamStats(brainliftId);
    if (stats.pending > 0) {
      helpers.logger.info('Skipping - pending items exist', {
        brainliftId,
        pendingCount: stats.pending
      });
      return {
        success: true,
        skipped: true,
        reason: 'pending_items_exist',
        pendingCount: stats.pending,
      };
    }

    // Fetch brainlift data (with facts, experts, etc.)
    const brainlift = await storage.getBrainliftDataById(brainliftId);
    if (!brainlift) {
      throw new Error(`Brainlift not found: ${brainliftId}`);
    }
    const slug = brainlift.slug;

    // Get followed experts (sorted by rank score)
    const experts = await storage.getFollowedExperts(brainliftId);
    const sortedExperts = [...experts].sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
    const prioritizedExpertNames = sortedExperts.map(e => e.name);

    // Extract expert names from brainlift if no followed experts
    let expertNames = prioritizedExpertNames;
    if (expertNames.length === 0 && brainlift.originalContent) {
      const namePattern = /Who:\s*([^;]+?)(?:\s*;|$)/gi;
      const extractedNames: string[] = [];
      let match;
      while ((match = namePattern.exec(brainlift.originalContent)) !== null) {
        if (match[1]) {
          const name = match[1].trim().replace(/[;,].*$/, '').trim();
          if (name.length > 3 && name.length < 50) {
            extractedNames.push(name);
          }
        }
      }
      expertNames = Array.from(new Set(extractedNames)).slice(0, 10);
    }

    // Get existing feedback and graded sources (for AI learning)
    const [researchFeedback, tweetFeedback, gradedSources] = await Promise.all([
      storage.getSourceFeedback(brainliftId, 'research'),
      storage.getSourceFeedback(brainliftId, 'tweet'),
      storage.getGradedReadingList(brainliftId),
    ]);

    const researchFeedbackItems = researchFeedback.map(f => ({
      url: f.url,
      title: f.title,
      summary: f.snippet,
      decision: f.decision as 'accepted' | 'rejected',
    }));

    const tweetFeedbackItems = tweetFeedback.map(f => ({
      tweetId: f.sourceId,
      authorUsername: f.title,
      text: f.snippet,
      decision: f.decision as 'accepted' | 'rejected',
    }));

    const gradedSourceItems = gradedSources.map(item => ({
      type: item.type,
      author: item.author,
      topic: item.topic,
      url: item.url,
      quality: item.quality,
      aligns: item.aligns,
    }));

    // Run all 3 research methods in parallel
    const [quickResults, deepResults, tweetResults] = await Promise.allSettled([
      // Quick search
      searchForResources(
        brainlift.title,
        brainlift.description,
        [], // No existing topics to avoid (learning stream is fresh)
        researchFeedbackItems,
        gradedSourceItems,
        expertNames
      ).catch(err => {
        helpers.logger.error('Quick search failed', { error: err.message });
        return null;
      }),

      // Deep research
      deepResearch(
        brainlift.title,
        brainlift.description,
        brainlift.facts.map(f => f.fact),
        researchFeedbackItems,
        gradedSourceItems,
        expertNames
      ).catch(err => {
        helpers.logger.error('Deep research failed', { error: err.message });
        return null;
      }),

      // Twitter search
      (async () => {
        const facts = brainlift.facts.map(f => ({
          id: f.originalId || `${f.id}`,
          fact: f.fact,
          source: f.source || '',
        }));

        const expertSources = brainlift.facts
          .map(f => f.source || '')
          .filter(s => s.length > 0);

        const expertAuthors = brainlift.readingList
          .map(r => r.author || '')
          .filter(a => a.length > 0);

        const followedHandles = sortedExperts
          .filter(e => e.twitterHandle)
          .map(e => e.twitterHandle!.replace('@', ''));

        const prioritizedExperts = sortedExperts.map(e => ({
          name: e.name,
          handle: e.twitterHandle?.replace('@', ''),
        }));

        return searchRelevantTweets(
          brainlift.title,
          brainlift.description,
          facts,
          expertSources,
          expertAuthors,
          tweetFeedbackItems,
          gradedSourceItems,
          followedHandles,
          prioritizedExperts
        );
      })().catch(err => {
        helpers.logger.error('Twitter search failed', { error: err.message });
        return null;
      }),
    ]);

    // Collect all items to insert (parallel insert is safe - duplicates handled by DB constraint)
    const insertPromises: Promise<any>[] = [];

    // Quick search results
    if (quickResults.status === 'fulfilled' && quickResults.value?.resources) {
      for (const resource of quickResults.value.resources) {
        insertPromises.push(
          storage.addLearningStreamItem(brainliftId, {
            type: resource.type,
            author: resource.author,
            topic: resource.title || resource.topic,
            time: resource.time,
            facts: resource.summary || resource.relevance || '',
            url: resource.url,
            source: 'quick-search',
            relevanceScore: null,
            aiRationale: resource.relevance || null,
          })
        );
      }
    }

    // Deep research results
    if (deepResults.status === 'fulfilled' && deepResults.value?.resources) {
      for (const resource of deepResults.value.resources) {
        insertPromises.push(
          storage.addLearningStreamItem(brainliftId, {
            type: resource.type,
            author: resource.author,
            topic: resource.title || resource.topic,
            time: resource.time,
            facts: resource.summary || resource.relevance || '',
            url: resource.url,
            source: 'deep-research',
            relevanceScore: null,
            aiRationale: resource.relevance || null,
          })
        );
      }
    }

    // Tweet results
    if (tweetResults.status === 'fulfilled' && tweetResults.value?.tweets) {
      for (const tweet of tweetResults.value.tweets) {
        insertPromises.push(
          storage.addLearningStreamItem(brainliftId, {
            type: 'Twitter',
            author: tweet.authorUsername,
            topic: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
            time: '1 min',
            facts: tweet.dokRationale || '',
            url: tweet.url,
            source: 'twitter',
            relevanceScore: tweet.relevanceScore.toString(),
            aiRationale: `Matched facts: ${tweet.matchedFacts.join(', ')}. ${tweet.dokRationale}`,
          })
        );
      }
    }

    // Execute all inserts in parallel
    await Promise.all(insertPromises);
    const totalSaved = insertPromises.length;

    helpers.logger.info('Learning stream research completed', {
      brainliftId,
      slug,
      totalSaved,
      quickCount: quickResults.status === 'fulfilled' ? quickResults.value?.resources?.length || 0 : 0,
      deepCount: deepResults.status === 'fulfilled' ? deepResults.value?.resources?.length || 0 : 0,
      tweetCount: tweetResults.status === 'fulfilled' ? tweetResults.value?.tweets?.length || 0 : 0,
    });

    return {
      success: true,
      totalSaved,
      completedAt: new Date().toISOString(),
    };

  } catch (error: any) {
    console.error('[Learning Stream] Job failed:', error.message, error.stack);
    helpers.logger.error('Learning stream research job failed', {
      brainliftId,
      error: error.message,
      stack: error.stack,
    });

    // Don't throw - allow job to complete with error logged
    return {
      success: false,
      error: error.message,
      completedAt: new Date().toISOString(),
    };
  }
}
