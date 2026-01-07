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

// Detection patterns for DOK sections
const KNOWLEDGE_TREE_MARKER = "DOK 2 - Knowledge Tree";
const DOK1_PATTERNS = [/DOK1/i, /Category/i];

function isBulletPoint(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*') || /^\d+[\.\)]/.test(trimmed);
}

function cleanLine(line: string): string {
  return line.trim().replace(/^[-•*]\s*/, '').replace(/^\d+[\.\)]\s*/, '');
}

export async function extractBrainlift(markdownContent: string, sourceType: string): Promise<BrainliftOutput> {
  const lines = markdownContent.split('\n');
  const facts: any[] = [];
  let currentCategory = 'General';
  let inKnowledgeTree = false;
  let factIdCounter = 1;

  // Title extraction: use first H1 if available, otherwise first non-empty line
  let title = "Extracted Brainlift";
  const h1Match = lines.find(l => l.startsWith('# '));
  if (h1Match) {
    title = h1Match.replace('# ', '').trim();
  } else {
    const firstLine = lines.find(l => l.trim());
    if (firstLine) title = firstLine.trim().substring(0, 100);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect Knowledge Tree Section Header
    // We expect this to be a main header (H1 or H2)
    if (!inKnowledgeTree) {
      if (trimmed.includes(KNOWLEDGE_TREE_MARKER) || /^#+\s*Knowledge\s*Tree/i.test(trimmed)) {
        inKnowledgeTree = true;
      }
      continue;
    }

    // Check for Section Exit (if we hit another DOK section header at the same level)
    // For now, we process until the end of file or a higher-level header if we used H2
    if (trimmed.startsWith('# ') && inKnowledgeTree && !trimmed.includes(KNOWLEDGE_TREE_MARKER)) {
        // If we hit a new top-level header, we might have left the tree
        // But the user says DOK1s are subsections of the tree
    }

    // Subsection Header detection (Potential DOK1s)
    // Markdown headers like ## Subsection or ### Subsection
    if (trimmed.startsWith('#')) {
      const headerText = trimmed.replace(/^#+\s*/, '').trim();
      
      // If header contains DOK1, it's definitely a DOK1
      // If it's a subsection of the tree, it's a potential DOK1
      currentCategory = headerText;
      continue;
    }

    // Fact extraction (Bullet points under headers)
    if (isBulletPoint(line)) {
      const factText = cleanLine(line);
      if (factText.length > 5) {
        facts.push({
          id: `${factIdCounter++}`,
          category: currentCategory,
          source: null,
          fact: factText,
          score: 0,
          aiNotes: "Extracted from Markdown Knowledge Tree subsection.",
          contradicts: null,
          flags: []
        });
      }
    }
  }

  const finalResult = {
    classification: 'brainlift' as const,
    title,
    description: `Markdown-based DOK1 extraction from ${sourceType}`,
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
