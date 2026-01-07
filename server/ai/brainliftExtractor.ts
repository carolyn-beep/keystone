import { z } from 'zod';
import { CLASSIFICATION } from '@shared/schema';

const brainliftOutputSchema = z.object({
  classification: z.enum(['brainlift', 'partial', 'not_brainlift']),
  improperlyFormatted: z.boolean().optional(),
  rejectionReason: z.string().nullable().optional(),
  rejectionSubtype: z.string().nullable().optional(),
  rejectionRecommendation: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  summary: z.object({
    totalFacts: z.number(),
    meanScore: z.string(),
    score5Count: z.number(),
    contradictionCount: z.number(),
  }),
  facts: z.array(z.object({
    id: z.string(),
    category: z.string(),
    source: z.string().nullable(),
    fact: z.string(),
    score: z.number().min(0).max(5),
    aiNotes: z.string(),
    contradicts: z.string().nullable(),
    flags: z.array(z.string()).optional(),
  })),
  contradictionClusters: z.array(z.object({
    name: z.string(),
    factIds: z.array(z.string()),
    claims: z.array(z.string()),
    tension: z.string(),
    status: z.string(),
  })),
  readingList: z.array(z.object({
    type: z.string(),
    author: z.string(),
    topic: z.string(),
    time: z.string(),
    facts: z.string(),
    url: z.string(),
  })),
});

export type BrainliftOutput = z.infer<typeof brainliftOutputSchema>;

// Regex patterns for section detection
const KNOWLEDGE_TREE_PATTERNS = [
  /DOK\s*2\s*-\s*Knowledge\s*Tree/i,
  /DOK2/i,
  /Knowledge\s*Tree/i
];

const DOK1_PATTERNS = [
  /Category/i,
  /DOK1/i
];

function isBulletPoint(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*') || /^\d+[\.\)]/.test(trimmed);
}

function cleanLine(line: string): string {
  return line.trim().replace(/^[-•*]\s*/, '').replace(/^\d+[\.\)]\s*/, '');
}

export async function extractBrainlift(content: string, sourceType: string): Promise<BrainliftOutput> {
  const lines = content.split('\n');
  const facts: any[] = [];
  let currentCategory = 'General';
  let inKnowledgeTree = false;
  let factIdCounter = 1;

  // Simple title extraction from first non-empty line
  const title = lines.find(l => l.trim())?.trim().substring(0, 100) || "Extracted Brainlift";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Look for Knowledge Tree Header if not found yet
    if (!inKnowledgeTree) {
      if (KNOWLEDGE_TREE_PATTERNS.some(p => p.test(trimmed))) {
        inKnowledgeTree = true;
      }
      continue;
    }

    // Inside Knowledge Tree: check for DOK1/Category headers
    const isSubsectionHeader = trimmed.startsWith('#') || (trimmed.startsWith('**') && trimmed.endsWith('**'));
    
    if (isSubsectionHeader) {
      if (DOK1_PATTERNS.some(p => p.test(trimmed))) {
        currentCategory = trimmed.replace(/[#*]/g, '').trim();
      } else {
        // If it's a header but not explicitly DOK1, it's still a potential category/DOK1 in the tree
        currentCategory = trimmed.replace(/[#*]/g, '').trim();
      }
      continue;
    }

    // Extract facts (bullet points)
    if (isBulletPoint(line)) {
      const factText = cleanLine(line);
      if (factText.length > 10) {
        facts.push({
          id: `${factIdCounter++}`,
          category: currentCategory,
          source: null, // Basic extraction doesn't parse source yet
          fact: factText,
          score: 0, // No grading as requested
          aiNotes: "Extracted via regex pattern matching.",
          contradicts: null,
          flags: []
        });
      }
    }
  }

  const finalResult = {
    classification: 'brainlift' as const,
    title,
    description: `DOK1 extraction from ${sourceType}`,
    summary: {
      totalFacts: facts.length,
      meanScore: "0",
      score5Count: 0,
      contradictionCount: 0
    },
    facts,
    contradictionClusters: [],
    readingList: []
  };

  return brainliftOutputSchema.parse(finalResult);
}
