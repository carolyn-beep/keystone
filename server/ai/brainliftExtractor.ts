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

function isBulletPoint(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*') || /^\d+[\.\)]/.test(trimmed);
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function cleanLine(line: string): string {
  return line.trim().replace(/^[-•*]\s*/, '').replace(/^\d+[\.\)]\s*/, '');
}

export async function extractBrainlift(markdownContent: string, sourceType: string): Promise<BrainliftOutput> {
  const lines = markdownContent.split('\n');
  const facts: any[] = [];
  let factIdCounter = 1;
  
  let inKnowledgeTree = false;
  let inDOK1Facts = false;
  let dok1IndentLevel = -1;
  let rootFactIndentLevel = -1;
  let currentCategory = 'General';
  let currentSource = 'Unknown';
  let currentFactBuffer: string[] = [];

  const flushFact = () => {
    if (currentFactBuffer.length > 0) {
      facts.push({
        id: `${factIdCounter++}`,
        category: currentCategory,
        source: currentSource,
        fact: currentFactBuffer.join('\n'),
        score: 0,
        aiNotes: `Source: ${currentSource} | Category: ${currentCategory}`,
        contradicts: null,
        flags: []
      });
      currentFactBuffer = [];
      rootFactIndentLevel = -1;
    }
  };

  // Title extraction
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

    const indent = getIndentLevel(line);
    const cleaned = cleanLine(line);

    // 1. Detect Knowledge Tree Entry
    if (!inKnowledgeTree) {
      if (/DOK\s*2\s*-\s*Knowledge\s*Tree/i.test(cleaned) || /^#+\s*Knowledge\s*Tree/i.test(line)) {
        inKnowledgeTree = true;
      }
      continue;
    }

    // 2. Identify Categories and Sources (Context)
    if (/^Category\s*\d+/i.test(cleaned)) {
      flushFact();
      currentCategory = cleaned;
      inDOK1Facts = false;
      continue;
    }

    if (/^Source\s*\d+/i.test(cleaned)) {
      flushFact();
      currentSource = cleaned;
      inDOK1Facts = false;
      continue;
    }

    // 3. Detect DOK 1 - Facts start
    if (/DOK\s*1\s*-\s*Facts/i.test(cleaned)) {
      flushFact();
      inDOK1Facts = true;
      dok1IndentLevel = indent;
      continue;
    }

    // 4. Exit DOK 1 - Facts
    if (inDOK1Facts) {
      const isNewSection = /DOK\s*2\s*-\s*Summary/i.test(cleaned) || /Link/i.test(cleaned);
      const isHigherHeader = indent <= dok1IndentLevel && !isBulletPoint(line);
      
      if (isNewSection || (indent > 0 && isHigherHeader)) {
        flushFact();
        inDOK1Facts = false;
        continue;
      }

      // 5. Extract Facts (Grouped)
      if (isBulletPoint(line) && indent > dok1IndentLevel) {
        // If this is the first bullet in the DOK1 section, it defines the root fact level
        if (rootFactIndentLevel === -1) {
          rootFactIndentLevel = indent;
        }

        // New fact starts when we hit a bullet at the root fact level
        if (indent === rootFactIndentLevel) {
          flushFact();
          currentFactBuffer.push(cleaned);
        } else if (indent > rootFactIndentLevel) {
          // Nested content: treat as part of the current fact
          // Preserve relative indentation for visual hierarchy within the fact
          const relativeIndent = '  '.repeat(Math.max(0, Math.floor((indent - rootFactIndentLevel) / 2)));
          currentFactBuffer.push(`${relativeIndent}- ${cleaned}`);
        }
      } else if (!isBulletPoint(line) && indent > dok1IndentLevel && currentFactBuffer.length > 0) {
        // Non-bulleted line but indented under DOK1: likely a continuation of the previous bullet
        const relativeIndent = '  '.repeat(Math.max(0, Math.floor((indent - rootFactIndentLevel) / 2)));
        currentFactBuffer.push(`${relativeIndent}${trimmed}`);
      }
    }
  }

  flushFact(); // Final flush

  const finalResult = {
    classification: 'brainlift' as const,
    title,
    description: `Grouped DOK1 extraction from ${sourceType}`,
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
