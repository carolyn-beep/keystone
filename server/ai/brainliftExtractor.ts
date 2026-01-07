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

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function cleanHeader(line: string): string {
  return line.trim().replace(/^[-•*]\s*/, '').replace(/^#+\s*/, '').replace(/\*\*+/g, '').replace(/[:]$/, '').trim();
}

export async function extractBrainlift(markdownContent: string, sourceType: string): Promise<BrainliftOutput> {
  const lines = markdownContent.split('\n');
  const facts: any[] = [];
  let factIdCounter = 1;
  
  let inKnowledgeTree = false;
  let inDOK1Section = false;
  let sectionIndentLevel = -1;
  let currentCategory = 'General';
  let currentSource = 'Unknown';
  let sectionBuffer: string[] = [];

  const flushSection = () => {
    if (sectionBuffer.length > 0) {
      // Join buffer and clean up leading bullets/whitespace from the whole block
      const factText = sectionBuffer.join('\n').trim();
      if (factText.length > 10) {
        facts.push({
          id: `${factIdCounter++}`,
          category: currentCategory,
          source: currentSource,
          fact: factText,
          score: 0,
          aiNotes: `Source: ${currentSource} | Category: ${currentCategory}`,
          contradicts: null,
          flags: []
        });
      }
      sectionBuffer = [];
    }
  };

  // Title extraction
  let title = "Extracted Brainlift";
  const h1Match = lines.find(l => l.trim().startsWith('# '));
  if (h1Match) {
    title = cleanHeader(h1Match);
  } else {
    const firstLine = lines.find(l => l.trim());
    if (firstLine) title = firstLine.trim().substring(0, 100);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed && !inDOK1Section) continue;

    const indent = getIndentLevel(line);
    const cleaned = cleanHeader(line);

    // 1. Detect Knowledge Tree Entry
    if (!inKnowledgeTree) {
      if (/DOK\s*2\s*-\s*Knowledge\s*Tree/i.test(cleaned) || /^#+\s*Knowledge\s*Tree/i.test(line)) {
        inKnowledgeTree = true;
      }
      continue;
    }

    // 2. Identify Context (Categories and Sources)
    if (/^Category\s*\d+/i.test(cleaned)) {
      if (inDOK1Section) flushSection();
      currentCategory = cleaned;
      inDOK1Section = false;
      continue;
    }

    if (/^Source\s*\d+/i.test(cleaned)) {
      if (inDOK1Section) flushSection();
      currentSource = cleaned;
      inDOK1Section = false;
      continue;
    }

    // 3. Detect DOK 1 Entry Point
    // A DOK1 can be a section named "DOK 1 - Facts" or a subsection explicitly labeled "DOK1"
    if (/DOK\s*1\s*-\s*Facts/i.test(cleaned) || /DOK1/i.test(cleaned)) {
      if (inDOK1Section) flushSection();
      inDOK1Section = true;
      sectionIndentLevel = indent;
      continue;
    }

    // 4. Handle Content inside DOK1 Section
    if (inDOK1Section) {
      // Exit criteria: 
      // - Next DOK section (DOK 2 - Summary)
      // - Link section
      // - A header/node at the same or higher level than the DOK1 header
      const isNewDOK = /DOK\s*2\s*-\s*Summary/i.test(cleaned) || /DOK\s*2/i.test(cleaned);
      const isExitSection = /Link/i.test(cleaned) || /Source\s*\d+/i.test(cleaned) || /^Category\s*\d+/i.test(cleaned);
      const isHigherLevel = indent <= sectionIndentLevel && trimmed.length > 0;

      if (isNewDOK || isExitSection || isHigherLevel) {
        flushSection();
        inDOK1Section = false;
        
        // If it was a category or source, let the next iteration handle context update
        if (isExitSection || /^Category|^Source/i.test(cleaned)) {
          i--; // Re-process this line to catch context
        }
        continue;
      }

      // Add line to buffer, preserving relative indentation
      sectionBuffer.push(line);
    }
  }

  flushSection();

  const finalResult = {
    classification: 'brainlift' as const,
    title,
    description: `Section-based DOK1 extraction from ${sourceType}`,
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
