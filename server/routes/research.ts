import { Router } from 'express';
import { storage } from '../storage';
import { searchForResources, deepResearch } from '../ai/resourceResearcher';
import { searchRelevantTweets } from '../ai/twitterService';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

export const researchRouter = Router();

// Search for new resources using Perplexity
researchRouter.post('/api/brainlifts/:slug/research', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { mode, query } = req.body;
    const existingTopics = brainlift.readingList.map(r => r.topic);

    // Get experts sorted by rankScore (highest first) for prioritized search
    const experts = await storage.getFollowedExperts(brainlift.id);
    const sortedExperts = [...experts].sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
    let prioritizedExpertNames = sortedExperts.map(e => e.name);

    // If no followed experts, extract expert names from the brainlift's originalContent
    if (prioritizedExpertNames.length === 0 && brainlift.originalContent) {
      const extractedNames: string[] = [];

      // Extract expert names from "Who:" patterns in DOK1 section
      const namePatterns = [
        /Who:\s*([^;]+?)(?:\s*;|$)/gi,
        /Expert\s+\d+[:\s]+(?:Who:\s*)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      ];
      for (const pattern of namePatterns) {
        let match;
        while ((match = pattern.exec(brainlift.originalContent)) !== null) {
          if (match[1]) {
            const name = match[1].trim().replace(/[;,].*$/, '').trim();
            if (name.length > 3 && name.length < 50) {
              extractedNames.push(name);
            }
          }
        }
      }

      if (extractedNames.length > 0) {
        prioritizedExpertNames = Array.from(new Set(extractedNames)).slice(0, 10);
        console.log('Research: Using extracted expert names from brainlift content:', prioritizedExpertNames);
      }
    }

    // Get existing feedback for research sources to improve results
    const existingFeedback = await storage.getSourceFeedback(brainlift.id, 'research');
    const feedbackItems = existingFeedback.map(f => ({
      url: f.url,
      title: f.title,
      summary: f.snippet,
      decision: f.decision as 'accepted' | 'rejected',
    }));

    // Get graded sources to inform quality preferences
    const gradedReadingList = await storage.getGradedReadingList(brainlift.id);
    const gradedSources = gradedReadingList.map(item => ({
      type: item.type,
      author: item.author,
      topic: item.topic,
      url: item.url,
      quality: item.quality,
      aligns: item.aligns,
    }));

    let result;
    if (mode === 'deep') {
      const factTexts = brainlift.facts.map(f => f.fact);
      result = await deepResearch(
        brainlift.title,
        brainlift.description,
        factTexts,
        feedbackItems,
        gradedSources,
        prioritizedExpertNames,
        query
      );
    } else {
      result = await searchForResources(
        brainlift.title,
        brainlift.description,
        existingTopics,
        feedbackItems,
        gradedSources,
        prioritizedExpertNames
      );
    }

    res.json(result);
  } catch (err: any) {
    console.error('Research error:', err);
    res.status(500).json({ message: err.message || 'Failed to perform research' });
  }
});

// Add a resource from research to reading list
researchRouter.post('/api/brainlifts/:slug/reading-list', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { type, author, topic, time, facts, url } = req.body;

    const newItem = await storage.addReadingListItem(brainlift.id, {
      type,
      author,
      topic,
      time,
      facts: facts || '',
      url,
    });

    res.json(newItem);
  } catch (err: any) {
    console.error('Add reading list item error:', err);
    res.status(500).json({ message: err.message || 'Failed to add reading list item' });
  }
});

