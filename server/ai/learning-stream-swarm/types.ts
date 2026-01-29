/**
 * Shared types for the Learning Stream Swarm
 */

export interface BrainliftContext {
  id: number;
  title: string;
  description: string;
  displayPurpose: string | null;
  facts: Array<{
    id: number;
    fact: string;
    category: string;
    score: number;
  }>;
  experts: Array<{
    id: number;
    name: string;
    twitterHandle: string | null;
    rankScore: number | null;
  }>;
  existingTopics: string[];
}

export interface LearningResourceItem {
  type: 'Substack' | 'Twitter' | 'Blog' | 'Research' | 'Academic Paper' | 'Podcast' | 'Video';
  author: string;
  topic: string;
  time: string;
  facts: string;
  url: string;
  relevanceScore: string;
  aiRationale: string;
}

export interface SwarmResult {
  success: boolean;
  totalSaved: number;
  duplicatesSkipped: number;
  errors: string[];
  durationMs: number;
}

export interface ResearchTask {
  taskNumber: number;
  resourceType: string;
  searchFocus: string;
  expertName?: string;
}

export const RESOURCE_TYPE_DISTRIBUTION = {
  Substack: 4,
  'Academic Paper': 3,
  Twitter: 3,
  Blog: 3,
  Research: 3,
  Podcast: 2,
  Video: 2,
} as const;

export type ResourceType = keyof typeof RESOURCE_TYPE_DISTRIBUTION;
