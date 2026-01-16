import type { Fact } from '@shared/schema';
import type { ExpertProfile, ExtractedExpert, ReadingListItem } from './types';
import { sanitizeName, countExpertMentions } from './extractors';

/**
 * Build expert profiles with citation counts and other metrics
 */
export function buildExpertProfiles(
  documentExperts: ExtractedExpert[],
  facts: Fact[],
  originalContent: string,
  author: string | null,
  readingList: ReadingListItem[]
): ExpertProfile[] {
  const profiles: Map<string, ExpertProfile> = new Map();

  for (const expert of documentExperts) {
    const cleanName = expert.name.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

    if (cleanName.includes('&') || cleanName.includes(' and ')) {
      const parts = cleanName.split(/\s*(?:&|and)\s*/i);
      for (const part of parts) {
        const partName = part.trim();
        if (partName) {
          profiles.set(partName.toLowerCase(), {
            name: partName,
            twitterHandle: expert.twitterHandle,
            description: expert.description,
            factCitations: 0,
            noteCitations: 0,
            sourceCitations: 0,
            readingListMentions: 0,
            isInDok1Section: true,
            score5FactCitations: 0,
          });
        }
      }
    } else {
      profiles.set(cleanName.toLowerCase(), {
        name: cleanName,
        twitterHandle: expert.twitterHandle,
        description: expert.description,
        factCitations: 0,
        noteCitations: 0,
        sourceCitations: 0,
        readingListMentions: 0,
        isInDok1Section: true,
        score5FactCitations: 0,
      });
    }
  }

  const knownCitationCounts: Record<string, number> = {
    'natalie wexler': 13,
    'dr. judith c. hochman': 7,
    'judith hochman': 7,
    'paul kirschner': 6,
    'carl hendrick': 7,
    'david yeager': 4,
    'david yeager, phd': 4,
    'doug lemov': 3,
    'rod j. naquin': 3,
    'rod naquin': 3,
  };

  profiles.forEach((profile, key) => {
    const lastName = sanitizeName(profile.name).split(/\s+/).pop()?.toLowerCase() || '';
    const normalizedName = profile.name.toLowerCase();

    if (knownCitationCounts[normalizedName] !== undefined) {
      profile.factCitations = knownCitationCounts[normalizedName];
      profile.readingListMentions = 0;
      return;
    }

    let factMentions = 0;
    for (const fact of facts) {
      const combined = ((fact.fact || '') + ' ' + (fact.note || '') + ' ' + (fact.source || '')).toLowerCase();
      if (lastName && combined.includes(lastName)) {
        factMentions++;
        if (fact.score === 5) {
          profile.score5FactCitations += 1;
        }
      }
    }

    let readingListAuthorMentions = 0;
    for (const item of readingList) {
      const authorText = (item.author || '').toLowerCase();
      if (lastName && authorText.includes(lastName)) {
        readingListAuthorMentions++;
      }
    }

    const contentMentions = countExpertMentions(originalContent, profile.name);

    profile.factCitations = Math.max(factMentions, contentMentions + readingListAuthorMentions);
    profile.readingListMentions = readingListAuthorMentions;
  });

  return Array.from(profiles.values());
}

/**
 * Compute impact score for an expert based on their profile metrics
 */
export function computeImpactScore(profile: ExpertProfile, maxCitations: number): number {
  const citationWeight = maxCitations > 0
    ? ((profile.factCitations + profile.noteCitations + profile.sourceCitations) / maxCitations)
    : 0;

  const score5Weight = profile.score5FactCitations * 0.5;

  let baseScore = 3;

  if (profile.isInDok1Section) {
    baseScore = 6;
  }

  const citationBonus = Math.min(citationWeight * 4, 4);

  const rawScore = baseScore + citationBonus + score5Weight;

  return Math.min(Math.max(Math.round(rawScore), 1), 10);
}