// Search Twitter for relevant tweets
researchRouter.post('/api/brainlifts/:slug/tweets', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const facts = brainlift.facts.map(f => ({
      id: f.originalId || `${f.id}`,
      fact: f.fact,
      source: f.source || '',
    }));

    // Extract expert names from fact sources and reading list authors
    const expertSources = brainlift.facts
      .map(f => f.source || '')
      .filter(s => s.length > 0);

    const expertAuthors = brainlift.readingList
      .map(r => r.author || '')
      .filter(a => a.length > 0);

    // Get followed experts sorted by rankScore (highest first) to prioritize their tweets
    const followedExperts = await storage.getFollowedExperts(brainlift.id);
    const sortedExperts = [...followedExperts].sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

    // CRITICAL: Extract expert handles from originalContent if no followed experts
    // This ensures we search for the actual experts mentioned in the brainlift
    const extractedHandles: string[] = [];
    const extractedNames: string[] = [];

    if (brainlift.originalContent) {
      // Extract Twitter handles like @TheWritingRev, @natwexler, @Doug_Lemov
      // IMPORTANT: Preserve original casing - Twitter API from: queries are case-sensitive
      const handleMatches = brainlift.originalContent.match(/@([A-Za-z0-9_]+)/g);
      if (handleMatches) {
        for (const h of handleMatches) {
          const clean = h.replace('@', '');
          const lowerClean = clean.toLowerCase();
          // Filter out common non-person handles
          if (!['gmail', 'email', 'http', 'https', 'assets', 'media'].includes(lowerClean) && clean.length > 2) {
            extractedHandles.push(clean); // Keep original casing
          }
        }
      }

      // Extract expert names like "Dr. Judith C. Hochman", "Natalie Wexler", "Doug Lemov"
      const namePatterns = [
        /Who:\s*([^;]+?)(?:\s*;|$)/gi,
        /Expert\s+\d+[:\s]+(?:Who:\s*)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      ];
      for (const pattern of namePatterns) {
        let match;
        while ((match = pattern.exec(brainlift.originalContent)) !== null) {
          if (match[1]) {
            const name = match[1].trim().replace(/[;,].*$/, '').trim();
            if (name.length > 3 && name.length < 50) {
              extractedNames.push(name);
            }
          }
        }
      }
    }

    // Combine followed experts with extracted handles
    let followedHandles = sortedExperts
      .filter(e => e.twitterHandle)
      .map(e => e.twitterHandle!.replace('@', ''));

    // If no followed experts, use extracted handles from content
    if (followedHandles.length === 0 && extractedHandles.length > 0) {
      followedHandles = Array.from(new Set(extractedHandles)).slice(0, 10);
      console.log('Using extracted expert handles:', followedHandles);
    }

    // Build expert objects with name and handle properly paired for similar accounts
    let prioritizedExperts = sortedExperts.map(e => ({
      name: e.name,
      handle: e.twitterHandle?.replace('@', ''),
    }));

    // If no followed experts, use extracted names
    if (prioritizedExperts.length === 0 && extractedNames.length > 0) {
      prioritizedExperts = Array.from(new Set(extractedNames)).slice(0, 10).map(name => ({
        name,
        handle: undefined,
      }));
      console.log('Using extracted expert names:', extractedNames.slice(0, 10));
    }

    // Get existing feedback to improve search
    const existingFeedback = await storage.getSourceFeedback(brainlift.id, 'tweet');
    const feedbackItems = existingFeedback.map(f => ({
      tweetId: f.sourceId,
      authorUsername: f.title,
      text: f.snippet,
      decision: f.decision as 'accepted' | 'rejected',
    }));

    // Get graded sources to inform quality preferences
    const gradedReadingList = await storage.getGradedReadingList(brainlift.id);
    const gradedSources = gradedReadingList.map(item => ({
      type: item.type,
      author: item.author,
      topic: item.topic,
      url: item.url,
      quality: item.quality,
      aligns: item.aligns,
    }));

    const result = await searchRelevantTweets(
      brainlift.title,
      brainlift.description,
      facts,
      expertSources,
      expertAuthors,
      feedbackItems,
      gradedSources,
      followedHandles,
      prioritizedExperts
    );

    res.json(result);
  } catch (err: any) {
    console.error('Twitter search error:', err);
    res.status(500).json({ message: err.message || 'Failed to search tweets' });
  }
});

// Get source feedback for a brainlift (tweets and research)
researchRouter.get('/api/brainlifts/:slug/feedback', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canAccessBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const sourceType = req.query.sourceType as string | undefined;
    const feedback = await storage.getSourceFeedback(brainlift.id, sourceType);
    res.json(feedback);
  } catch (err: any) {
    console.error('Get source feedback error:', err);
    res.status(500).json({ message: err.message || 'Failed to get source feedback' });
  }
});

// Save source feedback (accept/reject) - unified endpoint for tweets and research
researchRouter.post('/api/brainlifts/:slug/feedback', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const feedbackSchema = z.object({
      sourceId: z.string(),
      sourceType: z.enum(['tweet', 'research']),
      title: z.string(),
      snippet: z.string(),
      url: z.string(),
      decision: z.enum(['accepted', 'rejected']),
    });

    const validated = feedbackSchema.parse(req.body);

    const saved = await storage.saveSourceFeedback({
      brainliftId: brainlift.id,
      ...validated,
    });

    res.json(saved);
  } catch (err: any) {
    console.error('Save source feedback error:', err);
    res.status(500).json({ message: err.message || 'Failed to save source feedback' });
  }
});
